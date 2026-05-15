import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../prisma";
import { env } from "../../config/env";
import { authGuard, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail } from "../../utils/messaging";

type StaffRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "FINANCIAL_MANAGER" | "ACCOUNTANT" | "CASHIER" | "HR_MANAGER" | "AUDITOR" | "PARENT";

function generateAccessCode(role: StaffRole) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ACC-${role.slice(0, 3)}-${suffix}`;
}

async function generateUniqueAccessCode(role: StaffRole) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const accessCode = generateAccessCode(role);
    const existing = await prisma.user.findUnique({ where: { accessCode } });
    if (!existing) return accessCode;
  }

  return `ACC-${role.slice(0, 3)}-${Date.now().toString(36).toUpperCase()}`;
}

const registerSchema = z.object({
  fullName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "FINANCIAL_MANAGER", "ACCOUNTANT", "CASHIER", "HR_MANAGER", "AUDITOR", "PARENT"]),
  schoolId: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  identifier: z.string().min(3).max(120)
});

const resetPasswordSchema = z.object({
  token: z.string().min(24).max(120),
  newPassword: z.string().min(8)
});

const demoUsers = [
  {
    email: "admin@school.com",
    password: "password123",
    role: "ADMIN" as const,
    fullName: "Admin User",
    schoolId: "demo-school"
  },
  {
    email: "parent@school.com",
    password: "password123",
    role: "PARENT" as const,
    fullName: "Parent Demo",
    schoolId: "demo-school",
    parentId: "demo-parent-1"
  }
];

function buildToken(user: { id: string; role: StaffRole; schoolId: string }) {
  return jwt.sign({ sub: user.id, role: user.role, schoolId: user.schoolId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any
  });
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildPasswordResetLink(token: string) {
  const baseUrl = (env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${baseUrl}/#/login?resetToken=${encodeURIComponent(token)}`;
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim();
}

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Reessayez dans quelques minutes." }
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives de recuperation. Reessayez plus tard." }
});

authRouter.post("/register", async (req, res) => {
  const payload = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(payload.password, 10);

  const user = await prisma.user.create({
    data: {
      fullName: payload.fullName,
      email: payload.email.trim().toLowerCase(),
      accessCode: await generateUniqueAccessCode(payload.role),
      role: payload.role,
      schoolId: payload.schoolId,
      passwordHash: hash
    }
  });

  res.status(201).json({ id: user.id });
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const identifier = payload.email.trim();
  const normalizedIdentifier = identifier.toLowerCase();

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedIdentifier },
          { accessCode: identifier.toUpperCase() }
        ]
      }
    });

    if (user) {
      const ok = await bcrypt.compare(payload.password, user.passwordHash);
      if (ok) {
        const token = buildToken({ id: user.id, role: user.role, schoolId: user.schoolId });
        const parent = user.role === "PARENT"
          ? await prisma.parent.findUnique({ where: { userId: user.id }, select: { id: true, photoUrl: true } })
          : null;
        return res.json({
          token,
          role: user.role,
          fullName: user.fullName,
          parentId: parent?.id,
          photoUrl: parent?.photoUrl,
          accessCode: user.accessCode,
          mustChangePassword: user.mustChangePassword
        });
      }
    }
  } catch (error) {
    console.error("Database unavailable on login", error);
    if (env.ENABLE_DEMO_AUTH_FALLBACK !== "true") {
      return res.status(503).json({ message: "Service de connexion temporairement indisponible" });
    }
  }

  if (env.ENABLE_DEMO_AUTH_FALLBACK !== "true") {
    return res.status(401).json({ message: "Identifiants invalides" });
  }

  const demoUser = demoUsers.find((entry) =>
    entry.email.toLowerCase() === normalizedIdentifier && entry.password === payload.password
  );

  if (demoUser) {
    const token = buildToken({ id: `demo-${demoUser.role.toLowerCase()}`, role: demoUser.role, schoolId: demoUser.schoolId });
    return res.json({ token, role: demoUser.role, fullName: demoUser.fullName, parentId: "parentId" in demoUser ? demoUser.parentId : undefined, accessCode: `ACC-${demoUser.role.slice(0, 3)}-DEMO01` });
  }

  return res.status(401).json({ message: "Identifiants invalides" });
});

