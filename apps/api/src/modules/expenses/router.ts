import {
  ApprovalStepStatus,
  EmployeeDeductionMode,
  EmployeeObligationStatus,
  EmployeeObligationType,
  EmployeeRepaymentMethod,
  ExpenseCategoryType,
  ExpenseStatus,
  FinancialAttachmentKind,
  NotificationChannel,
  PayrollFrequency,
  PaymentMethod,
  Role
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import {
  createBudget,
  createEmployeeFinancialObligation,
  createExpense,
  createExpenseCategory,
  createPayrollRun,
  createSalaryProfile,
  createVendor,
  deleteVendor,
  getExpenseOverview,
  getEmployeeFinancialSnapshot,
  listAccountingEntries,
  listBudgets,
  listEmployeeFinancialObligations,
  listCashflowEntries,
  listExpenseCategories,
  listExpenses,
  listPayrollRuns,
  listSalaryProfiles,
  listVendors,
  processExpenseApproval,
  recordEmployeeRepayment,
  sendEmployeeFinancialTransparencyNotice,
  updateSalaryProfile,
  updateVendor
} from "./service";

const readRoles: Role[] = ["SUPER_ADMIN", "OWNER", "ADMIN", "FINANCIAL_MANAGER", "ACCOUNTANT", "CASHIER", "HR_MANAGER", "AUDITOR"];
const writeRoles: Role[] = ["SUPER_ADMIN", "OWNER", "ADMIN", "FINANCIAL_MANAGER", "ACCOUNTANT", "CASHIER", "HR_MANAGER"];

const expenseCategorySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(ExpenseCategoryType),
  parentCategoryId: z.string().optional(),
  description: z.string().max(2000).optional(),
  ownerApprovalRequired: z.boolean().optional()
});

const vendorSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional()
});
const vendorUpdateSchema = vendorSchema.partial().refine((payload) => Object.keys(payload).length > 0, "No vendor update provided.");

const budgetSchema = z.object({
  periodId: z.string().optional(),
  categoryId: z.string().optional(),
  name: z.string().min(2),
  department: z.string().min(2),
  plannedAmount: z.number().positive(),
  alertThreshold: z.number().min(1).max(100).optional(),
  notes: z.string().optional()
});

const attachmentSchema = z.object({
  kind: z.nativeEnum(FinancialAttachmentKind),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  mimeType: z.string().optional(),
  notes: z.string().optional()
});

const expenseSchema = z.object({
  categoryId: z.string().min(1),
  vendorId: z.string().optional(),
  budgetId: z.string().optional(),
  periodId: z.string().optional(),
  title: z.string().min(3),
  subcategory: z.string().optional(),
  description: z.string().optional(),
  department: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().default("USD").optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  supplierName: z.string().optional(),
  expenseDate: z.string().min(1),
  financialPeriodLabel: z.string().optional(),
  comments: z.string().optional(),
  attachments: z.array(attachmentSchema).optional()
});

const approvalSchema = z.object({
  status: z.enum([ApprovalStepStatus.APPROVED, ApprovalStepStatus.REJECTED]),
  comments: z.string().optional()
});

const salaryProfileSchema = z.object({
  employeeCode: z.string().min(2),
  fullName: z.string().min(3),
  department: z.string().min(2),
  position: z.string().min(2),
  baseSalary: z.number().positive(),
  currency: z.string().optional(),
  frequency: z.nativeEnum(PayrollFrequency).optional(),
  defaultBonus: z.number().min(0).optional(),
  defaultDeduction: z.number().min(0).optional(),
  advanceBalance: z.number().min(0).optional(),
  debtRecoveryRate: z.number().min(0).max(100).optional(),
  deductionMode: z.nativeEnum(EmployeeDeductionMode).optional(),
  maxDeductionRate: z.number().min(0).max(80).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  notes: z.string().optional()
});

const salaryProfileUpdateSchema = salaryProfileSchema.partial().extend({
  isActive: z.boolean().optional()
});

const payrollRunSchema = z.object({
  title: z.string().min(3),
  periodId: z.string().optional(),
  department: z.string().optional(),
  frequency: z.nativeEnum(PayrollFrequency).optional(),
  notes: z.string().optional()
});

export const expenseRouter = Router();
expenseRouter.use(authGuard);

expenseRouter.get("/overview", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const overview = await getExpenseOverview({ schoolId: req.user!.schoolId });
    return res.json(overview);
  } catch (error) {
    console.error("Expense overview error", error);
    return res.status(500).json({ message: "Unable to load financial operations overview." });
  }
});

