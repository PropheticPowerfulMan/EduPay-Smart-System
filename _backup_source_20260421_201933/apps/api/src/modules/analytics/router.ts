import { Router } from "express";
import dayjs from "dayjs";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

export const analyticsRouter = Router();
analyticsRouter.use(authGuard);

analyticsRouter.get("/overview", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const schoolId = req.user!.schoolId;
  const startMonth = dayjs().startOf("month").toDate();

  const [totalRevenue, monthlyRevenue, totalPayments, successfulPayments, outstanding] = await Promise.all([
    prisma.payment.aggregate({ where: { schoolId, status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { schoolId, status: "COMPLETED", createdAt: { gte: startMonth } }, _sum: { amount: true } }),
    prisma.payment.count({ where: { schoolId } }),
    prisma.payment.count({ where: { schoolId, status: "COMPLETED" } }),
    prisma.student.findMany({ where: { schoolId }, select: { annualFee: true, payments: { where: { status: "COMPLETED" }, select: { amount: true } } } })
  ]);

  const debt = outstanding.reduce((acc, st) => {
    const paid = st.payments.reduce((s, p) => s + p.amount, 0);
    return acc + Math.max(st.annualFee - paid, 0);
  }, 0);

  return res.json({
    totalRevenue: totalRevenue._sum.amount || 0,
    monthlyRevenue: monthlyRevenue._sum.amount || 0,
    paymentSuccessRate: totalPayments ? (successfulPayments / totalPayments) * 100 : 0,
    outstandingDebt: debt
  });
});
