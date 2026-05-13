import { Router } from "express";
import dayjs from "dayjs";
import PDFDocument from "pdfkit";
import { PNG } from "pngjs";
import { z } from "zod";
import { prisma } from "../../prisma";
import { syncPaymentToOrbit } from "../../integrations/orbit";
import { amountToWords } from "../../utils/amount-words";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { sendEmail, sendSms } from "../../utils/messaging";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { applyPaymentToFinanceLedger, runOverdueTuitionReminderSweep } from "../finance/service";

const createPaymentSchema = z.object({
  parentFullName: z.string().optional().default(""),
  parentId: z.string().optional(),
  studentIds: z.array(z.string()).optional().default([]),
  studentExternalIds: z.array(z.string().min(1)).optional().default([]),
  studentDisplayName: z.string().optional(),
  reason: z.string().min(3),
  amount: z.number().positive(),
  method: z.enum(["CASH", "AIRTEL_MONEY", "MPESA", "ORANGE_MONEY"]),
  status: z.enum(["COMPLETED", "PENDING", "FAILED"]).default("COMPLETED"),
  transactionNumber: z.string().optional(),
  notifyParent: z.boolean().optional()
}).superRefine((payload, context) => {
  if (orbitRegistryIsEnabled() && payload.studentExternalIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentExternalIds"],
      message: "Au moins un eleve partage doit etre selectionne pour synchroniser le paiement via Orbit."
    });
  }
});

const notificationSettingsSchema = z.object({
  paymentNotificationsEnabled: z.boolean()
});

let paymentNotificationsEnabled = true;