authRouter.post("/forgot-password", recoveryLimiter, async (req, res) => {
  const payload = forgotPasswordSchema.safeParse(req.body);
  const genericMessage = "Si ce compte existe, un code de reinitialisation vient d'etre envoye.";
  if (!payload.success) return res.json({ message: genericMessage });

  try {
    const identifier = normalizeIdentifier(payload.data.identifier);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { accessCode: identifier.toUpperCase() }
        ]
      }
    });
    if (user) {
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() }
      });
      const token = crypto.randomBytes(24).toString("base64url");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        }
      });
      await sendEmail({
        to: user.email,
        subject: "Reinitialisation de mot de passe EduPay",
        text: [
          `Bonjour ${user.fullName},`,
          "",
          "Une demande de reinitialisation de mot de passe a ete recue pour votre compte EduPay.",
          "",
          `Code de reinitialisation: ${token}`,
          `Lien direct: ${buildPasswordResetLink(token)}`,
          "Ce code expire dans 30 minutes et ne peut etre utilise qu'une seule fois.",
          "",
          "Si vous n'etes pas a l'origine de cette demande, ignorez ce message."
        ].join("\n")
      });
    }
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error("Forgot password email flow failed", error);
    return res.json({ message: genericMessage });
  }
});

authRouter.post("/reset-password", recoveryLimiter, async (req, res) => {
  const payload = resetPasswordSchema.parse(req.body);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(payload.token.trim()) },
    include: { user: true }
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: "Code de reinitialisation invalide ou expire." });
  }

  const passwordHash = await bcrypt.hash(payload.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, mustChangePassword: false }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    })
  ]);

  await sendEmail({
    to: resetToken.user.email,
    subject: "Mot de passe EduPay reinitialise",
    text: [
      `Bonjour ${resetToken.user.fullName},`,
      "",
      "Votre mot de passe EduPay vient d'etre reinitialise.",
      "Si vous n'avez pas effectue cette action, contactez immediatement l'administration."
    ].join("\n")
  }).catch((error) => console.error("Reset confirmation email failed", error));

  return res.json({ message: "Mot de passe reinitialise. Vous pouvez vous connecter." });
});

authRouter.post("/recover-admin-password", recoveryLimiter, async (req, res) => {
  const payload = z.object({
    email: z.string().email(),
    recoveryCode: z.string().min(12),
    newPassword: z.string().min(10)
  }).parse(req.body);

  if (!env.ADMIN_RECOVERY_CODE || env.ADMIN_RECOVERY_CODE.startsWith("CHANGE_ME")) {
    return res.status(503).json({ message: "La recuperation administrateur n'est pas configuree sur le serveur." });
  }

  if (payload.recoveryCode !== env.ADMIN_RECOVERY_CODE) {
    return res.status(401).json({ message: "Code de recuperation invalide." });
  }

  const email = payload.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "ADMIN") {
    return res.status(404).json({ message: "Compte administrateur introuvable." });
  }

  const passwordHash = await bcrypt.hash(payload.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false }
  });

  await sendEmail({
    to: user.email,
    subject: "Mot de passe administrateur EduPay reinitialise",
    text: [
      `Bonjour ${user.fullName},`,
      "",
      "Le mot de passe administrateur EduPay vient d'etre reinitialise avec le code de recuperation serveur.",
      "Si vous n'avez pas effectue cette action, changez immediatement ADMIN_RECOVERY_CODE et JWT_SECRET."
    ].join("\n")
  }).catch((error) => console.error("Admin recovery email failed", error));

  return res.json({ message: "Mot de passe administrateur reinitialise. Vous pouvez vous connecter." });
});

authRouter.post("/change-password", authGuard, async (req: AuthenticatedRequest, res) => {
  const payload = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

  const ok = await bcrypt.compare(payload.currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ message: "Mot de passe actuel incorrect" });

  const passwordHash = await bcrypt.hash(payload.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false }
  });

  await sendEmail({
    to: user.email,
    subject: "Mot de passe EduPay modifié",
    text: [
      `Bonjour ${user.fullName},`,
      "",
      "Votre mot de passe EduPay vient d'être modifié avec succès.",
      "Si vous n'avez pas effectué cette action, contactez immédiatement l'administration de l'école."
    ].join("\n")
  });

  return res.json({ message: "Mot de passe modifié avec succès." });
});

authRouter.put("/access-code", authGuard, async (req: AuthenticatedRequest, res) => {
  const payload = z.object({ accessCode: z.string().min(6).max(24) }).parse(req.body);
  const accessCode = payload.accessCode.trim().toUpperCase();

  const duplicate = await prisma.user.findFirst({
    where: {
      accessCode,
      NOT: { id: req.user!.sub }
    },
    select: { id: true }
  });

  if (duplicate) {
    return res.status(409).json({ message: "Ce code d'accès est déjà utilisé." });
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { accessCode },
    select: { accessCode: true }
  });

  return res.json(updated);
});
