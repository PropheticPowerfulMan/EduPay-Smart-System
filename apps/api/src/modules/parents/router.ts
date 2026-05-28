import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { AgreementStatus, PaymentOptionType } from "@prisma/client";
import { createOrbitParent, deleteOrbitFamily, matchesSharedParentIdentifier, orbitRegistryIsEnabled, syncOrbitRegistryMirror, updateOrbitParent } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";
import { env } from "../../config/env";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail, sendSms } from "../../utils/messaging";
import { createSpecialFinancialAgreement, getPaymentOptionLabel, upsertParentPlanAssignment } from "../finance/service";
import { notifyParentEntityChange } from "../notifications/entityChange";

type OwnerAgreementInstallmentMode = "ONE_TIME" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS";

function generateAccessCode() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ACC-PAR-${suffix}`;
}

async function generateUniqueParentAccessCode(tx: typeof prisma) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const accessCode = generateAccessCode();
    const existing = await tx.user.findUnique({ where: { accessCode } });
    if (!existing) return accessCode;
  }

  return `ACC-PAR-${Date.now().toString(36).toUpperCase()}`;
}

const studentInputSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().min(1),
  gender: z.enum(["F", "M", "O", ""]).optional().default(""),
  classId: z.string().min(1),
  annualFee: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v))),
  paymentOptionType: z.nativeEnum(PaymentOptionType).optional().default(PaymentOptionType.STANDARD_MONTHLY),
  specialAgreement: z.object({
    title: z.string().optional().default(""),
    customTotal: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v))),
    reductionAmount: z.union([z.string(), z.number()]).optional().transform((v) => v === undefined ? 0 : parseFloat(String(v))),
    notes: z.string().optional().default(""),
    installmentMode: z.enum(["ONE_TIME", "TWO_INSTALLMENTS", "THREE_INSTALLMENTS"]).optional().default("THREE_INSTALLMENTS")
  }).optional()
});

const parentSchema = z.object({
  fullName: z.string().min(1),
  nom: z.string().optional().default(""),
  postnom: z.string().optional().default(""),
  prenom: z.string().optional().default(""),
  phone: z.string().min(6),
  email: z.string().email(),
  physicalAddress: z.string().optional().default(""),
  photoUrl: z.string().optional().default(""),
  preferredLanguage: z.enum(["fr", "en"]).default("fr"),
  notifyEmail: z.boolean().optional().default(true),
  notifySms: z.boolean().optional().default(true),
  students: z.array(studentInputSchema).optional().default([])
});

const notificationPreferenceSchema = z.object({
  notifyEmail: z.boolean().optional().default(true),
  notifySms: z.boolean().optional().default(true)
});

function generateTemporaryPassword() {
  return `KCS-${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
}

function buildReadableEntityId(prefix: "PAR" | "STU", fullName: string) {
  const tokens = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  const safeTokens = tokens.length ? tokens : [prefix === "PAR" ? "PARENT" : "STUDENT"];
  return `${prefix}-KCS-${safeTokens.join("-")}`;
}

