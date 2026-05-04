import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { sendEmail, sendSms } from "../../utils/messaging";

const sendSchema = z.object({
  parentId: z.string(),
  type: z.enum(["CONFIRMATION", "REMINDER", "LATE_ALERT"]),
  language: z.enum(["fr", "en"]).default("fr"),
  channel: z.enum(["SMS", "EMAIL"]),
  subject: z.string().optional(),
  body: z.string().min(3)
});

export const notificationRouter = Router();
notificationRouter.use(authGuard);

notificationRouter.post("/send", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = sendSchema.parse(req.body);
  const parent = await prisma.parent.findUnique({ where: { id: payload.parentId } });

  if (!parent) return res.status(404).json({ message: "Parent introuvable" });

  const status = payload.channel === "EMAIL"
    ? await sendEmail({
      to: parent.email,
      subject: payload.subject || "Notification EduPay",
      text: payload.body
    })
    : await sendSms({ to: parent.phone, text: payload.body });

  const log = await prisma.notificationLog.create({
    data: {
      schoolId: req.user!.schoolId,
      parentId: parent.id,
      type: payload.type,
      language: payload.language,
      channel: payload.channel,
      content: payload.body,
      status
    }
  });

  res.status(201).json(log);
});