function generateTxNumber() {
  return `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function buildPaymentSubjectName(students: Array<{ fullName: string }>, fallback: string) {
  if (students.length === 0) return fallback;
  if (students.length === 1) return students[0].fullName;
  if (students.length === 2) return `${students[0].fullName} et ${students[1].fullName}`;
  return `${students[0].fullName} + ${students.length - 1} autres`;
}

function serializePayment(
  payment: { parent?: { fullName: string } | null; students: Array<{ fullName: string }> } & Record<string, unknown>,
  options: { fallbackParentName?: string; requestedStudentDisplayName?: string } = {}
) {
  const parentFullName = payment.parent?.fullName ?? options.fallbackParentName ?? "";
  const studentNames = payment.students.map((student) => student.fullName);
  const paymentSubjectName = options.requestedStudentDisplayName?.trim() || buildPaymentSubjectName(payment.students, parentFullName);

  return {
    ...payment,
    parentFullName,
    studentNames,
    paymentSubjectName,
  };
}

function serializePublicVerificationPayment(
  payment: {
    id: string;
    transactionNumber: string;
    reason: string;
    amount: number;
    amountInWords: string;
    method: string;
    status: string;
    createdAt: Date;
    parent: { fullName: string } | null;
    students: Array<{ fullName: string }>;
    receipt: { receiptNumber: string } | null;
    school: { name: string };
  },
  req: { protocol: string; get(name: string): string | undefined }
) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const serialized = serializePayment(payment, {
    fallbackParentName: payment.parent?.fullName ?? ""
  });

  return {
    id: payment.id,
    transactionNumber: payment.transactionNumber,
    parentFullName: serialized.parentFullName,
    paymentSubjectName: serialized.paymentSubjectName,
    studentNames: serialized.studentNames,
    reason: payment.reason,
    amount: payment.amount,
    amountInWords: payment.amountInWords,
    method: payment.method,
    status: payment.status,
    date: payment.createdAt.toLocaleString("fr-FR"),
    createdAt: payment.createdAt.toISOString(),
    schoolName: payment.school.name,
    receiptNumber: payment.receipt?.receiptNumber ?? null,
    downloads: payment.receipt ? {
      pdfPath: `/api/payments/verify/${encodeURIComponent(payment.transactionNumber)}/receipt/pdf`,
      pngPath: `/api/payments/verify/${encodeURIComponent(payment.transactionNumber)}/receipt/png`,
      pdfUrl: `${baseUrl}/api/payments/verify/${encodeURIComponent(payment.transactionNumber)}/receipt/pdf`,
      pngUrl: `${baseUrl}/api/payments/verify/${encodeURIComponent(payment.transactionNumber)}/receipt/png`
    } : null
  };
}

async function generateReceiptPdf(data: {
  receiptId: string;
  schoolName: string;
  paymentSubjectName: string;
  parentName: string;
  students: string[];
  amount: number;
  reason: string;
  date: string;
}) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).fillColor("#0b2e59").text(data.schoolName);
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor("#111111").text(`Receipt ID: ${data.receiptId}`);
  doc.text(`Student account: ${data.paymentSubjectName}`);
  doc.text(`Parent notifier: ${data.parentName}`);
    doc.text(`Students: ${data.students.join(", ")}`);
    doc.text(`Amount: $ ${data.amount.toFixed(2)} USD`);
    doc.text(`Reason: ${data.reason}`);
    doc.text(`Date: ${data.date}`);
    doc.moveDown();
    doc.text("Signature: ____________________");
    doc.text("Stamp: ________________________");
    doc.end();
  });
}

function generateReceiptPng() {
  const png = new PNG({ width: 900, height: 500 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function getMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: "Cash / Especes",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money"
  };
  return labels[method] ?? method;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué"
  };
  return labels[status] ?? status;
}

function buildPaymentNotificationMessages(input: {
  parent: { id: string; fullName: string; phone: string; email: string; preferredLanguage?: string | null };
  transactionNumber: string;
  reason: string;
  amount: number;
  method: string;
  status: string;
  createdAt: Date;
  students: Array<{ fullName: string }>;
}) {
  const studentLines = input.students.length
    ? input.students.map((student) => `- ${student.fullName}`).join("\n")
    : "- Aucun eleve precise";
  const amount = `$ ${input.amount.toFixed(5)} USD`;
  const date = input.createdAt.toLocaleString("fr-FR");
  const subject = `Confirmation de paiement ${input.transactionNumber}`;
  const emailBody = [
    `Bonjour ${input.parent.fullName},`,
    "",
    "Un paiement vient d'être enregistré dans EduPay.",
    "",
    `Transaction: ${input.transactionNumber}`,
    `Date: ${date}`,
    `Motif: ${input.reason}`,
    `Montant: ${amount}`,
    `Mode de paiement: ${getMethodLabel(input.method)}`,
    `Statut: ${getStatusLabel(input.status)}`,
    "",
    "Eleves concernes:",
    studentLines,
    "",
    "Merci de conserver ce message comme confirmation de suivi."
  ].join("\n");
  const smsBody = `EduPay: paiement ${input.transactionNumber}. Parent: ${input.parent.fullName}. Motif: ${input.reason}. Montant: ${amount}. Statut: ${getStatusLabel(input.status)}.`;
  return { subject, emailBody, smsBody };
}

async function sendPaymentNotifications(input: {
  schoolId: string;
  parent: { id: string; fullName: string; phone: string; email: string; preferredLanguage?: string | null };
  transactionNumber: string;
  reason: string;
  amount: number;
  method: string;
  status: string;
  createdAt: Date;
  students: Array<{ fullName: string }>;
}) {
  const messages = buildPaymentNotificationMessages(input);
  const status = {
    email: input.parent.email ? "PENDING" : "SKIPPED",
    sms: input.parent.phone ? "PENDING" : "SKIPPED"
  };

  if (input.parent.email) {
    status.email = await sendEmail({
      to: input.parent.email,
      subject: messages.subject,
      text: messages.emailBody
    });
    await prisma.notificationLog.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parent.id,
        type: "CONFIRMATION",
        language: input.parent.preferredLanguage || "fr",
        channel: "EMAIL",
        content: messages.emailBody,
        status: status.email
      }
    }).catch((error) => console.error("Payment email notification log failed", error));
  }

  if (input.parent.phone) {
    status.sms = await sendSms({ to: input.parent.phone, text: messages.smsBody });
    await prisma.notificationLog.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parent.id,
        type: "CONFIRMATION",
        language: input.parent.preferredLanguage || "fr",
        channel: "SMS",
        content: messages.smsBody,
        status: status.sms
      }
    }).catch((error) => console.error("Payment SMS notification log failed", error));
  }

  return status;
}

export const paymentRouter = Router();

paymentRouter.get("/verify/:transactionNumber", async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { transactionNumber: req.params.transactionNumber },
      include: {
        parent: true,
        students: true,
        receipt: true,
        school: { select: { name: true } }
      }
    });

    if (!payment) {
      return res.status(404).json({ message: "Paiement introuvable" });
    }

    return res.json({
      source: "database",
      payment: serializePublicVerificationPayment(payment, req)
    });
  } catch (error) {
    console.error("Public payment verification failed", error);
    return res.status(503).json({ message: "Verification indisponible" });
  }
});

paymentRouter.get("/verify/:transactionNumber/receipt/pdf", async (req, res) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { payment: { transactionNumber: req.params.transactionNumber } }
    });
    if (!receipt) return res.status(404).json({ message: "Recu introuvable" });
    const buffer = Buffer.from(receipt.pdfBase64, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${receipt.receiptNumber}.pdf`);
    return res.send(buffer);
  } catch (error) {
    console.error("Public receipt PDF download failed", error);
    return res.status(503).json({ message: "Recu indisponible" });
  }
});

