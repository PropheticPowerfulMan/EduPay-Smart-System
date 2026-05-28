import { prisma } from "../../prisma";
import { sendEmail, sendSms } from "../../utils/messaging";

type DeliveryStatus = {
  dashboard?: string;
  email?: string;
  sms?: string;
  adminEmail?: string;
};

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "ACCOUNTANT", "HR_MANAGER"] as const;

async function notifyAdmins(input: { schoolId: string; subject: string; body: string }) {
  const admins = await prisma.user.findMany({
    where: {
      schoolId: input.schoolId,
      role: { in: [...ADMIN_ROLES] },
    },
    select: { email: true },
  });

  const emails = Array.from(new Set(admins.map((admin) => admin.email).filter(Boolean)));
  if (emails.length === 0) return "SKIPPED";

  const statuses = await Promise.all(emails.map(async (email) => {
    try {
      return await sendEmail({ to: email, subject: input.subject, text: input.body });
    } catch (error) {
      console.error("[ENTITY_CHANGE_ADMIN_EMAIL] Notification failed", error);
      return "ERROR";
    }
  }));

  return statuses.every((status) => status === "SENT" || status === "SIMULATED")
    ? statuses[0]
    : statuses.join(",");
}

export async function notifyParentEntityChange(input: {
  schoolId: string;
  parentId: string;
  subject: string;
  body: string;
  email?: boolean;
  sms?: boolean;
}) {
  const parent = await prisma.parent.findFirst({
    where: { id: input.parentId, schoolId: input.schoolId },
    select: { id: true, email: true, phone: true, preferredLanguage: true },
  });

  if (!parent) {
    return { dashboard: "SKIPPED", email: "SKIPPED", sms: "SKIPPED", adminEmail: "SKIPPED" } satisfies DeliveryStatus;
  }

  const status: DeliveryStatus = {
    dashboard: "OPEN",
    email: input.email === false ? "DISABLED" : (parent.email ? "PENDING" : "SKIPPED"),
    sms: input.sms === false ? "DISABLED" : (parent.phone ? "PENDING" : "SKIPPED"),
  };

  if (input.email !== false && parent.email) {
    try {
      status.email = await sendEmail({ to: parent.email, subject: input.subject, text: input.body });
    } catch (error) {
      console.error("[ENTITY_CHANGE_PARENT_EMAIL] Notification failed", error);
      status.email = "ERROR";
    }
  }

  if (input.sms !== false && parent.phone) {
    try {
      status.sms = await sendSms({ to: parent.phone, text: input.body });
    } catch (error) {
      console.error("[ENTITY_CHANGE_PARENT_SMS] Notification failed", error);
      status.sms = "ERROR";
    }
  }

  await prisma.notificationLog.create({
    data: {
      schoolId: input.schoolId,
      parentId: parent.id,
      type: "MANUAL_MESSAGE",
      language: parent.preferredLanguage || "fr",
      channel: "DASHBOARD",
      content: [`Objet : ${input.subject}`, "", input.body].join("\n"),
      status: `DASHBOARD:${status.dashboard} | EMAIL:${status.email} | SMS:${status.sms}`,
    },
  }).catch((error) => console.error("[ENTITY_CHANGE_PARENT_DASHBOARD] Log failed", error));

  status.adminEmail = await notifyAdmins(input);
  return status;
}

export async function notifyStandaloneEntityChange(input: {
  schoolId: string;
  subject: string;
  body: string;
  email?: string | null;
  phone?: string | null;
}) {
  const status: DeliveryStatus = {
    email: input.email ? "PENDING" : "SKIPPED",
    sms: input.phone ? "PENDING" : "SKIPPED",
  };

  if (input.email) {
    try {
      status.email = await sendEmail({ to: input.email, subject: input.subject, text: input.body });
    } catch (error) {
      console.error("[ENTITY_CHANGE_STANDALONE_EMAIL] Notification failed", error);
      status.email = "ERROR";
    }
  }

  if (input.phone) {
    try {
      status.sms = await sendSms({ to: input.phone, text: input.body });
    } catch (error) {
      console.error("[ENTITY_CHANGE_STANDALONE_SMS] Notification failed", error);
      status.sms = "ERROR";
    }
  }

  status.adminEmail = await notifyAdmins(input);
  return status;
}