function buildAcademicDueDate(month: number, day: number) {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year = month >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function toCurrencyNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildOwnerAgreementInstallments(customTotal: number, reductionAmount = 0, installmentMode: OwnerAgreementInstallmentMode = "THREE_INSTALLMENTS") {
  const safeTotal = Math.max(Number(customTotal || 0), 0);
  const safeReduction = Math.max(Number(reductionAmount || 0), 0);
  const balanceDue = roundCurrency(Math.max(safeTotal - safeReduction, 0));
  if (balanceDue <= 0) return [];

  if (installmentMode === "ONE_TIME") {
    return [
      { label: "Versement unique", dueDate: buildAcademicDueDate(8, 31), amountDue: balanceDue, notes: "Created during parent onboarding" }
    ];
  }

  if (installmentMode === "TWO_INSTALLMENTS") {
    const first = roundCurrency(balanceDue * 0.6);
    const second = roundCurrency(balanceDue - first);
    return [
      { label: "Premier versement", dueDate: buildAcademicDueDate(8, 31), amountDue: first, notes: "Created during parent onboarding" },
      { label: "Solde", dueDate: buildAcademicDueDate(1, 31), amountDue: second, notes: "Created during parent onboarding" }
    ];
  }

  const first = roundCurrency(balanceDue * 0.4);
  const second = roundCurrency(balanceDue * 0.3);
  const third = roundCurrency(balanceDue - first - second);

  return [
    { label: "Engagement initial", dueDate: buildAcademicDueDate(8, 31), amountDue: first, notes: "Created during parent onboarding" },
    { label: "Régularisation mi-année", dueDate: buildAcademicDueDate(1, 31), amountDue: second, notes: "Created during parent onboarding" },
    { label: "Solde final", dueDate: buildAcademicDueDate(5, 31), amountDue: third, notes: "Created during parent onboarding" }
  ];
}

function hasSpecialAgreementChanged(
  specialAgreement: { title?: string; customTotal?: number; reductionAmount?: number; notes?: string; installmentMode?: OwnerAgreementInstallmentMode } | undefined,
  currentAgreement: {
    title?: string | null;
    customTotal?: number | null;
    reductionAmount?: number | null;
    notes?: string | null;
    installments?: Array<{ label?: string | null; dueDate?: Date | null; amountDue?: number | null }>;
  } | null | undefined,
  annualFee: number
) {
  const expectedInstallments = buildOwnerAgreementInstallments(
    toCurrencyNumber(specialAgreement?.customTotal ?? annualFee),
    toCurrencyNumber(specialAgreement?.reductionAmount ?? 0),
    specialAgreement?.installmentMode ?? "THREE_INSTALLMENTS"
  );
  const currentInstallments = (currentAgreement?.installments ?? []).map((installment) => ({
    label: String(installment.label || "").trim(),
    dueDate: installment.dueDate ? new Date(installment.dueDate).toISOString() : "",
    amountDue: roundCurrency(toCurrencyNumber(installment.amountDue))
  }));
  const expectedInstallmentSignature = JSON.stringify(expectedInstallments.map((installment) => ({
    label: String(installment.label || "").trim(),
    dueDate: installment.dueDate,
    amountDue: roundCurrency(toCurrencyNumber(installment.amountDue))
  })));
  const currentInstallmentSignature = JSON.stringify(currentInstallments);

  if (!specialAgreement) {
    return !currentAgreement
      || roundCurrency(Number(currentAgreement.customTotal || 0)) !== roundCurrency(Number(annualFee || 0))
      || currentInstallmentSignature !== expectedInstallmentSignature;
  }

  return (specialAgreement.title || "").trim() !== String(currentAgreement?.title || "").trim()
    || roundCurrency(toCurrencyNumber(specialAgreement.customTotal)) !== roundCurrency(toCurrencyNumber(currentAgreement?.customTotal))
    || roundCurrency(toCurrencyNumber(specialAgreement.reductionAmount)) !== roundCurrency(toCurrencyNumber(currentAgreement?.reductionAmount))
    || (specialAgreement.notes || "").trim() !== String(currentAgreement?.notes || "").trim()
    || currentInstallmentSignature !== expectedInstallmentSignature;
}

async function generateUniqueParentId(tx: typeof prisma, schoolId: string, fullName: string) {
  const baseId = buildReadableEntityId("PAR", fullName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateId = attempt === 0 ? baseId : `${baseId}-${String(attempt + 1).padStart(2, "0")}`;
    const existing = await tx.parent.findFirst({
      where: { id: candidateId, schoolId },
      select: { id: true }
    });
    if (!existing) return candidateId;
  }

  return `${baseId}-${Date.now().toString().slice(-6)}`;
}

async function generateUniqueStudentId(tx: typeof prisma, schoolId: string, fullName: string) {
  const baseId = buildReadableEntityId("STU", fullName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateId = attempt === 0 ? baseId : `${baseId}-${String(attempt + 1).padStart(2, "0")}`;
    const existing = await tx.student.findFirst({
      where: { id: candidateId, schoolId },
      select: { id: true }
    });
    if (!existing) return candidateId;
  }

  return `${baseId}-${Date.now().toString().slice(-6)}`;
}

function normalizeMessageLanguage(language?: string | null): "fr" | "en" {
  return String(language ?? "fr").toLowerCase().startsWith("en") ? "en" : "fr";
}

function buildParentWelcomeMessages(parent: any, temporaryPassword: string, loginEmail: string) {
  const language = normalizeMessageLanguage(parent.preferredLanguage);
  const students = (parent.students || []).map((student: any) => ({
    fullName: student.fullName,
    className: student.class?.name ?? student.className ?? student.classId ?? (language === "en" ? "Class not provided" : "Classe non renseignée"),
    annualFee: Number(student.annualFee || 0)
  }));
  const studentLines = students.length
    ? students.map((student: any) => language === "en"
      ? `- ${student.fullName} | Class: ${student.className} | Annual fees: $ ${student.annualFee.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
      : `- ${student.fullName} | Classe: ${student.className} | Frais annuels: $ ${student.annualFee.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    ).join("\n")
    : language === "en" ? "- No linked student yet" : "- Aucun élève rattaché pour le moment";

  if (language === "en") {
    const subject = "Your EduPay access";
    const emailBody = [
      `Hello ${parent.fullName},`,
      "",
      "Your EduPay parent account has just been created by the school administration.",
      "",
      `Parent ID: ${parent.id}`,
      `Access code: ${parent.accessCode || "Not provided"}`,
      `Phone: ${parent.phone || "Not provided"}`,
      `Login identifier: ${loginEmail}`,
      `Temporary password: ${temporaryPassword}`,
      "",
      "Linked children:",
      studentLines,
      "",
      "For your security, please sign in and change this temporary password from your profile."
    ].join("\n");
    const smsBody = `EduPay: account created for ${parent.fullName}. Code: ${parent.accessCode || "N/A"}. Login: ${loginEmail}. Temporary password: ${temporaryPassword}. Change it after signing in.`;
    return { subject, emailBody, smsBody };
  }

  const subject = "Vos accès EduPay";
  const emailBody = [
    `Bonjour ${parent.fullName},`,
    "",
    "Votre compte parent EduPay vient d'être créé par l'administration de l'école.",
    "",
    `Identifiant parent : ${parent.id}`,
    `Code d'accès : ${parent.accessCode || "Non renseigné"}`,
    `Téléphone : ${parent.phone || "Non renseigné"}`,
    `Identifiant de connexion : ${loginEmail}`,
    `Mot de passe temporaire : ${temporaryPassword}`,
    "",
    "Enfants rattachés :",
    studentLines,
    "",
    "Pour votre sécurité, connectez-vous puis changez ce mot de passe depuis votre profil."
  ].join("\n");
  const smsBody = `EduPay : compte créé pour ${parent.fullName}. Code : ${parent.accessCode || "N/A"}. Identifiant : ${loginEmail}. Mot de passe temporaire : ${temporaryPassword}. Changez-le après connexion.`;
  return { subject, emailBody, smsBody };
}

async function sendParentWelcomeNotifications(
  parent: any,
  temporaryPassword: string,
  schoolId: string,
  preferences: { notifyEmail?: boolean; notifySms?: boolean } = {}
) {
  const loginEmail = parent.email;
  const messages = buildParentWelcomeMessages(parent, temporaryPassword, loginEmail);
  const notifyEmail = preferences.notifyEmail ?? true;
  const notifySms = preferences.notifySms ?? true;
  const status = {
    email: notifyEmail && parent.email ? "PENDING" : "SKIPPED",
    sms: notifySms && parent.phone ? "PENDING" : "SKIPPED"
  };

  if (notifyEmail && parent.email) {
    status.email = await sendEmail({
      to: parent.email,
      subject: messages.subject,
      text: messages.emailBody
    });
    await prisma.notificationLog.create({
      data: {
        schoolId,
        parentId: parent.id,
        type: "CONFIRMATION",
        language: parent.preferredLanguage || "fr",
        channel: "EMAIL",
        content: messages.emailBody,
        status: status.email
      }
    }).catch((error) => console.error("Notification email log failed", error));
  }

  if (notifySms && parent.phone) {
    status.sms = await sendSms({ to: parent.phone, text: messages.smsBody });
    await prisma.notificationLog.create({
      data: {
        schoolId,
        parentId: parent.id,
        type: "CONFIRMATION",
        language: parent.preferredLanguage || "fr",
        channel: "SMS",
        content: messages.smsBody,
        status: status.sms
      }
    }).catch((error) => console.error("Notification SMS log failed", error));
  }

  return status;
}

// In-memory fallback store (used when DB is unavailable)
let demoParents: any[] = [
  {
    id: "demo-parent-1",
    nom: "Kabila",
    postnom: "wa Muzuri",
    prenom: "Jean",
    fullName: "Kabila wa Muzuri Jean",
    phone: "+243810000001",
    email: "jean.kabila@example.com",
    physicalAddress: "Kinshasa, Gombe",
    students: [
      {
        id: "demo-student-1",
        fullName: "Kabila Marie",
        classId: "section-grade-1",
        className: "Grade 1",
        annualFee: 450,
        paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
        paymentOptionLabel: getPaymentOptionLabel(PaymentOptionType.STANDARD_MONTHLY),
        tuitionPlanName: "Grades 1-5 - Standard monthly payment"
      }
    ],
    createdAt: new Date().toISOString()
  }
];

function demoDataFallbackEnabled() {
  return env.ENABLE_DEMO_DATA_FALLBACK === "true" && env.NODE_ENV !== "production";
}

const parentInclude = {
  user: { select: { accessCode: true } },
  students: {
    include: {
      class: true,
      planAssignments: {
        where: { isActive: true },
        include: { tuitionPlan: true },
        orderBy: { updatedAt: "desc" as const }
      }
    }
  }
} as const;

function enrichParent(p: any) {
  const parts = (p.fullName || "").split(" ");
  return {
    ...p,
    accessCode: p.accessCode || p.user?.accessCode || "",
    nom: p.nom || parts[0] || "",
    postnom: p.postnom || parts[1] || "",
    prenom: p.prenom || parts[2] || "",
    students: (p.students || []).map((s: any) => {
      const assignment = s.planAssignments?.[0] ?? null;
      const netAnnualFee = Number(
        assignment?.remainingBalanceSnapshot ??
        assignment?.expectedTotal ??
        assignment?.tuitionPlan?.finalAmount ??
        s.annualFee ??
        0
      );
      return {
        ...s,
        createdAt: s.createdAt ?? p.createdAt ?? new Date(0),
        annualFee: netAnnualFee,
        grossAnnualFee: Number(s.annualFee || 0),
        reductionTotal: Number(assignment?.reductionTotal ?? assignment?.tuitionPlan?.reductionAmount ?? 0),
        className: s.class?.name ?? s.className ?? "",
        paymentOptionType: assignment?.paymentOptionType ?? s.paymentOptionType ?? null,
        paymentOptionLabel: assignment?.paymentOptionType
          ? getPaymentOptionLabel(assignment.paymentOptionType)
          : s.paymentOptionLabel ?? "",
        tuitionPlanName: assignment?.tuitionPlan?.name ?? s.tuitionPlanName ?? ""
      };
    })
  };
}

function parentDashboardData(parent: any) {
  const enriched = enrichParent(parent);
  return {
    ...enriched,
    students: (enriched.students || []).map((student: any) => ({
      ...student,
      payments: student.payments || []
    }))
  };
}

function fallbackClassNameFromId(classId: string) {
  const normalized = classId.trim().toLowerCase();
  const kindergarten = normalized.match(/k([3-5])/);
  if (kindergarten) return `K${kindergarten[1]}`;
  const grade = normalized.match(/(?:section-)?(?:grade|g)[-\s]?([1-9]|1[0-2])/);
  if (grade) return `Grade ${Number(grade[1])}`;
  return classId;
}

function fallbackClassLevelFromId(classId: string) {
  const normalized = classId.trim().toLowerCase();
  if (/k[3-5]/.test(normalized)) return "Kindergarten";
  if (/(?:section-)?(?:grade|g)[-\s]?([1-9]|1[0-2])/.test(normalized)) return "Grade";
  return "Custom";
}

function isStandardFallbackClassId(classId: string) {
  const normalized = classId.trim().toLowerCase();
  return /^section-k[3-5]$/.test(normalized)
    || /^k[3-5]$/.test(normalized)
    || /^(?:section-)?(?:grade|g)[-\s]?([1-9]|1[0-2])$/.test(normalized);
}

async function resolveStudentClassIds(
  schoolId: string,
  students: Array<{ classId: string }>
) {
  const classIdResolution = new Map<string, string>();
  const rawClassIds = [...new Set(students.map((student) => student.classId.trim()).filter(Boolean))];
  if (rawClassIds.length === 0) return classIdResolution;

  rawClassIds.forEach((classId) => classIdResolution.set(classId, classId));

  const existingById = await prisma.class.findMany({
    where: { schoolId, id: { in: rawClassIds } },
    select: { id: true, name: true }
  });
  const existingIdSet = new Set(existingById.map((classRow) => classRow.id));

  for (const classInput of rawClassIds.filter((classId) => !existingIdSet.has(classId))) {
    const className = fallbackClassNameFromId(classInput);
    const classLevel = fallbackClassLevelFromId(classInput);
    const existingByName = await prisma.class.findFirst({
      where: { schoolId, name: { equals: className, mode: "insensitive" } },
      select: { id: true }
    });

    if (existingByName) {
      classIdResolution.set(classInput, existingByName.id);
      continue;
    }

    if (!isStandardFallbackClassId(classInput)) {
      throw new Error("Une ou plusieurs classes sont introuvables.");
    }

    const created = await prisma.class.create({
      data: {
        id: classInput.toLowerCase().startsWith("section-")
          ? classInput
          : className.startsWith("Grade ")
            ? `section-grade-${className.replace("Grade ", "")}`
            : `section-${className.toLowerCase()}`,
        schoolId,
        name: className,
        level: classLevel
      },
      select: { id: true }
    });
    classIdResolution.set(classInput, created.id);
  }

  return classIdResolution;
}

function splitPersonName(fullName: string) {
  const [firstName, ...lastNameParts] = fullName.trim().split(/\s+/);
  return {
    firstName: firstName || fullName.trim(),
    lastName: lastNameParts.join(" ") || "Parent",
  };
}

async function ensureParentPortalUser(options: {
  schoolId: string;
  parentId: string;
  fullName: string;
  email: string;
  accessCode: string;
  temporaryPassword: string;
}) {
  const passwordHash = await bcrypt.hash(options.temporaryPassword, 10);
  const parent = await prisma.parent.findFirst({
    where: { id: options.parentId, schoolId: options.schoolId },
    include: { user: true },
  });
  if (!parent) {
    throw new Error("Parent mirror not found after Orbit synchronization.");
  }

  const candidateUser = parent.user || await prisma.user.findFirst({
    where: {
      schoolId: options.schoolId,
      role: "PARENT",
      OR: [
        { email: options.email },
        { accessCode: options.accessCode },
      ],
    },
  });

  const user = candidateUser
    ? await prisma.user.update({
      where: { id: candidateUser.id },
      data: {
        fullName: options.fullName,
        email: options.email,
        accessCode: options.accessCode,
        passwordHash,
        mustChangePassword: true,
      },
    })
    : await prisma.user.create({
      data: {
        fullName: options.fullName,
        email: options.email,
        accessCode: options.accessCode,
        role: "PARENT",
        schoolId: options.schoolId,
        passwordHash,
        mustChangePassword: true,
      },
    });

  if (parent.userId !== user.id) {
    await prisma.parent.update({ where: { id: parent.id }, data: { userId: user.id } });
  }

  return user;
}

async function assignOnboardingFinance(options: {
  schoolId: string;
  parentId: string;
  students: Array<{
    id: string;
    fullName: string;
    annualFee: number;
    paymentOptionType: PaymentOptionType;
    specialAgreement?: {
      title?: string;
      customTotal?: number;
      reductionAmount?: number;
      notes?: string;
      installmentMode?: OwnerAgreementInstallmentMode;
    };
  }>;
}) {
  for (const student of options.students) {
    if (student.paymentOptionType === PaymentOptionType.SPECIAL_OWNER_AGREEMENT) {
      const customTotal = Math.max(toCurrencyNumber(student.specialAgreement?.customTotal ?? student.annualFee ?? 0), 0);
      const reductionAmount = Math.max(toCurrencyNumber(student.specialAgreement?.reductionAmount ?? 0), 0);
      const title = student.specialAgreement?.title?.trim() || `Accord spécial propriétaire - ${student.fullName}`;
      const notes = student.specialAgreement?.notes?.trim() || "Created during parent onboarding";
      const installmentMode = student.specialAgreement?.installmentMode ?? "THREE_INSTALLMENTS";

      if (customTotal <= 0) {
        throw new Error("Le total de l'accord spécial doit être positif.");
      }
      await createSpecialFinancialAgreement({
        schoolId: options.schoolId,
        parentId: options.parentId,
        studentId: student.id,
        title,
        customTotal,
        reductionAmount,
        status: AgreementStatus.APPROVED,
        notes,
        installments: buildOwnerAgreementInstallments(customTotal, reductionAmount, installmentMode)
      });
    } else {
      await upsertParentPlanAssignment({
        schoolId: options.schoolId,
        parentId: options.parentId,
        studentId: student.id,
        paymentOptionType: student.paymentOptionType,
        notes: "Assigned during parent onboarding"
      });
    }
  }
}

        async function safeSendParentWelcomeNotifications(
          parent: any,
          temporaryPassword: string,
          schoolId: string,
          preferences: { notifyEmail?: boolean; notifySms?: boolean }
        ) {
          try {
            return await sendParentWelcomeNotifications(parent, temporaryPassword, schoolId, preferences);
          } catch (error) {
            console.error("[PARENT_CREATE_CREDENTIALS] Notification failed", error);
            return {
              email: preferences.notifyEmail ? "ERROR" : "SKIPPED",
              sms: preferences.notifySms ? "ERROR" : "SKIPPED"
            };
          }
        }


export const parentRouter = Router();
parentRouter.use(authGuard);

// GET all parents
parentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
    return res.json(mirrored.parents.map((parent) => enrichParent({
      ...parent,
      id: parent.id,
      displayId: parent.displayId || parent.id,
      createdAt: parent.createdAt || new Date(0),
    })));
  }

  try {
    const parents = await prisma.parent.findMany({
      where: { schoolId: req.user!.schoolId },
      include: parentInclude
    });
    return res.json(parents.map(enrichParent));
  } catch (error) {
    console.error("DB unavailable on parent list", error);
    if (demoDataFallbackEnabled()) return res.json(demoParents);
    return res.status(503).json({ message: "Service parents temporairement indisponible." });
  }
});

