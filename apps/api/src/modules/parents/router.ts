import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail, sendSms } from "../../utils/messaging";

const studentInputSchema = z.object({
  fullName: z.string().min(1),
  classId: z.string().min(1),
  annualFee: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v)))
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
    `Telephone: ${parent.phone || "Non renseigne"}`,
    `Email de connexion: ${loginEmail}`,
    `Mot de passe temporaire: ${temporaryPassword}`,
    "",
    "Enfants rattaches:",
    studentLines,
    "",
    "Pour votre securite, connectez-vous puis changez ce mot de passe depuis votre profil."
  ].join("\n");
  const smsBody = `EduPay: compte cree pour ${parent.fullName}. Email: ${loginEmail}. Mot de passe temporaire: ${temporaryPassword}. Changez-le apres connexion.`;
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
      { id: "demo-student-1", fullName: "Kabila Marie", classId: "section-grade-1", className: "Grade 1", annualFee: 450 }
    ],
    createdAt: new Date().toISOString()
  }
];

function enrichParent(p: any) {
  const parts = (p.fullName || "").split(" ");
  return {
    ...p,
    nom: p.nom || parts[0] || "",
    postnom: p.postnom || parts[1] || "",
    prenom: p.prenom || parts[2] || "",
    students: (p.students || []).map((s: any) => ({
      ...s,
      className: s.class?.name ?? s.className ?? ""
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

export const parentRouter = Router();
parentRouter.use(authGuard);

// GET all parents
parentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const parents = await prisma.parent.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { students: { include: { class: true } } }
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
      include: { students: { include: { class: true, payments: true } } }
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
  try {
    const parent = await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const user = await tx.user.create({
        data: {
          fullName: payload.fullName,
          email: payload.email,
          role: "PARENT",
          schoolId: req.user!.schoolId,
          passwordHash
        }
      });
      const p = await tx.parent.create({
        data: {
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          photoUrl: payload.photoUrl || null,
          preferredLanguage: payload.preferredLanguage,
          schoolId: req.user!.schoolId,
          userId: user.id
        }
      });
      for (const st of payload.students) {
        await tx.student.create({
          data: {
            fullName: st.fullName,
            classId: st.classId,
            annualFee: st.annualFee,
            parentId: p.id,
            schoolId: req.user!.schoolId
          }
        });
      }
      return tx.parent.findUnique({
        where: { id: p.id },
        include: { students: { include: { class: true } } }
      });
    });
    const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, req.user!.schoolId, {
      notifyEmail: payload.notifyEmail,
      notifySms: payload.notifySms
    });
    return res.status(201).json({
      ...enrichParent({ ...parent, nom: payload.nom, postnom: payload.postnom, prenom: payload.prenom }),
      temporaryPassword,
      notificationStatus
    });
  } catch (error) {
    console.error("DB unavailable on parent create, using demo store", error);
    const newParent = {
      id: `demo-parent-${Date.now()}`,
      nom: payload.nom,
      postnom: payload.postnom,
      prenom: payload.prenom,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      photoUrl: payload.photoUrl,
      temporaryPassword,
      students: payload.students.map((s, i) => ({
        id: `demo-student-${Date.now()}-${i}`,
        fullName: s.fullName,
        classId: s.classId,
        className: "Classe",
        annualFee: s.annualFee
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
    return res.json({ parentId: parent.id, email: user.email, temporaryPassword, notificationStatus });
  } catch (error) {
    console.error("DB unavailable on parent password reset, using demo store", error);
    const parent = demoParents.find((p) => p.id === id);
    if (!parent) return res.status(404).json({ message: "Parent non trouve" });
    parent.temporaryPassword = temporaryPassword;
    const notificationStatus = await sendParentWelcomeNotifications(parent, temporaryPassword, req.user!.schoolId, preferences);
    return res.json({
      parentId: parent.id,
      email: parent.email,
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
      include: { students: { include: { class: true } } }
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
  try {
    await prisma.parent.delete({ where: { id } });
    return res.status(204).end();
  } catch (error) {
    console.error("DB unavailable on parent delete, using demo store", error);
    demoParents = demoParents.filter((p) => p.id !== id);
    return res.status(204).end();
  }
});
