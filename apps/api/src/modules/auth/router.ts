import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../prisma";
import { env } from "../../config/env";
import { authGuard, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail } from "../../utils/messaging";

const registerSchema = z.object({
  fullName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "ACCOUNTANT", "PARENT"]),
  schoolId: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
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

function buildToken(user: { id: string; role: "ADMIN" | "ACCOUNTANT" | "PARENT"; schoolId: string }) {
  return jwt.sign({ sub: user.id, role: user.role, schoolId: user.schoolId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any
  });
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const payload = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(payload.password, 10);

  const user = await prisma.user.create({
    data: {
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
      schoolId: payload.schoolId,
      passwordHash: hash
    }
  });

  res.status(201).json({ id: user.id });
});

authRouter.post("/login", async (req, res) => {
  const payload = loginSchema.parse(req.body);

  try {
    const user = await prisma.user.findUnique({ where: { email: payload.email } });

    if (user) {
      const ok = await bcrypt.compare(payload.password, user.passwordHash);
      if (ok) {
        const token = buildToken({ id: user.id, role: user.role, schoolId: user.schoolId });
        const parent = user.role === "PARENT"
          ? await prisma.parent.findUnique({ where: { userId: user.id }, select: { id: true } })
          : null;
        return res.json({ token, role: user.role, fullName: user.fullName, parentId: parent?.id });
      }
    }
  } catch (error) {
    console.error("Database unavailable on login, using demo fallback", error);
  }

  const demoUser = demoUsers.find((entry) =>
    entry.email.toLowerCase() === payload.email.toLowerCase() && entry.password === payload.password
  );

  if (demoUser) {
    const token = buildToken({ id: `demo-${demoUser.role.toLowerCase()}`, role: demoUser.role, schoolId: demoUser.schoolId });
    return res.json({ token, role: demoUser.role, fullName: demoUser.fullName, parentId: "parentId" in demoUser ? demoUser.parentId : undefined });
  }

  return res.status(401).json({ message: "Identifiants invalides" });
});

authRouter.post("/forgot-password", async (req, res) => {
  const payload = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!payload.success) return res.json({ message: "Si cet email existe, un lien de reinitialisation sera envoye." });

  try {
    const user = await prisma.user.findUnique({ where: { email: payload.data.email } });
    if (user) {
      await sendEmail({
        to: user.email,
        subject: "Demande de reinitialisation EduPay",
        text: [
          `Bonjour ${user.fullName},`,
          "",
          "Une demande de reinitialisation de mot de passe a ete recue pour votre compte EduPay.",
          "Veuillez contacter l'administration de l'ecole pour recevoir un mot de passe temporaire securise.",
          "",
          "Si vous n'etes pas a l'origine de cette demande, ignorez ce message."
        ].join("\n")
      });
    }
  } catch (error) {
    console.error("Forgot password email flow failed", error);
  }

  return res.json({ message: "Si cet email existe, un lien de reinitialisation sera envoye." });
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
    data: { passwordHash }
  });

  await sendEmail({
    to: user.email,
    subject: "Mot de passe EduPay modifie",
    text: [
      `Bonjour ${user.fullName},`,
      "",
      "Votre mot de passe EduPay vient d'etre modifie avec succes.",
      "Si vous n'avez pas effectue cette action, contactez immediatement l'administration de l'ecole."
    ].join("\n")
  });

  return res.json({ message: "Mot de passe modifie avec succes." });
});