expenseRouter.get("/categories", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listExpenseCategories({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Expense categories error", error);
    return res.status(500).json({ message: "Unable to load expense categories." });
  }
});

expenseRouter.post("/categories", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = expenseCategorySchema.parse(req.body);
    return res.status(201).json(await createExpenseCategory({ schoolId: req.user!.schoolId, ...payload }));
  } catch (error) {
    console.error("Expense category create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create expense category." });
  }
});

expenseRouter.get("/vendors", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listVendors({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Vendors list error", error);
    return res.status(500).json({ message: "Unable to load vendors." });
  }
});

expenseRouter.post("/vendors", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = vendorSchema.parse(req.body);
    return res.status(201).json(await createVendor({ schoolId: req.user!.schoolId, ...payload, email: payload.email || undefined }));
  } catch (error) {
    console.error("Vendor create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create vendor." });
  }
});

const employeeObligationSchema = z.object({
  salaryProfileId: z.string().min(1),
  type: z.nativeEnum(EmployeeObligationType),
  title: z.string().min(3),
  principalAmount: z.number().positive(),
  currency: z.string().optional(),
  disbursementMethod: z.nativeEnum(PaymentMethod).optional(),
  repaymentMethod: z.nativeEnum(EmployeeRepaymentMethod).optional(),
  installmentAmount: z.number().positive(),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  notes: z.string().max(4000).optional()
});

const employeeRepaymentSchema = z.object({
  paidAmount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional()
});

const employeeTransparencyNoticeSchema = z.object({
  salaryProfileId: z.string().min(1),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1).default([NotificationChannel.DASHBOARD]),
  subject: z.string().max(180).optional(),
  body: z.string().max(4000).optional()
});

expenseRouter.put("/vendors/:vendorId", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = vendorUpdateSchema.parse(req.body);
    return res.json(await updateVendor({
      schoolId: req.user!.schoolId,
      vendorId: req.params.vendorId,
      ...payload,
      email: payload.email || undefined
    }));
  } catch (error) {
    console.error("Vendor update error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update vendor." });
  }
});

expenseRouter.delete("/vendors/:vendorId", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await deleteVendor({ schoolId: req.user!.schoolId, vendorId: req.params.vendorId }));
  } catch (error) {
    console.error("Vendor delete error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete vendor." });
  }
});

expenseRouter.get("/budgets", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listBudgets({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Budget list error", error);
    return res.status(500).json({ message: "Unable to load budgets." });
  }
});

expenseRouter.post("/budgets", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = budgetSchema.parse(req.body);
    return res.status(201).json(await createBudget({ schoolId: req.user!.schoolId, createdById: req.user!.sub, ...payload }));
  } catch (error) {
    console.error("Budget create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create budget." });
  }
});

expenseRouter.get("/", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const status = typeof req.query.status === "string" && req.query.status in ExpenseStatus ? req.query.status as ExpenseStatus : undefined;
    return res.json(await listExpenses({ schoolId: req.user!.schoolId, status }));
  } catch (error) {
    console.error("Expense list error", error);
    return res.status(500).json({ message: "Unable to load expenses." });
  }
});

expenseRouter.post("/", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = expenseSchema.parse(req.body);
    return res.status(201).json(await createExpense({ schoolId: req.user!.schoolId, submittedById: req.user!.sub, ...payload }));
  } catch (error) {
    console.error("Expense create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create expense." });
  }
});

expenseRouter.get("/accounting-entries", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listAccountingEntries({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Accounting entries list error", error);
    return res.status(500).json({ message: "Unable to load accounting entries." });
  }
});

expenseRouter.get("/cashflow-entries", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listCashflowEntries({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Cashflow entries list error", error);
    return res.status(500).json({ message: "Unable to load cashflow entries." });
  }
});

expenseRouter.post("/:expenseId/approval", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = approvalSchema.parse(req.body);
    return res.json(await processExpenseApproval({
      schoolId: req.user!.schoolId,
      expenseId: req.params.expenseId,
      userId: req.user!.sub,
      userRole: req.user!.role,
      ...payload
    }));
  } catch (error) {
    console.error("Expense approval error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to process approval." });
  }
});

expenseRouter.get("/payroll/profiles", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listSalaryProfiles({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Payroll profiles error", error);
    return res.status(500).json({ message: "Unable to load salary profiles." });
  }
});

