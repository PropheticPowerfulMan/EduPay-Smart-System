import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../prisma";
import { env } from "../../config/env";
import { syncOrbitRegistryMirror, type SharedParentOption } from "../../integrations/orbitRegistry";
import { authGuard, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail } from "../../utils/messaging";

type StaffRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "FINANCIAL_MANAGER" | "ACCOUNTANT" | "CASHIER" | "HR_MANAGER" | "AUDITOR" | "PARENT";

function generateAccessCode(role: StaffRole) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ACC-${role.slice(0, 3)}-${suffix}`;
}

function normalizeAccessCode(value?: string | null) {
  return (value || "").trim().toUpperCase();
}

function savanexAuthIsEnabled() {
  return Boolean(env.SAVANEX_API_URL);
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
  identifier: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(8)
}).refine((value) => Boolean(value.identifier?.trim() || value.email?.trim()), {
  message: "E-mail ou code d'accès requis",
  path: ["identifier"]
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

async function resolveParentForUser(user: { id: string; role: StaffRole; schoolId: string; email: string }) {
  if (user.role !== "PARENT") return null;

  const linkedParent = await prisma.parent.findUnique({
    where: { userId: user.id },
    select: { id: true, photoUrl: true }
  });
  if (linkedParent) return linkedParent;

  const parentByEmail = await prisma.parent.findFirst({
    where: {
      schoolId: user.schoolId,
      email: { equals: user.email, mode: "insensitive" }
    },
    select: { id: true, userId: true, photoUrl: true }
  });

  if (!parentByEmail) return null;
  if (parentByEmail.userId && parentByEmail.userId !== user.id) return null;

  if (!parentByEmail.userId) {
    await prisma.parent.update({
      where: { id: parentByEmail.id },
      data: { userId: user.id }
    });
  }

  return { id: parentByEmail.id, photoUrl: parentByEmail.photoUrl };
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

function matchesSharedParent(sharedParent: SharedParentOption, identifier: string, email: string, accessCode: string) {
  const normalizedIdentifier = identifier.trim();
  return Boolean(
    (accessCode && sharedParent.accessCode === accessCode)
    || (email && sharedParent.email.trim().toLowerCase() === email)
    || sharedParent.id === normalizedIdentifier
    || sharedParent.displayId === normalizedIdentifier
    || sharedParent.orbitId === normalizedIdentifier
    || sharedParent.fullName.trim().toLowerCase() === email
  );
}

async function authenticateWithSavanex(identifier: string, password: string) {
  if (!savanexAuthIsEnabled()) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${env.SAVANEX_API_URL.replace(/\/$/, "")}${env.SAVANEX_LOGIN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: identifier, password }),
      signal: AbortSignal.timeout(env.SAVANEX_TIMEOUT_SECONDS * 1000)
    });
  } catch {
    return null;
  }

  if ([400, 401, 403, 404].includes(response.status)) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Shared parent authentication is temporarily unavailable.");
  }

  const payload = await response.json().catch(() => ({} as Record<string, any>));
  const user = payload.user || {};
  const role = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
  if (role !== "parent") {
    return null;
  }

  const accessCode = normalizeAccessCode(typeof user.access_code === "string" ? user.access_code : identifier);
  const email = typeof user.email === "string" && user.email.trim()
    ? user.email.trim().toLowerCase()
    : `${accessCode.toLowerCase()}@savanex.local`;

  return {
    fullName: typeof user.full_name === "string" && user.full_name.trim() ? user.full_name.trim() : "Parent SAVANEX",
    email,
    accessCode,
    mustChangePassword: Boolean(user.must_change_password)
  };
}

async function resolveEduPaySchoolId() {
  const school = await prisma.school.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  return school?.id || null;
}

async function ensureExternalParentUser(options: {
  identifier: string;
  password: string;
  fullName: string;
  email: string;
  accessCode: string;
  mustChangePassword: boolean;
}) {
  const schoolId = await resolveEduPaySchoolId();
  if (!schoolId) {
    throw new Error("EduPay school bootstrap is missing.");
  }

  const mirrored = await syncOrbitRegistryMirror(schoolId);
  const sharedParent = mirrored.parents.find((entry) => matchesSharedParent(
    entry,
    options.identifier,
    options.email,
    options.accessCode
  ));

  if (!sharedParent) {
    throw new Error("Parent shared profile not found in Orbit mirror.");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: sharedParent.id, schoolId },
    include: { user: true }
  });

  if (!parent) {
    throw new Error("Parent mirror not found after Orbit synchronization.");
  }

  const passwordHash = await bcrypt.hash(options.password, 10);
  const candidateUser = parent.user || await prisma.user.findFirst({
    where: {
      schoolId,
      OR: [
        { email: options.email },
        { accessCode: options.accessCode }
      ]
    }
  });

  const user = candidateUser
    ? await prisma.user.update({
      where: { id: candidateUser.id },
      data: {
        fullName: options.fullName,
        email: options.email,
        accessCode: options.accessCode,
        passwordHash,
        mustChangePassword: options.mustChangePassword,
        role: "PARENT",
        schoolId
      }
    })
    : await prisma.user.create({
      data: {
        fullName: options.fullName,
        email: options.email,
        accessCode: options.accessCode,
        passwordHash,
        mustChangePassword: options.mustChangePassword,
        role: "PARENT",
        schoolId
      }
    });

  if (parent.userId !== user.id) {
    await prisma.parent.update({
      where: { id: parent.id },
      data: { userId: user.id }
    });
  }

  return { user, parent };
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
  message: { message: "Trop de tentatives de récupération. Réessayez plus tard." }
});

authRouter.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Données d'inscription invalides",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
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
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Identifiants invalides",
      issues: parsed.error.flatten()
    });
  }

  const payload = parsed.data;
  const identifier = normalizeIdentifier(payload.identifier || payload.email || "");
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
        const parent = await resolveParentForUser(user);
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

    const externalUser = await authenticateWithSavanex(identifier, payload.password);
    if (externalUser) {
      const resolved = await ensureExternalParentUser({
        identifier,
        password: payload.password,
        fullName: externalUser.fullName,
        email: externalUser.email,
        accessCode: externalUser.accessCode,
        mustChangePassword: externalUser.mustChangePassword
      });
      const token = buildToken({ id: resolved.user.id, role: resolved.user.role, schoolId: resolved.user.schoolId });
      return res.json({
        token,
        role: resolved.user.role,
        fullName: resolved.user.fullName,
        parentId: resolved.parent.id,
        photoUrl: resolved.parent.photoUrl,
        accessCode: resolved.user.accessCode,
        mustChangePassword: resolved.user.mustChangePassword
      });
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
  const genericMessage = "Si ce compte existe, un code de réinitialisation vient d'être envoyé.";
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
          "Une demande de réinitialisation de mot de passe a été reçue pour votre compte EduPay.",
          "",
          `Code de reinitialisation: ${token}`,
          `Lien direct: ${buildPasswordResetLink(token)}`,
          "Ce code expire dans 30 minutes et ne peut être utilisé qu'une seule fois.",
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
    subject: "Mot de passe EduPay réinitialisé",
    text: [
      `Bonjour ${resetToken.user.fullName},`,
      "",
      "Votre mot de passe EduPay vient d'être réinitialisé.",
      "Si vous n'avez pas effectue cette action, contactez immediatement l'administration."
    ].join("\n")
  }).catch((error) => console.error("Reset confirmation email failed", error));

  return res.json({ message: "Mot de passe réinitialisé. Vous pouvez vous connecter." });
});

authRouter.post("/recover-admin-password", recoveryLimiter, async (req, res) => {
  const payload = z.object({
    email: z.string().email(),
    recoveryCode: z.string().min(12),
    newPassword: z.string().min(10)
  }).parse(req.body);

  if (!env.ADMIN_RECOVERY_CODE || env.ADMIN_RECOVERY_CODE.startsWith("CHANGE_ME")) {
    return res.status(503).json({ message: "La récupération administrateur n'est pas configurée sur le serveur." });
  }

  if (payload.recoveryCode !== env.ADMIN_RECOVERY_CODE) {
    return res.status(401).json({ message: "Code de récupération invalide." });
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
    subject: "Mot de passe administrateur EduPay réinitialisé",
    text: [
      `Bonjour ${user.fullName},`,
      "",
      "Le mot de passe administrateur EduPay vient d'être réinitialisé avec le code de récupération serveur.",
      "Si vous n'avez pas effectue cette action, changez immediatement ADMIN_RECOVERY_CODE et JWT_SECRET."
    ].join("\n")
  }).catch((error) => console.error("Admin recovery email failed", error));

  return res.json({ message: "Mot de passe administrateur réinitialisé. Vous pouvez vous connecter." });
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
