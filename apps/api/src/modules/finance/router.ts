import { AgreementStatus, GradeGroup, PaymentOptionType, ReportType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { prisma } from "../../prisma";
import {
  createSpecialFinancialAgreement,
  ensureOfficialKcsCatalog,
  getParentFinancialSnapshot,
  getReductionAnalytics,
  getSchoolFinanceOverview,
  runOverdueTuitionReminderSweep,
  upsertParentPlanAssignment
} from "./service";

const assignmentSchema = z.object({
  parentId: z.string().min(1),
  studentId: z.string().optional(),
  academicYearName: z.string().optional(),
  paymentOptionType: z.nativeEnum(PaymentOptionType),
  gradeGroup: z.nativeEnum(GradeGroup).optional(),
  notes: z.string().max(2000).optional()
});

const agreementInstallmentSchema = z.object({
  label: z.string().min(1),
  dueDate: z.string().min(1),
  amountDue: z.number().positive(),
  notes: z.string().max(2000).optional()
});

const agreementSchema = z.object({
  parentId: z.string().min(1),
  studentId: z.string().optional(),
  academicYearName: z.string().optional(),
  title: z.string().min(3),
  customTotal: z.number().positive(),
  reductionAmount: z.number().min(0).optional().default(0),
  gradeGroup: z.nativeEnum(GradeGroup).optional(),
  notes: z.string().max(4000).optional(),
  privateNotes: z.string().max(8000).optional(),
  status: z.nativeEnum(AgreementStatus).optional(),
  installments: z.array(agreementInstallmentSchema).min(1)
});

const overdueReminderSweepSchema = z.object({
  parentId: z.string().min(1).optional(),
  academicYearName: z.string().optional()
});

export const financeRouter = Router();
financeRouter.use(authGuard);

financeRouter.get("/catalog", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req: AuthenticatedRequest, res) => {
  try {
    const catalog = await ensureOfficialKcsCatalog(req.user!.schoolId);
    return res.json(catalog);
  } catch (error) {
    console.error("Finance catalog error", error);
    return res.status(500).json({ message: "Unable to load official KCS tuition catalog." });
  }
});

financeRouter.get("/overview", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const overview = await getSchoolFinanceOverview({
      schoolId: req.user!.schoolId,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined
    });
    return res.json(overview);
  } catch (error) {
    console.error("Finance overview error", error);
    return res.status(500).json({ message: "Unable to build finance overview." });
  }
});

financeRouter.get("/parents/:parentId/profile", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    await runOverdueTuitionReminderSweep({
      schoolId: req.user!.schoolId,
      parentId: req.params.parentId,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined
    });
    const snapshot = await getParentFinancialSnapshot({
      schoolId: req.user!.schoolId,
      parentId: req.params.parentId,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined
    });
    return res.json(snapshot);
  } catch (error) {
    console.error("Parent finance profile error", error);
    return res.status(404).json({ message: "Parent finance profile not found." });
  }
});

financeRouter.get("/me/profile", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  try {
    const parentRecord = await prisma.parent.findFirst({
      where: { schoolId: req.user!.schoolId, userId: req.user!.sub },
      select: { id: true }
    });
    const parent = parentRecord?.id ?? ((req.user && req.user.role === "PARENT") ? req.user.sub : "");
    await runOverdueTuitionReminderSweep({
      schoolId: req.user!.schoolId,
      parentId: parent,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined
    });
    const snapshot = await getParentFinancialSnapshot({
      schoolId: req.user!.schoolId,
      parentId: parent,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined
    });
    return res.json(snapshot);
  } catch (error) {
    console.error("Current parent finance profile error", error);
    return res.status(404).json({ message: "Parent finance profile not found." });
  }
});

financeRouter.post("/overdue-reminders/run", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = overdueReminderSweepSchema.parse(req.body ?? {});
    const result = await runOverdueTuitionReminderSweep({
      schoolId: req.user!.schoolId,
      parentId: payload.parentId,
      academicYearName: payload.academicYearName
    });
    return res.json(result);
  } catch (error) {
    console.error("Overdue reminder sweep error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to run overdue reminder sweep." });
  }
});

financeRouter.get("/reductions", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const periodType = typeof req.query.periodType === "string" && req.query.periodType in ReportType
      ? req.query.periodType as ReportType
      : ReportType.MONTHLY;
    const report = await getReductionAnalytics({
      schoolId: req.user!.schoolId,
      academicYearName: typeof req.query.academicYear === "string" ? req.query.academicYear : undefined,
      periodType,
      referenceDate: typeof req.query.referenceDate === "string" ? req.query.referenceDate : undefined
    });
    return res.json(report);
  } catch (error) {
    console.error("Reduction analytics error", error);
    return res.status(500).json({ message: "Unable to generate reduction analytics." });
  }
});

financeRouter.post("/assignments", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = assignmentSchema.parse(req.body);
    const assignment = await upsertParentPlanAssignment({
      schoolId: req.user!.schoolId,
      ...payload
    });
    return res.status(201).json(assignment);
  } catch (error) {
    console.error("Plan assignment error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to assign tuition plan." });
  }
});

financeRouter.post("/agreements", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = agreementSchema.parse(req.body);
    const agreement = await createSpecialFinancialAgreement({
      schoolId: req.user!.schoolId,
      approvedById: req.user!.sub,
      ...payload
    });
    return res.status(201).json(agreement);
  } catch (error) {
    console.error("Special agreement error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create special agreement." });
  }
});