expenseRouter.post("/payroll/profiles", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = salaryProfileSchema.parse(req.body);
    return res.status(201).json(await createSalaryProfile({ schoolId: req.user!.schoolId, ...payload }));
  } catch (error) {
    console.error("Payroll profile create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create salary profile." });
  }
});

expenseRouter.get("/payroll/runs", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await listPayrollRuns({ schoolId: req.user!.schoolId }));
  } catch (error) {
    console.error("Payroll runs error", error);
    return res.status(500).json({ message: "Unable to load payroll runs." });
  }
});

expenseRouter.post("/payroll/runs", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = payrollRunSchema.parse(req.body);
    return res.status(201).json(await createPayrollRun({ schoolId: req.user!.schoolId, createdById: req.user!.sub, ...payload }));
  } catch (error) {
    console.error("Payroll run create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create payroll run." });
  }
});

expenseRouter.put("/payroll/profiles/:salaryProfileId", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = salaryProfileUpdateSchema.parse(req.body);
    return res.json(await updateSalaryProfile({ schoolId: req.user!.schoolId, salaryProfileId: req.params.salaryProfileId, ...payload }));
  } catch (error) {
    console.error("Payroll profile update error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update salary profile." });
  }
});

expenseRouter.get("/employee-finance/obligations", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const status = typeof req.query.status === "string" && req.query.status in EmployeeObligationStatus
      ? req.query.status as EmployeeObligationStatus
      : undefined;
    const type = typeof req.query.type === "string" && req.query.type in EmployeeObligationType
      ? req.query.type as EmployeeObligationType
      : undefined;
    return res.json(await listEmployeeFinancialObligations({
      schoolId: req.user!.schoolId,
      salaryProfileId: typeof req.query.salaryProfileId === "string" ? req.query.salaryProfileId : undefined,
      employeeCode: typeof req.query.employeeCode === "string" ? req.query.employeeCode : undefined,
      query: typeof req.query.query === "string" ? req.query.query : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      status,
      type
    }));
  } catch (error) {
    console.error("Employee obligations list error", error);
    return res.status(500).json({ message: "Unable to load employee obligations." });
  }
});

expenseRouter.get("/employee-finance/snapshot", authorize(...readRoles), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await getEmployeeFinancialSnapshot({
      schoolId: req.user!.schoolId,
      salaryProfileId: typeof req.query.salaryProfileId === "string" ? req.query.salaryProfileId : undefined,
      employeeCode: typeof req.query.employeeCode === "string" ? req.query.employeeCode : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
    }));
  } catch (error) {
    console.error("Employee finance snapshot error", error);
    return res.status(404).json({ message: error instanceof Error ? error.message : "Employee finance snapshot not found." });
  }
});

expenseRouter.get("/employee-finance/me", authorize("EMPLOYEE"), async (req: AuthenticatedRequest, res) => {
  try {
    return res.json(await getEmployeeFinancialSnapshot({
      schoolId: req.user!.schoolId,
      userId: req.user!.sub,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
    }));
  } catch (error) {
    console.error("Employee own finance snapshot error", error);
    return res.status(404).json({ message: error instanceof Error ? error.message : "Employee finance snapshot not found." });
  }
});

expenseRouter.post("/employee-finance/obligations", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = employeeObligationSchema.parse(req.body);
    return res.status(201).json(await createEmployeeFinancialObligation({
      schoolId: req.user!.schoolId,
      createdById: req.user!.sub,
      approvedById: req.user!.sub,
      ...payload
    }));
  } catch (error) {
    console.error("Employee obligation create error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create employee obligation." });
  }
});

expenseRouter.post("/employee-finance/repayments/:repaymentId/pay", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = employeeRepaymentSchema.parse(req.body);
    return res.json(await recordEmployeeRepayment({
      schoolId: req.user!.schoolId,
      repaymentId: req.params.repaymentId,
      recordedById: req.user!.sub,
      ...payload
    }));
  } catch (error) {
    console.error("Employee repayment record error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to record employee repayment." });
  }
});

expenseRouter.post("/employee-finance/notify", authorize(...writeRoles), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = employeeTransparencyNoticeSchema.parse(req.body);
    return res.json(await sendEmployeeFinancialTransparencyNotice({
      schoolId: req.user!.schoolId,
      sentById: req.user!.sub,
      ...payload
    }));
  } catch (error) {
    console.error("Employee transparency notice error", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to notify employee." });
  }
});