// GET /me (for PARENT role)
parentRouter.get("/me", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  if (demoDataFallbackEnabled() && req.user!.sub.startsWith("demo-")) {
    return res.json(parentDashboardData(demoParents[0]));
  }

  try {
    const parent = await prisma.parent.findFirst({
      where: { schoolId: req.user!.schoolId, userId: req.user!.sub },
      include: {
        user: { select: { accessCode: true } },
        students: {
          include: {
            class: true,
            payments: true,
            planAssignments: {
              where: { isActive: true },
              include: { tuitionPlan: true },
              orderBy: { updatedAt: "desc" }
            }
          }
        }
      }
    });
    if (parent) return res.json(parentDashboardData(parent));

    if (demoDataFallbackEnabled()) {
      const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
      return res.json(parentDashboardData(demoParent));
    }
    return res.status(404).json({ message: "Parent non trouve" });
  } catch (error) {
    console.error("DB unavailable on parent/me", error);
    if (demoDataFallbackEnabled()) {
      const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
      return res.json(parentDashboardData(demoParent));
    }
    return res.status(503).json({ message: "Espace parent temporairement indisponible." });
  }
});

parentRouter.put("/me/photo", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  const payload = z.object({ photoUrl: z.string().max(750_000).optional().default("") }).parse(req.body);

  if (demoDataFallbackEnabled() && req.user!.sub.startsWith("demo-")) {
    demoParents[0] = { ...demoParents[0], photoUrl: payload.photoUrl };
    return res.json({ photoUrl: payload.photoUrl });
  }

  try {
    const parent = await prisma.parent.findFirst({
      where: { schoolId: req.user!.schoolId, userId: req.user!.sub },
      select: { id: true }
    });
    if (!parent) return res.status(404).json({ message: "Parent non trouve" });

    const updated = await prisma.parent.update({
      where: { id: parent.id },
      data: { photoUrl: payload.photoUrl || null },
      select: { photoUrl: true }
    });
    return res.json({ photoUrl: updated.photoUrl || "" });
  } catch (error) {
    console.error("DB unavailable on parent photo update", error);
    if (demoDataFallbackEnabled()) {
      const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
      demoParent.photoUrl = payload.photoUrl;
      return res.json({ photoUrl: payload.photoUrl });
    }
    return res.status(503).json({ message: "Mise à jour photo temporairement indisponible." });
  }
});

