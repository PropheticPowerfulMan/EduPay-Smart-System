import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { env } from "../../config/env";

const sendSchema = z.object({
  parentId: z.string(),
  type: z.enum(["CONFIRMATION", "REMINDER", "LATE_ALERT"]),
  language: z.enum(["fr", "en"]).default("fr"),
  channel: z.enum(["SMS", "EMAIL"]),
  subject: z.string().optional(),
  body: z.string().min(3)
});

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

export const notificationRouter = Router();
notificationRouter.use(authGuard);

notificationRouter.post("/send", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = sendSchema.parse(req.body);
  const parent = await prisma.parent.findUnique({ where: { id: payload.parentId } });

  if (!parent) return res.status(404).json({ message: "Parent introuvable" });

  if (payload.channel === "EMAIL") {
    await transporter.sendMail({
      from: env.SMTP_USER,
      to: parent.email,
      subject: payload.subject || "Notification EduPay",
      text: payload.body
    });
  }

  if (payload.channel === "SMS") {
    // Stub AfrikTalk integration point.
  }

  const log = await prisma.notificationLog.create({
    data: {
      schoolId: req.user!.schoolId,
      parentId: parent.id,
      type: payload.type,
      language: payload.language,
      channel: payload.channel,
      content: payload.body,
      status: "SENT"
    }
  });

  res.status(201).json(log);
});