paymentRouter.get("/verify/:transactionNumber/receipt/png", async (req, res) => {
  try {
    const receipt = await prisma.receipt.findFirst({
      where: { payment: { transactionNumber: req.params.transactionNumber } }
    });
    if (!receipt) return res.status(404).json({ message: "Recu introuvable" });
    const buffer = Buffer.from(receipt.pngBase64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename=${receipt.receiptNumber}.png`);
    return res.send(buffer);
  } catch (error) {
    console.error("Public receipt PNG download failed", error);
    return res.status(503).json({ message: "Recu indisponible" });
  }
});

paymentRouter.use(authGuard);

paymentRouter.get("/settings/notifications", authorize("ADMIN", "ACCOUNTANT"), (_req, res) => {
  return res.json({ paymentNotificationsEnabled });
});

paymentRouter.put("/settings/notifications", authorize("ADMIN"), (req, res) => {
  const payload = notificationSettingsSchema.parse(req.body);
  paymentNotificationsEnabled = payload.paymentNotificationsEnabled;
  return res.json({ paymentNotificationsEnabled });
});

paymentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  let payload: z.infer<typeof createPaymentSchema>;
  try {
    payload = createPaymentSchema.parse(req.body);
  } catch (err) {
    return res.status(400).json({ message: "Données invalides", error: err });
  }

  const txNumber = payload.transactionNumber ?? generateTxNumber();

  try {
    if (orbitRegistryIsEnabled()) {
      await syncOrbitRegistryMirror(req.user!.schoolId);
    }
    // Check for duplicate in last 5 minutes
    const duplicate = await prisma.payment.findFirst({
      where: {
        schoolId: req.user!.schoolId,
        reason: payload.reason,
        amount: payload.amount,
        createdAt: { gte: dayjs().subtract(5, "minute").toDate() }
      }
    });
    if (duplicate) {
      return res.status(409).json({ message: "Paiement dupliqué détecté" });
    }

    let parent = null as null | Awaited<ReturnType<typeof prisma.parent.findFirst>>;
    let parentId = payload.parentId;
    if (!parentId) {
      parent = await prisma.parent.findFirst({
        where: {
          schoolId: req.user!.schoolId,
          fullName: payload.parentFullName
        }
      });
      parentId = parent?.id;
    }
    if (!parent && parentId) {
      parent = await prisma.parent.findFirst({ where: { id: parentId, schoolId: req.user!.schoolId } });
    }
    if (!parentId) {
      throw new Error("Parent introuvable pour ce paiement");
    }

    const payment = await prisma.payment.create({
      data: {
        schoolId: req.user!.schoolId,
        transactionNumber: txNumber,
        parentId,
        reason: payload.reason,
        amount: payload.amount,
        amountInWords: `${amountToWords(payload.amount, "fr")} dollars americains`,
        method: payload.method,
        status: payload.status,
        createdById: req.user!.sub,
        ...(payload.studentIds && payload.studentIds.length > 0
          ? { students: { connect: payload.studentIds.map((id) => ({ id })) } }
          : {})
      },
      include: { parent: true, students: true }
    });

    await applyPaymentToFinanceLedger({
      schoolId: req.user!.schoolId,
      paymentId: payment.id,
      parentId,
      studentIds: payment.students.map((student) => student.id)
    }).catch((error) => console.error("Finance ledger sync failed", error));
    await runOverdueTuitionReminderSweep({
      schoolId: req.user!.schoolId,
      parentId
    }).catch((error) => console.error("Overdue tuition reminder sweep failed", error));

    try {
      const syncedStudentExternalIds = payload.studentExternalIds.length > 0
        ? payload.studentExternalIds
        : payment.students
          .map((student) => student.externalStudentId)
          .filter((value): value is string => Boolean(value));

      const studentsMissingExternalIds = payment.students.filter((student) => !student.externalStudentId);

      if (orbitRegistryIsEnabled() && (syncedStudentExternalIds.length === 0 || studentsMissingExternalIds.length > 0)) {
        console.warn("Orbit payment sync skipped: one or more EduPay students are not linked to a shared external student id", {
          paymentId: payment.id,
          localStudentIds: studentsMissingExternalIds.map((student) => student.id),
          requestedStudentExternalIds: payload.studentExternalIds
        });
      } else {
        await syncPaymentToOrbit({
          payment: {
            id: payment.id,
            transactionNumber: payment.transactionNumber,
            amount: payment.amount,
            reason: payment.reason,
            method: payment.method,
            status: payment.status,
            createdAt: payment.createdAt,
            schoolId: payment.schoolId,
            parentId: payment.parentId
          },
          studentExternalIds: syncedStudentExternalIds,
          localStudentIds: payment.students.map((student) => student.id)
        });
      }
    } catch (error) {
      console.error("Orbit payment sync failed", error);
    }

    const paymentWithRelations = payment as typeof payment & { parent?: { fullName: string } | null };
    const shouldNotify = payload.notifyParent ?? paymentNotificationsEnabled;
    const notificationStatus = shouldNotify && payment.parent
      ? await sendPaymentNotifications({
        schoolId: req.user!.schoolId,
        parent: payment.parent,
        transactionNumber: payment.transactionNumber,
        reason: payment.reason,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        createdAt: payment.createdAt,
        students: payment.students
      })
      : { email: shouldNotify ? "SKIPPED" : "DISABLED", sms: shouldNotify ? "SKIPPED" : "DISABLED" };

    return res.status(201).json({
      payment: serializePayment(payment as typeof payment & { parent?: { fullName: string } | null }, {
        fallbackParentName: payload.parentFullName ?? paymentWithRelations.parent?.fullName,
        requestedStudentDisplayName: payload.studentDisplayName,
      }),
      notificationStatus
    });
  } catch (_dbErr) {
    const shouldNotify = payload.notifyParent ?? paymentNotificationsEnabled;
    // Demo mode — no DB available
    return res.status(201).json({
      payment: {
        id: `demo-${Date.now()}`,
        transactionNumber: txNumber,
        parentFullName: payload.parentFullName,
        studentNames: [],
        paymentSubjectName: payload.studentDisplayName?.trim() || payload.parentFullName,
        reason: payload.reason,
        amount: payload.amount,
        amountInWords: `${amountToWords(payload.amount, "fr")} dollars americains`,
        method: payload.method,
        status: payload.status,
        createdAt: new Date().toISOString()
      },
      notificationStatus: { email: shouldNotify ? "SKIPPED" : "DISABLED", sms: shouldNotify ? "SKIPPED" : "DISABLED" }
    });
  }
});

paymentRouter.get("/", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req: AuthenticatedRequest, res) => {
  const where = req.user!.role === "PARENT"
    ? { schoolId: req.user!.schoolId, parent: { userId: req.user!.sub } }
    : { schoolId: req.user!.schoolId };

  try {
    const payments = await prisma.payment.findMany({
      where,
      include: {
        parent: true,
        students: true,
        receipt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json(payments.map((payment) => serializePayment(payment)));
  } catch (error) {
    console.error("DB unavailable on payment list, returning empty list", error);
    return res.json([]);
  }
});

paymentRouter.get("/:id/receipt/pdf", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req, res) => {
  const receipt = await prisma.receipt.findFirst({ where: { paymentId: req.params.id } });
  if (!receipt) return res.status(404).json({ message: "Recu introuvable" });
  const buffer = Buffer.from(receipt.pdfBase64, "base64");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${receipt.receiptNumber}.pdf`);
  return res.send(buffer);
});

paymentRouter.get("/:id/receipt/png", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req, res) => {
  const receipt = await prisma.receipt.findFirst({ where: { paymentId: req.params.id } });
  if (!receipt) return res.status(404).json({ message: "Recu introuvable" });
  const buffer = Buffer.from(receipt.pngBase64, "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename=${receipt.receiptNumber}.png`);
  return res.send(buffer);
});