// POST create parent + students
parentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = parentSchema.parse(req.body);
  const temporaryPassword = generateTemporaryPassword();
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedPhone = payload.phone.replace(/\s+/g, "");

  // Suppression de la vérification d’unicité email/téléphone pour respecter la règle de l’écosystème

  if (orbitRegistryIsEnabled()) {
    try {
      const accessCode = await generateUniqueParentAccessCode(prisma);
      const classIdResolution = await resolveStudentClassIds(req.user!.schoolId, payload.students);
      const resolvedClassRows = await prisma.class.findMany({
        where: { schoolId: req.user!.schoolId, id: { in: [...new Set(classIdResolution.values())] } },
        select: { id: true, name: true }
      });
      const classNameById = new Map(resolvedClassRows.map((classRow) => [classRow.id, classRow.name]));
      const { firstName, lastName } = splitPersonName(payload.fullName);

      const orbitResult = await createOrbitParent({
        fullName: payload.fullName,
        firstName: payload.prenom || firstName,
        lastName: [payload.nom, payload.postnom].filter(Boolean).join(" ") || lastName,
        email: payload.email,
        phone: payload.phone,
        physicalAddress: payload.physicalAddress,
        accessCode,
        mustChangePassword: true,
        students: payload.students.map((student) => ({
          fullName: student.fullName,
          className: classNameById.get(classIdResolution.get(student.classId) ?? student.classId) || fallbackClassNameFromId(student.classId),
          mustChangePassword: true,
        })),
      });

      const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
      const mirroredParent = mirrored.parents.find((parent) => (
        parent.orbitId === orbitResult.orbitId
        || parent.email.toLowerCase() === payload.email.toLowerCase()
        || parent.phone === payload.phone
      ));

      if (!mirroredParent) {
        return res.status(502).json({
          message: "La famille a été créée dans Orbit, mais EduPay n'a pas encore pu récupérer son miroir local.",
          orbitResult,
        });
      }

      const user = await ensureParentPortalUser({
        schoolId: req.user!.schoolId,
        parentId: mirroredParent.id,
        fullName: payload.fullName,
        email: payload.email,
        accessCode: mirroredParent.accessCode || accessCode,
        temporaryPassword,
      });

      const localParent = await prisma.parent.findFirst({
        where: { id: mirroredParent.id, schoolId: req.user!.schoolId },
        include: { user: true, students: { include: { class: true } } },
      });

      const unmatchedLocalStudents = [...(localParent?.students || [])];
      const createdStudents: Array<{
        id: string;
        fullName: string;
        annualFee: number;
        paymentOptionType: PaymentOptionType;
        specialAgreement?: {
          title?: string;
          customTotal?: number;
          reductionAmount?: number;
          notes?: string;
          installmentMode?: OwnerAgreementInstallmentMode;
        };
      }> = [];
      for (const requestedStudent of payload.students) {
        const expectedClassName = classNameById.get(classIdResolution.get(requestedStudent.classId) ?? requestedStudent.classId) || fallbackClassNameFromId(requestedStudent.classId);
        const matchIndex = unmatchedLocalStudents.findIndex((student) => (
          student.fullName.trim().toLowerCase() === requestedStudent.fullName.trim().toLowerCase()
          && student.class.name === expectedClassName
        ));
        const fallbackIndex = matchIndex >= 0 ? matchIndex : unmatchedLocalStudents.findIndex((student) => student.fullName.trim().toLowerCase() === requestedStudent.fullName.trim().toLowerCase());
        if (fallbackIndex < 0) continue;
        const [student] = unmatchedLocalStudents.splice(fallbackIndex, 1);
        await prisma.student.update({
          where: { id: student.id },
          data: { annualFee: requestedStudent.annualFee, gender: requestedStudent.gender || null },
        });
        createdStudents.push({
          id: student.id,
          fullName: student.fullName,
          annualFee: requestedStudent.annualFee,
          paymentOptionType: requestedStudent.paymentOptionType,
          specialAgreement: requestedStudent.specialAgreement
        });
      }

      await assignOnboardingFinance({
        schoolId: req.user!.schoolId,
        parentId: mirroredParent.id,
        students: createdStudents,
      });

      const createdParent = await prisma.parent.findUnique({
        where: { id: mirroredParent.id },
        include: parentInclude
      });
      if (!createdParent) {
        return res.status(502).json({
          message: "La famille a été créée dans Orbit, mais EduPay n'a pas retrouvé le parent local après synchronisation.",
          orbitResult,
        });
      }
     
        const notificationStatus = await safeSendParentWelcomeNotifications(
          createdParent,
          temporaryPassword,
          req.user!.schoolId,
          {
            notifyEmail: payload.notifyEmail,
            notifySms: payload.notifySms
          }
        );

      return res.status(201).json({
        ...enrichParent(createdParent),
        temporaryPassword,
        accessCode: user.accessCode,
        notificationStatus,
        propagatedToOrbit: true,
      });
    } catch (error) {
      console.error("Orbit parent create failed", error);
      return res.status(502).json({
        message: error instanceof Error
          ? `EduPay n'a pas pu creer cette famille dans le registre partage Orbit: ${error.message}`
          : "EduPay n'a pas pu creer cette famille dans le registre partage Orbit.",
      });
    }
  }

  try {
    const classIdResolution = await resolveStudentClassIds(req.user!.schoolId, payload.students);
    const parent = await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const parentId = await generateUniqueParentId(tx as typeof prisma, req.user!.schoolId, payload.fullName);
      const user = await tx.user.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          accessCode: await generateUniqueParentAccessCode(tx as typeof prisma),
          role: "PARENT",
          schoolId: req.user!.schoolId,
          passwordHash,
          mustChangePassword: true
        }
      });
      const p = await tx.parent.create({
        data: {
          id: parentId,
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          physicalAddress: payload.physicalAddress || null,
          photoUrl: payload.photoUrl || null,
          preferredLanguage: payload.preferredLanguage,
          schoolId: req.user!.schoolId,
          userId: user.id
        }
      });
      const createdStudents: Array<{
        id: string;
        fullName: string;
        annualFee: number;
        paymentOptionType: PaymentOptionType;
        specialAgreement?: {
          title?: string;
          customTotal?: number;
          reductionAmount?: number;
          notes?: string;
          installmentMode?: OwnerAgreementInstallmentMode;
        };
      }> = [];
      for (const st of payload.students) {
        const studentId = await generateUniqueStudentId(tx as typeof prisma, req.user!.schoolId, st.fullName);
        await tx.student.create({
          data: {
            id: studentId,
            fullName: st.fullName,
            gender: st.gender || null,
            classId: classIdResolution.get(st.classId) ?? st.classId,
            annualFee: st.annualFee,
            parentId: p.id,
            schoolId: req.user!.schoolId
          }
        });
        createdStudents.push({
          id: studentId,
          fullName: st.fullName,
          annualFee: st.annualFee,
          paymentOptionType: st.paymentOptionType,
          specialAgreement: st.specialAgreement
        });
      }
      return { parentId: p.id, createdStudents, accessCode: user.accessCode };
    });
    await assignOnboardingFinance({
      schoolId: req.user!.schoolId,
      parentId: parent.parentId,
      students: parent.createdStudents,
    });
    const createdParent = await prisma.parent.findUnique({
      where: { id: parent.parentId },
      include: parentInclude
    });
    
      if (!createdParent) {
  return res.status(500).json({
    message: "Parent créé mais introuvable après création."
  });
}

    const notificationStatus = await safeSendParentWelcomeNotifications(
      createdParent,
      temporaryPassword,
      req.user!.schoolId,
      {
        notifyEmail: payload.notifyEmail,
        notifySms: payload.notifySms
      }
    );


    return res.status(201).json({
      ...enrichParent(createdParent),
      temporaryPassword,
      accessCode: parent.accessCode || createdParent?.user?.accessCode || "",
      notificationStatus
    });
  } catch (error) {
    console.error("DB unavailable on parent create", error);
    if (error instanceof Error && error.message.includes("classes sont introuvables")) {
      return res.status(404).json({ message: error.message });
    }
    if (!demoDataFallbackEnabled()) {
      return res.status(503).json({ message: "Création parent temporairement indisponible. Vérifiez la base de données." });
    }
    const parentId = buildReadableEntityId("PAR", payload.fullName);
    const accessCode = `ACC-PAR-DEMO${String(demoParents.length + 1).padStart(2, "0")}`;
    const newParent = {
      id: parentId,
      nom: payload.nom,
      postnom: payload.postnom,
      prenom: payload.prenom,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      physicalAddress: payload.physicalAddress,
      accessCode,
      photoUrl: payload.photoUrl,
      temporaryPassword,
      students: payload.students.map((s, i) => ({
        id: `${buildReadableEntityId("STU", s.fullName)}-${String(i + 1).padStart(2, "0")}`,
        fullName: s.fullName,
        gender: s.gender || "",
        classId: s.classId,
        className: "Classe",
        annualFee: s.annualFee,
        paymentOptionType: s.paymentOptionType,
        paymentOptionLabel: getPaymentOptionLabel(s.paymentOptionType),
        tuitionPlanName: getPaymentOptionLabel(s.paymentOptionType)
      })),
      createdAt: new Date().toISOString()
    };
    demoParents.push(newParent);
    const notificationStatus = await sendParentWelcomeNotifications(newParent, temporaryPassword, req.user!.schoolId, {
      notifyEmail: payload.notifyEmail,
      notifySms: payload.notifySms
    });
    // Toujours retourner temporaryPassword et accessCode même en fallback/demo
    return res.status(201).json({ ...newParent, temporaryPassword, accessCode, notificationStatus });
  }
});

