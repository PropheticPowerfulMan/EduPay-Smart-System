import { Router } from "express";
import dayjs from "dayjs";
import PDFDocument from "pdfkit";
import { PNG } from "pngjs";
import { z } from "zod";
import { prisma } from "../../prisma";
import { amountToWords } from "../../utils/amount-words";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const createPaymentSchema = z.object({
  parentId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1),
  reason: z.string().min(3),
  amount: z.number().positive(),
  method: z.enum(["CASH", "AIRTEL_MONEY", "MPESA", "ORANGE_MONEY"]),
  status: z.enum(["COMPLETED", "PENDING", "FAILED"]).default("COMPLETED")
});

function generateTxNumber() {
  return `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function generateReceiptPdf(data: {
  receiptId: string;
  schoolName: string;
  parentName: string;
  students: string[];
  amount: number;
  reason: string;
  date: string;
}) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).fillColor("#0b2e59").text(data.schoolName);
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor("#111111").text(`Receipt ID: ${data.receiptId}`);
    doc.text(`Parent: ${data.parentName}`);
    doc.text(`Students: ${data.students.join(", ")}`);
    doc.text(`Amount: ${data.amount}`);
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

export const paymentRouter = Router();
paymentRouter.use(authGuard);

paymentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = createPaymentSchema.parse(req.body);

  const duplicate = await prisma.payment.findFirst({
    where: {
      schoolId: req.user!.schoolId,
      parentId: payload.parentId,
      reason: payload.reason,
      amount: payload.amount,
      createdAt: {
        gte: dayjs().subtract(5, "minute").toDate()
      }
    }
  });

  if (duplicate) {
    return res.status(409).json({ message: "Paiement duplique detecte" });
  }

  const txNumber = generateTxNumber();

  const payment = await prisma.payment.create({
    data: {
      schoolId: req.user!.schoolId,
      transactionNumber: txNumber,
      parentId: payload.parentId,
      reason: payload.reason,
      amount: payload.amount,
      amountInWords: amountToWords(Math.round(payload.amount), "fr"),
      method: payload.method,
      status: payload.status,
      createdById: req.user!.sub,
      students: {
        connect: payload.studentIds.map((id) => ({ id }))
      }
    },
    include: {
      parent: true,
      students: true
    }
  });

  const receiptId = `RCPT-${Date.now()}`;
  const pdfBuffer = await generateReceiptPdf({
    receiptId,
    schoolName: "EduPay Smart School",
    parentName: payment.parent.fullName,
    students: payment.students.map((s) => s.fullName),
    amount: payment.amount,
    reason: payment.reason,
    date: dayjs(payment.createdAt).format("DD/MM/YYYY HH:mm")
  });
  const pngBuffer = generateReceiptPng();

  const receipt = await prisma.receipt.create({
    data: {
      schoolId: req.user!.schoolId,
      receiptNumber: receiptId,
      paymentId: payment.id,
      pdfBase64: pdfBuffer.toString("base64"),
      pngBase64: pngBuffer.toString("base64")
    }
  });

  await prisma.auditLog.create({
    data: {
      schoolId: req.user!.schoolId,
      userId: req.user!.sub,
      action: "PAYMENT_CREATED",
      metadata: { paymentId: payment.id, receiptId: receipt.id }
    }
  });

  return res.status(201).json({ payment, receipt });
});

paymentRouter.get("/", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req: AuthenticatedRequest, res) => {
  const where = req.user!.role === "PARENT"
    ? { schoolId: req.user!.schoolId, parent: { userId: req.user!.sub } }
    : { schoolId: req.user!.schoolId };

  const payments = await prisma.payment.findMany({
    where,
    include: {
      parent: true,
      students: true,
      receipt: true
    },
    orderBy: { createdAt: "desc" }
  });

  res.json(payments);
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
