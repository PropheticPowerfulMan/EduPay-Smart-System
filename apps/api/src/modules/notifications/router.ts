import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { getMessagingConfigStatus, sendEmail, sendSms } from "../../utils/messaging";

const manualChannelsSchema = z.array(z.enum(["EMAIL", "SMS"])).min(1);

const sendSchema = z.object({
  parentId: z.string(),
  type: z.enum(["CONFIRMATION", "REMINDER", "LATE_ALERT"]),
  language: z.enum(["fr", "en"]).default("fr"),
  channel: z.enum(["SMS", "EMAIL"]),
  subject: z.string().optional(),
  body: z.string().min(3)
});

const manualMessageSchema = z.object({
  parentIds: z.array(z.string().min(1)).min(1),
  language: z.enum(["fr", "en"]).default("fr"),
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(3).max(5000),
  channels: manualChannelsSchema
});

const manualMessageQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional().default(120)
});

function buildDashboardMessageBody(subject: string | undefined, body: string) {
  const cleanBody = body.trim();
  const cleanSubject = subject?.trim();
  if (!cleanSubject) return cleanBody;
  return [`Objet : ${cleanSubject}`, "", cleanBody].join("\n");
}

function buildDeliverySummary(input: { dashboard: string; email?: string; sms?: string }) {
  return [
    `DASHBOARD:${input.dashboard}`,
    input.email ? `EMAIL:${input.email}` : null,
    input.sms ? `SMS:${input.sms}` : null
  ].filter(Boolean).join(" | ");
}

export const notificationRouter = Router();
notificationRouter.use(authGuard);

notificationRouter.get("/status", authorize("ADMIN", "ACCOUNTANT"), async (_req: AuthenticatedRequest, res) => {
  res.json(getMessagingConfigStatus());
});

notificationRouter.get("/messages", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const query = manualMessageQuerySchema.parse(req.query);
  const logs = await prisma.notificationLog.findMany({
    where: {
      schoolId: req.user!.schoolId,
      type: "MANUAL_MESSAGE",
      ...(query.parentId ? { parentId: query.parentId } : {}),
    },
    include: {
      parent: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });

  return res.json(logs.map((log) => ({
    id: log.id,
    parentId: log.parentId,
    parentName: log.parent.fullName,
    parentPhone: log.parent.phone,
    parentEmail: log.parent.email,
    type: log.type,
    language: log.language,
    channel: log.channel,
    content: log.content,
    status: log.status,
    createdAt: log.createdAt,
  })));
});

notificationRouter.post("/messages", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = manualMessageSchema.parse(req.body);
  const parents = await prisma.parent.findMany({
    where: {
      schoolId: req.user!.schoolId,
      id: { in: payload.parentIds },
    },
    orderBy: { fullName: "asc" },
  });

  if (parents.length === 0) {
    return res.status(404).json({ message: "Aucun parent valide n'a été sélectionné." });
  }

  const results = [] as Array<{
    parentId: string;
    parentName: string;
    email: string;
    sms: string;
    dashboard: string;
    logId: string;
  }>;

  const dashboardContent = buildDashboardMessageBody(payload.subject, payload.body);
  const emailSubject = payload.subject?.trim() || "Message du service financier EduPay";

  for (const parent of parents) {
    const status = {
      dashboard: "OPEN",
      email: payload.channels.includes("EMAIL")
        ? (parent.email ? "PENDING" : "SKIPPED")
        : "DISABLED",
      sms: payload.channels.includes("SMS")
        ? (parent.phone ? "PENDING" : "SKIPPED")
        : "DISABLED",
    };

    if (payload.channels.includes("EMAIL") && parent.email) {
      status.email = await sendEmail({
        to: parent.email,
        subject: emailSubject,
        text: dashboardContent,
      });
    }

    if (payload.channels.includes("SMS") && parent.phone) {
      status.sms = await sendSms({
        to: parent.phone,
        text: payload.body,
      });
    }

    const log = await prisma.notificationLog.create({
      data: {
        schoolId: req.user!.schoolId,
        parentId: parent.id,
        type: "MANUAL_MESSAGE",
        language: payload.language,
        channel: "DASHBOARD",
        content: dashboardContent,
        status: buildDeliverySummary(status),
      },
    });

    results.push({
      parentId: parent.id,
      parentName: parent.fullName,
      email: status.email,
      sms: status.sms,
      dashboard: status.dashboard,
      logId: log.id,
    });
  }

  return res.status(201).json({
    sentCount: results.length,
    parentIdsMissing: payload.parentIds.filter((parentId) => !parents.some((parent) => parent.id === parentId)),
    messages: results,
  });
});

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