parentRouter.post("/:id/reset-password", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const preferences = notificationPreferenceSchema.parse(req.body ?? {});
  const temporaryPassword = generateTemporaryPassword();
  try {
    const parent = await prisma.parent.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      include: { user: true, students: { include: { class: true } } }
    });
    if (!parent) return res.status(404).json({ message: "Parent non trouve" });

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    let user = parent.user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          fullName: parent.fullName,
          email: parent.email,
          accessCode: await generateUniqueParentAccessCode(prisma),
          role: "PARENT",
          schoolId: req.user!.schoolId,
          passwordHash,
          mustChangePassword: true
        }
      });
      await prisma.parent.update({ where: { id: parent.id }, data: { userId: user.id } });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: parent.fullName,
          email: parent.email,
          passwordHash,
          mustChangePassword: true
        }
      });
    }

    const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, req.user!.schoolId, preferences);
    return res.json({ parentId: parent.id, email: user.email, accessCode: user.accessCode, temporaryPassword, notificationStatus });
  } catch (error) {
    console.error("DB unavailable on parent password reset", error);
    if (!demoDataFallbackEnabled()) {
      return res.status(503).json({ message: "Reinitialisation parent temporairement indisponible." });
    }
    const parent = demoParents.find((p) => p.id === id);
    if (!parent) return res.status(404).json({ message: "Parent non trouve" });
    parent.temporaryPassword = temporaryPassword;
    const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, req.user!.schoolId, preferences);
    return res.json({
      parentId: parent.id,
      email: parent.email,
      accessCode: parent.accessCode,
      temporaryPassword,
      notificationStatus
    });
  }
});

