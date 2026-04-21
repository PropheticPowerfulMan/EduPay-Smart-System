import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../prisma";
import { env } from "../../config/env";

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
  const user = await prisma.user.findUnique({ where: { email: payload.email } });

  if (!user) {
    return res.status(401).json({ message: "Identifiants invalides" });
  }

  const ok = await bcrypt.compare(payload.password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Identifiants invalides" });
  }

  const token = jwt.sign({ sub: user.id, role: user.role, schoolId: user.schoolId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });

  return res.json({ token, role: user.role, fullName: user.fullName });
});
