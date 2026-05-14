import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { AgreementStatus, PaymentOptionType } from "@prisma/client";
import { createOrbitParent, deleteOrbitParent, matchesSharedParentIdentifier, orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail, sendSms } from "../../utils/messaging";
import { createSpecialFinancialAgreement, getPaymentOptionLabel, upsertParentPlanAssignment } from "../finance/service";

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
  fullName: z.string().min(1),
  classId: z.string().min(1),
  annualFee: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v))),
  paymentOptionType: z.nativeEnum(PaymentOptionType).optional().default(PaymentOptionType.STANDARD_MONTHLY)
});

const parentSchema = z.object({
  fullName: z.string().min(1),
  nom: z.string().optional().default(""),
  postnom: z.string().optional().default(""),
  prenom: z.string().optional().default(""),
  phone: z.string().min(6),
  email: z.string().email(),
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
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const pick = (length: number) => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `KCS-${pick(4)}-${pick(4)}`;
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

function buildOwnerAgreementInstallments(customTotal: number) {
  const safeTotal = Math.max(Number(customTotal || 0), 0);
  const first = Math.round((safeTotal * 0.4) * 100) / 100;
  const second = Math.round((safeTotal * 0.3) * 100) / 100;
  const third = Math.round((safeTotal - first - second) * 100) / 100;

  return [
    { label: "Engagement initial", dueDate: buildAcademicDueDate(8, 31), amountDue: first, notes: "Created during parent onboarding" },
    { label: "Regularisation mi-annee", dueDate: buildAcademicDueDate(1, 31), amountDue: second, notes: "Created during parent onboarding" },
    { label: "Solde final", dueDate: buildAcademicDueDate(5, 31), amountDue: third, notes: "Created during parent onboarding" }
  ];
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

function buildParentWelcomeMessages(parent: any, temporaryPassword: string, loginEmail: string) {
  const students = (parent.students || []).map((student: any) => ({
    fullName: student.fullName,
    className: student.class?.name ?? student.className ?? student.classId ?? "Classe non renseignee",
    annualFee: Number(student.annualFee || 0)
  }));
  const studentLines = students.length
    ? students.map((student: any) => `- ${student.fullName} | Classe: ${student.className} | Frais annuels: $ ${student.annualFee.toLocaleString("en-US", { maximumFractionDigits: 2 })}`).join("\n")
    : "- Aucun eleve rattache pour le moment";

  const subject = "Vos acces EduPay";
  const emailBody = [
    `Bonjour ${parent.fullName},`,
    "",
    "Votre compte parent EduPay vient d'être créé par l'administration de l'école.",
    "",
    `Identifiant parent: ${parent.id}`,
    `Code d'accès: ${parent.accessCode || "Non renseigne"}`,
    `Telephone: ${parent.phone || "Non renseigne"}`,
    `Identifiant de connexion: ${loginEmail}`,
    `Mot de passe temporaire: ${temporaryPassword}`,
    "",
    "Enfants rattaches:",
    studentLines,
    "",
    "Pour votre securite, connectez-vous puis changez ce mot de passe depuis votre profil."
  ].join("\n");
  const smsBody = `EduPay: compte cree pour ${parent.fullName}. Code: ${parent.accessCode || "N/A"}. Identifiant: ${loginEmail}. Mot de passe temporaire: ${temporaryPassword}. Changez-le apres connexion.`;
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
    students: (p.students || []).map((s: any) => ({
      ...s,
      className: s.class?.name ?? s.className ?? "",
      paymentOptionType: s.planAssignments?.[0]?.paymentOptionType ?? s.paymentOptionType ?? null,
      paymentOptionLabel: s.planAssignments?.[0]?.paymentOptionType
        ? getPaymentOptionLabel(s.planAssignments[0].paymentOptionType)
        : s.paymentOptionLabel ?? "",
      tuitionPlanName: s.planAssignments?.[0]?.tuitionPlan?.name ?? s.tuitionPlanName ?? ""
    }))
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
  const grade = normalized.match(/grade[-\s]?([1-9]|1[0-2])/);
  if (grade) return `Grade ${Number(grade[1])}`;
  return classId;
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
  students: Array<{ id: string; fullName: string; annualFee: number; paymentOptionType: PaymentOptionType }>;
}) {
  for (const student of options.students) {
    if (student.paymentOptionType === PaymentOptionType.SPECIAL_OWNER_AGREEMENT) {
      if (student.annualFee <= 0) {
        throw new Error("Le total de l'accord special doit etre positif.");
      }
      await createSpecialFinancialAgreement({
        schoolId: options.schoolId,
        parentId: options.parentId,
        studentId: student.id,
        title: `Accord special proprietaire - ${student.fullName}`,
        customTotal: student.annualFee,
        reductionAmount: 0,
        status: AgreementStatus.APPROVED,
        notes: "Created during parent onboarding",
        installments: buildOwnerAgreementInstallments(student.annualFee)
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
    console.error("DB unavailable on parent list, using demo data", error);
    return res.json(demoParents);
  }
});

// GET /me (for PARENT role)
parentRouter.get("/me", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  if (req.user!.sub.startsWith("demo-")) {
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

    const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
    return res.json(parentDashboardData(demoParent));
  } catch (error) {
    console.error("DB unavailable on parent/me", error);
    const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
    return res.json(parentDashboardData(demoParent));
  }
});

parentRouter.put("/me/photo", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  const payload = z.object({ photoUrl: z.string().max(750_000).optional().default("") }).parse(req.body);

  if (req.user!.sub.startsWith("demo-")) {
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
    console.error("DB unavailable on parent photo update, using demo store", error);
    const demoParent = demoParents.find((item) => item.userId === req.user!.sub) ?? demoParents[0];
    demoParent.photoUrl = payload.photoUrl;
    return res.json({ photoUrl: payload.photoUrl });
  }
});

// POST create parent + students
parentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = parentSchema.parse(req.body);
  const temporaryPassword = generateTemporaryPassword();

  if (orbitRegistryIsEnabled()) {
    try {
      const accessCode = await generateUniqueParentAccessCode(prisma);
      const classRows = await prisma.class.findMany({
        where: {
          schoolId: req.user!.schoolId,
          id: { in: payload.students.map((student) => student.classId) },
        },
      });
      const classNameById = new Map(classRows.map((classRow) => [classRow.id, classRow.name]));
      const { firstName, lastName } = splitPersonName(payload.fullName);

      const orbitResult = await createOrbitParent({
        fullName: payload.fullName,
        firstName: payload.prenom || firstName,
        lastName: [payload.nom, payload.postnom].filter(Boolean).join(" ") || lastName,
        email: payload.email,
        phone: payload.phone,
        accessCode,
        mustChangePassword: true,
        students: payload.students.map((student) => ({
          fullName: student.fullName,
          className: classNameById.get(student.classId) || fallbackClassNameFromId(student.classId),
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
          message: "La famille a ete creee dans Orbit, mais EduPay n'a pas encore pu recuperer son miroir local.",
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
      const createdStudents: Array<{ id: string; fullName: string; annualFee: number; paymentOptionType: PaymentOptionType }> = [];
      for (const requestedStudent of payload.students) {
        const expectedClassName = classNameById.get(requestedStudent.classId) || fallbackClassNameFromId(requestedStudent.classId);
        const matchIndex = unmatchedLocalStudents.findIndex((student) => (
          student.fullName.trim().toLowerCase() === requestedStudent.fullName.trim().toLowerCase()
          && student.class.name === expectedClassName
        ));
        const fallbackIndex = matchIndex >= 0 ? matchIndex : unmatchedLocalStudents.findIndex((student) => student.fullName.trim().toLowerCase() === requestedStudent.fullName.trim().toLowerCase());
        if (fallbackIndex < 0) continue;
        const [student] = unmatchedLocalStudents.splice(fallbackIndex, 1);
        await prisma.student.update({
          where: { id: student.id },
          data: { annualFee: requestedStudent.annualFee },
        });
        createdStudents.push({
          id: student.id,
          fullName: student.fullName,
          annualFee: requestedStudent.annualFee,
          paymentOptionType: requestedStudent.paymentOptionType,
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
          message: "La famille a ete creee dans Orbit, mais EduPay n'a pas retrouve le parent local apres synchronisation.",
          orbitResult,
        });
      }
      const notificationStatus = await sendParentWelcomeNotifications(createdParent, temporaryPassword, req.user!.schoolId, {
        notifyEmail: payload.notifyEmail,
        notifySms: payload.notifySms
      });

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
        message: "EduPay n'a pas pu creer cette famille dans le registre partage Orbit.",
      });
    }
  }

  try {
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
          passwordHash
        }
      });
      const p = await tx.parent.create({
        data: {
          id: parentId,
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          photoUrl: payload.photoUrl || null,
          preferredLanguage: payload.preferredLanguage,
          schoolId: req.user!.schoolId,
          userId: user.id
        }
      });
      const createdStudents: Array<{ id: string; fullName: string; annualFee: number; paymentOptionType: PaymentOptionType }> = [];
      for (const st of payload.students) {
        const studentId = await generateUniqueStudentId(tx as typeof prisma, req.user!.schoolId, st.fullName);
        await tx.student.create({
          data: {
            id: studentId,
            fullName: st.fullName,
            classId: st.classId,
            annualFee: st.annualFee,
            parentId: p.id,
            schoolId: req.user!.schoolId
          }
        });
        createdStudents.push({ id: studentId, fullName: st.fullName, annualFee: st.annualFee, paymentOptionType: st.paymentOptionType });
      }
      return { parentId: p.id, createdStudents };
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
    const notificationStatus = await sendParentWelcomeNotifications(createdParent, temporaryPassword, req.user!.schoolId, {
      notifyEmail: payload.notifyEmail,
      notifySms: payload.notifySms
    });
    return res.status(201).json({
      ...enrichParent(createdParent),
      temporaryPassword,
      accessCode: createdParent?.user?.accessCode || "",
      notificationStatus
    });
  } catch (error) {
    console.error("DB unavailable on parent create, using demo store", error);
    const parentId = buildReadableEntityId("PAR", payload.fullName);
    const newParent = {
      id: parentId,
      nom: payload.nom,
      postnom: payload.postnom,
      prenom: payload.prenom,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      accessCode: `ACC-PAR-DEMO${String(demoParents.length + 1).padStart(2, "0")}`,
      photoUrl: payload.photoUrl,
      temporaryPassword,
      students: payload.students.map((s, i) => ({
        id: `${buildReadableEntityId("STU", s.fullName)}-${String(i + 1).padStart(2, "0")}`,
        fullName: s.fullName,
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
    return res.status(201).json({ ...newParent, notificationStatus });
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
          passwordHash
        }
      });
      await prisma.parent.update({ where: { id: parent.id }, data: { userId: user.id } });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: parent.fullName,
          email: parent.email,
          passwordHash
        }
      });
    }

    const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, req.user!.schoolId, preferences);
    return res.json({ parentId: parent.id, email: user.email, accessCode: user.accessCode, temporaryPassword, notificationStatus });
  } catch (error) {
    console.error("DB unavailable on parent password reset, using demo store", error);
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
  try {
    const parent = await prisma.parent.update({
      where: { id },
      data: {
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        photoUrl: payload.photoUrl || null,
        preferredLanguage: payload.preferredLanguage
      },
      include: parentInclude
    });
    return res.json(enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }));
  } catch (error) {
    console.error("DB unavailable on parent update, using demo store", error);
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

    await deleteOrbitParent(parent.orbitId);
    await syncOrbitRegistryMirror(req.user!.schoolId);
    return res.status(204).end();
  }

  try {
    const children = await prisma.student.count({ where: { parentId: id, schoolId: req.user!.schoolId } });
    if (children > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer ce parent: des eleves lui sont encore rattaches.",
        children,
      });
    }

    await prisma.parent.delete({ where: { id } });
    return res.status(204).end();
  } catch (error) {
    console.error("DB unavailable on parent delete, using demo store", error);
    demoParents = demoParents.filter((p) => p.id !== id);
    return res.status(204).end();
  }
});