// PUT update parent
parentRouter.put("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const payload = parentSchema.parse(req.body);
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedPhone = payload.phone.replace(/\s+/g, "");
  let orbitUpdateSucceeded = false;
  try {
    const parentExists = await prisma.parent.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true, userId: true }
    });
    if (!parentExists) return res.status(404).json({ message: "Parent non trouve" });
    // Suppression de la vérification d’unicité email/téléphone pour respecter la règle de l’écosystème

   
    if (orbitRegistryIsEnabled()) {
      try {
        const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
        const mirroredParent = mirrored.parents.find((entry) => matchesSharedParentIdentifier(entry, id));

        if (mirroredParent?.orbitId) {
          const { firstName, lastName } = splitPersonName(payload.fullName);

          await updateOrbitParent(mirroredParent.orbitId, {
            fullName: payload.fullName,
            firstName: payload.prenom || firstName,
            lastName: [payload.nom, payload.postnom].filter(Boolean).join(" ") || lastName,
            email: normalizedEmail,
            phone: normalizedPhone,
            physicalAddress: payload.physicalAddress || null
          });

          await syncOrbitRegistryMirror(req.user!.schoolId);
          orbitUpdateSucceeded = true;
        } else {
          console.error("[PARENT_UPDATE_ORBIT] Orbit ID introuvable pour parent", id);
        }
      } catch (error) {
        console.error("[PARENT_UPDATE_ORBIT] Orbit sync failed but local update will continue", error);
      }
    }


    const classIdResolution = await resolveStudentClassIds(req.user!.schoolId, payload.students);
    const currentStudents = await prisma.student.findMany({
      where: { parentId: id, schoolId: req.user!.schoolId },
      select: {
        id: true,
        fullName: true,
        gender: true,
        classId: true,
        annualFee: true,
        planAssignments: {
          where: { isActive: true },
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: {
            paymentOptionType: true,
            financialAgreement: {
              select: {
                title: true,
                customTotal: true,
                reductionAmount: true,
                notes: true,
                installments: {
                  orderBy: { dueDate: "asc" },
                  select: {
                    label: true,
                    dueDate: true,
                    amountDue: true
                  }
                }
              }
            }
          }
        }
      }
    });
    const currentStudentById = new Map(currentStudents.map((student) => [student.id, student]));

    const updatedStudentAssignments: Array<{
      id: string;
      fullName: string;
      annualFee: number;
      paymentOptionType: PaymentOptionType;
      specialAgreement?: {
        title?: string;
        customTotal?: number;
        reductionAmount?: number;
        notes?: string;
        installmentMode?: OwnerAgreementInstallmentMode;
      };
    }> = [];
    await prisma.$transaction(async (tx) => {
      await tx.parent.update({
        where: { id },
        data: {
          fullName: payload.fullName,
          phone: normalizedPhone,
          email: normalizedEmail,
          physicalAddress: payload.physicalAddress || null,
          photoUrl: payload.photoUrl || null,
          preferredLanguage: payload.preferredLanguage
        }
      });

      if (parentExists.userId) {
        await tx.user.update({
          where: { id: parentExists.userId },
          data: {
            fullName: payload.fullName,
            email: normalizedEmail
          }
        });
      }

      const existingStudents = await tx.student.findMany({
        where: { parentId: id, schoolId: req.user!.schoolId },
        select: { id: true }
      });
      const existingStudentIds = new Set(existingStudents.map((student) => student.id));
      const requestedExistingIds = new Set(payload.students.map((student) => student.id).filter((studentId): studentId is string => Boolean(studentId)));
      const studentsToDelete = [...existingStudentIds].filter((studentId) => !requestedExistingIds.has(studentId));

      if (studentsToDelete.length) {
        await tx.student.deleteMany({
          where: {
            parentId: id,
            schoolId: req.user!.schoolId,
            id: { in: studentsToDelete }
          }
        });
      }

      for (const student of payload.students) {
        if (student.id && existingStudentIds.has(student.id)) {
          const resolvedClassId = classIdResolution.get(student.classId) ?? student.classId;
          const currentStudent = currentStudentById.get(student.id);
          const updatedStudent = await tx.student.update({
            where: { id: student.id },
            data: {
              fullName: student.fullName,
              gender: student.gender || null,
              classId: resolvedClassId,
              annualFee: student.annualFee
            },
            select: { id: true, fullName: true, annualFee: true }
          });

          const currentAssignment = currentStudent?.planAssignments?.[0];
          const financeChanged = !currentStudent
            || resolvedClassId !== currentStudent.classId
            || roundCurrency(Number(student.annualFee || 0)) !== roundCurrency(Number(currentStudent.annualFee || 0))
            || student.paymentOptionType !== currentAssignment?.paymentOptionType
            || (student.paymentOptionType === PaymentOptionType.SPECIAL_OWNER_AGREEMENT && hasSpecialAgreementChanged(student.specialAgreement, currentAssignment?.financialAgreement, student.annualFee));

          if (financeChanged) {
            updatedStudentAssignments.push({
              ...updatedStudent,
              paymentOptionType: student.paymentOptionType,
              specialAgreement: student.specialAgreement
            });
          }
          continue;
        }

        const studentId = await generateUniqueStudentId(tx as typeof prisma, req.user!.schoolId, student.fullName);
        const createdStudent = await tx.student.create({
          data: {
            id: studentId,
            fullName: student.fullName,
            gender: student.gender || null,
            classId: classIdResolution.get(student.classId) ?? student.classId,
            annualFee: student.annualFee,
            parentId: id,
            schoolId: req.user!.schoolId
          },
          select: { id: true, fullName: true, annualFee: true }
        });
        updatedStudentAssignments.push({
          ...createdStudent,
          paymentOptionType: student.paymentOptionType,
          specialAgreement: student.specialAgreement
        });
      }
    });

    if (updatedStudentAssignments.length > 0) {
      try {
        await assignOnboardingFinance({
          schoolId: req.user!.schoolId,
          parentId: id,
          students: updatedStudentAssignments
        });
      } catch (financeError) {
        console.error("[PARENT_UPDATE_FINANCE_SYNC] Parent updated, finance reassignment deferred", financeError);
      }
    }

    const parent = await prisma.parent.findUnique({
      where: { id },
      include: parentInclude
    });
    const notificationStatus = parent
      ? await notifyParentEntityChange({
        schoolId: req.user!.schoolId,
        parentId: parent.id,
        subject: "Mise à jour du dossier parent EduPay",
        body: [
          `Le dossier de ${payload.fullName} vient d'être modifié dans EduPay.`,
          "Les informations synchronisées sont maintenant partagées avec les applications de l'écosystème.",
          `Téléphone : ${normalizedPhone}`,
          `E-mail : ${normalizedEmail}`,
        ].join("\n"),
      })
      : undefined;
    return res.json({ ...enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }), notificationStatus });
  } catch (error) {
    console.error("DB unavailable on parent update", error);
    if (error instanceof Error && error.message.includes("classes sont introuvables")) {
      return res.status(404).json({ message: error.message });
    }
    if (orbitUpdateSucceeded) {
      try {
        const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
        const parent = mirrored.parents.find((entry) => matchesSharedParentIdentifier(entry, id))
          ?? mirrored.parents.find((entry) => entry.fullName === payload.fullName || entry.email === normalizedEmail || entry.phone === normalizedPhone);
        if (parent) {
          const notificationStatus = await notifyParentEntityChange({
            schoolId: req.user!.schoolId,
            parentId: parent.id,
            subject: "Mise à jour du dossier parent EduPay",
            body: [
              `Le dossier de ${payload.fullName} vient d'être modifié dans le registre partagé.`,
              "EduPay a resynchronisé le miroir local et les autres applications peuvent reprendre ces informations.",
              `Téléphone : ${normalizedPhone}`,
              `E-mail : ${normalizedEmail}`,
            ].join("\n"),
          });
          return res.json({ ...enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }), notificationStatus, syncMode: "ORBIT_MIRROR" });
        }
      } catch (mirrorError) {
        console.error("[PARENT_UPDATE_ORBIT_FALLBACK] Mirror refresh failed", mirrorError);
      }
    }
    if (!demoDataFallbackEnabled()) {
      return res.status(503).json({ message: "Mise à jour parent temporairement indisponible." });
    }
    const idx = demoParents.findIndex((p) => p.id === id);
    if (idx !== -1) {
      demoParents[idx] = { ...demoParents[idx], ...payload };
      return res.json(demoParents[idx]);
    }
    return res.status(404).json({ message: "Parent non trouvé" });
  }
});

