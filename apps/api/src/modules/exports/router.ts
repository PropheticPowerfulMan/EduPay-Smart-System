import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

export const exportRouter = Router();
exportRouter.use(authGuard);

exportRouter.get("/payments.xlsx", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payments = await prisma.payment.findMany({
    where: { schoolId: req.user!.schoolId },
    include: { parent: true }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payments");
  sheet.columns = [
    { header: "Transaction", key: "tx", width: 28 },
    { header: "Parent", key: "parent", width: 28 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Status", key: "status", width: 16 },
    { header: "Method", key: "method", width: 18 }
  ];

  payments.forEach((p) => {
    sheet.addRow({
      tx: p.transactionNumber,
      parent: p.parent.fullName,
      amount: p.amount,
      status: p.status,
      method: p.method
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=payments.xlsx");
  res.send(Buffer.from(buffer));
});

exportRouter.get("/report.pdf", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const revenue = await prisma.payment.aggregate({
    where: { schoolId: req.user!.schoolId, status: "COMPLETED" },
    _sum: { amount: true }
  });

  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  doc.on("end", () => {
    const buffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=financial-report.pdf");
    res.send(buffer);
  });

  doc.fontSize(18).text("EduPay Financial Report");
  doc.moveDown();
  doc.fontSize(12).text(`Total completed revenue: ${revenue._sum.amount || 0}`);
  doc.end();
});
