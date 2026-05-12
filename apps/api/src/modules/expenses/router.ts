import {
  ApprovalStepStatus,
  ExpenseCategoryType,
  ExpenseStatus,
  FinancialAttachmentKind,
  PayrollFrequency,
  PaymentMethod,
  Role
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import {
  createBudget,
  createExpense,
  createExpenseCategory,
  createPayrollRun,
  createSalaryProfile,
  createVendor,
  getExpenseOverview,
  listAccountingEntries,
  listCashflowEntries,
  listBudgets,
  listExpenseCategories,
  listExpenses,
  listPayrollRuns,
  listSalaryProfiles,
  listVendors,
  processExpenseApproval
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
  notes: z.string().optional()
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