// DELETE parent
parentRouter.delete("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  if (orbitRegistryIsEnabled()) {
    const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
    const parent = mirrored.parents.find((entry) => matchesSharedParentIdentifier(entry, id));

    if (!parent) {
      return res.status(404).json({ message: "Parent non trouve dans le registre partage." });
    }

    if (!parent.orbitId) {
      return res.status(409).json({
        message: "Impossible de supprimer ce parent car son identifiant Orbit est introuvable."
      });
    }

      await deleteOrbitFamily(parent.orbitId);

        const localParent = await prisma.parent.findFirst({
        where: {
          id: parent.id,
          schoolId: req.user!.schoolId
        },
        select: {
          id: true,
          userId: true
        }
      });

      if (localParent) {
        await prisma.$transaction(async (tx) => {
          await tx.student.deleteMany({
            where: {
              parentId: localParent.id,
              schoolId: req.user!.schoolId
            }
          });

          await tx.parent.deleteMany({
            where: {
              id: localParent.id,
              schoolId: req.user!.schoolId
            }
          });

          if (localParent.userId) {
            await tx.user.deleteMany({
              where: {
                id: localParent.userId,
                role: "PARENT"
              }
            });
          }
        });
      }

      await syncOrbitRegistryMirror(req.user!.schoolId);
      return res.status(204).end();


  }

  try {
    const parent = await prisma.parent.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true, userId: true }
    });
    if (!parent) return res.status(404).json({ message: "Parent non trouve" });

    await prisma.$transaction(async (tx) => {
      await tx.parent.delete({ where: { id: parent.id } });
      if (parent.userId) {
        await tx.user.deleteMany({
          where: {
            id: parent.userId,
            role: "PARENT"
          }
        });
      }
    });
    return res.status(204).end();
  } catch (error) {
    console.error("DB unavailable on parent delete", error);
    if (!demoDataFallbackEnabled()) {
      return res.status(503).json({ message: "Suppression parent temporairement indisponible." });
    }
    demoParents = demoParents.filter((p) => p.id !== id);
    return res.status(204).end();
  }
});
