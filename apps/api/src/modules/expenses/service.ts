import {
  AccountingEntryType,
  ApprovalStepRole,
  ApprovalStepStatus,
  BudgetStatus,
  EmployeeDeductionMode,
  EmployeeObligationStatus,
  EmployeeObligationType,
  EmployeeRepaymentMethod,
  EmployeeRepaymentStatus,
  ExpenseCategoryType,
  ExpenseStatus,
  FinancialAttachmentKind,
  FinancialPeriodType,
  NotificationChannel,
  PayrollFrequency,
  PayrollRunStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role
} from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "../../prisma";
import { sendEmail, sendSms } from "../../utils/messaging";

type DbClient = typeof prisma | Prisma.TransactionClient;

type DefaultCategorySeed = {
  slug: string;
  name: string;
  type: ExpenseCategoryType;
  ownerApprovalRequired?: boolean;
  subcategories: Array<{ slug: string; name: string }>;
};

const DEFAULT_EXPENSE_CATEGORIES: DefaultCategorySeed[] = [
  {
    slug: "administrative-expenses",
    name: "Administrative Expenses",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "office-supplies", name: "Office supplies" },
      { slug: "printing", name: "Printing" },
      { slug: "subscriptions", name: "Subscriptions" },
      { slug: "internet", name: "Internet" },
      { slug: "communication", name: "Communication" }
    ]
  },
  {
    slug: "academic-expenses",
    name: "Academic Expenses",
    type: ExpenseCategoryType.ACADEMIC,
    subcategories: [
      { slug: "books", name: "Books" },
      { slug: "laboratory-equipment", name: "Laboratory equipment" },
      { slug: "educational-materials", name: "Educational materials" },
      { slug: "school-activities", name: "School activities" }
    ]
  },
  {
    slug: "human-resources",
    name: "Human Resources",
    type: ExpenseCategoryType.HUMAN_RESOURCES,
    subcategories: [
      { slug: "teacher-salaries", name: "Teacher salaries" },
      { slug: "staff-salaries", name: "Staff salaries" },
      { slug: "bonuses", name: "Bonuses" },
      { slug: "incentives", name: "Incentives" },
      { slug: "payroll-management", name: "Payroll management" }
    ]
  },
  {
    slug: "infrastructure-maintenance",
    name: "Infrastructure & Maintenance",
    type: ExpenseCategoryType.INFRASTRUCTURE,
    subcategories: [
      { slug: "repairs", name: "Repairs" },
      { slug: "electricity", name: "Electricity" },
      { slug: "water", name: "Water" },
      { slug: "cleaning", name: "Cleaning" },
      { slug: "security", name: "Security" },
      { slug: "construction", name: "Construction" }
    ]
  },
  {
    slug: "transport-logistics",
    name: "Transportation & Logistics",
    type: ExpenseCategoryType.TRANSPORT,
    subcategories: [
      { slug: "fuel", name: "Fuel" },
      { slug: "school-transport", name: "School transport" },
      { slug: "deliveries", name: "Deliveries" },
      { slug: "logistics-operations", name: "Logistics operations" }
    ]
  },
  {
    slug: "technology-it",
    name: "Technology & IT",
    type: ExpenseCategoryType.TECHNOLOGY,
    subcategories: [
      { slug: "software", name: "Software" },
      { slug: "servers", name: "Servers" },
      { slug: "hosting", name: "Hosting" },
      { slug: "licenses", name: "Licenses" },
      { slug: "equipment-purchases", name: "Equipment purchases" }
    ]
  },
  {
    slug: "special-institutional-expenses",
    name: "Special Institutional Expenses",
    type: ExpenseCategoryType.SPECIAL_INSTITUTIONAL,
    ownerApprovalRequired: true,
    subcategories: [
      { slug: "emergency-expenditures", name: "Emergency expenditures" },
      { slug: "owner-approved-spending", name: "Owner-approved spending" },
      { slug: "strategic-investments", name: "Strategic investments" }
    ]
  }
];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function deriveEmployeeRisk(input: { balance: number; baseSalary: number; dueDate: Date; installmentAmount: number }) {
  const salaryRatio = input.baseSalary > 0 ? input.balance / input.baseSalary : 0;
  const installmentRatio = input.baseSalary > 0 ? input.installmentAmount / input.baseSalary : 0;
  const daysLate = Math.max(dayjs().startOf("day").diff(dayjs(input.dueDate).startOf("day"), "day"), 0);
  const riskScore = Math.min(100, roundCurrency((salaryRatio * 22) + (installmentRatio * 110) + Math.min(daysLate, 90) * 0.7));
  const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";
  return { riskScore, riskLevel, daysLate };
}

function deriveRepaymentStatus(expectedAmount: number, paidAmount: number, dueDate: Date): EmployeeRepaymentStatus {
  if (paidAmount >= expectedAmount) return EmployeeRepaymentStatus.PAID;
  if (paidAmount > 0) return EmployeeRepaymentStatus.PARTIALLY_PAID;
  if (dayjs(dueDate).isBefore(dayjs(), "day")) return EmployeeRepaymentStatus.OVERDUE;
  return EmployeeRepaymentStatus.SCHEDULED;
}

type DueEmployeeRepayment = {
  id: string;
  obligationId: string;
  expectedAmount: number;
  paidAmount: number;
  method: EmployeeRepaymentMethod;
  dueDate?: Date;
  obligation: { type: EmployeeObligationType; balance: number; title?: string };
};

type SalaryProfileForCalculation = {
  id: string;
  baseSalary: number;
  defaultBonus: number;
  defaultDeduction: number;
  debtRecoveryRate: number;
  deductionMode?: EmployeeDeductionMode | null;
  maxDeductionRate?: number | null;
};

function calculateEmployeeMonthlySalary(input: {
  profile: SalaryProfileForCalculation;
  dueRepayments: DueEmployeeRepayment[];
  modeOverride?: EmployeeDeductionMode;
}) {
  const mode = input.modeOverride ?? input.profile.deductionMode ?? EmployeeDeductionMode.AUTOMATIC;
  const baseSalary = roundCurrency(Number(input.profile.baseSalary || 0));
  const bonuses = roundCurrency(Number(input.profile.defaultBonus || 0));
  const deductions = roundCurrency(Number(input.profile.defaultDeduction || 0));
  const maxDeductionRate = Math.min(Math.max(Number(input.profile.maxDeductionRate ?? 35), 0), 80);
  const deductionCeiling = roundCurrency(baseSalary * (maxDeductionRate / 100));
  const shouldAutoDeduct = mode !== EmployeeDeductionMode.MANUAL;
  const baseDebtRecovered = shouldAutoDeduct
    ? roundCurrency((baseSalary * Number(input.profile.debtRecoveryRate || 0)) / 100)
    : 0;
  let remainingDeductionRoom = Math.max(deductionCeiling - deductions - baseDebtRecovered, 0);
  let advancesRecovered = 0;
  let scheduledDebtRecovered = 0;
  const plannedRepayments: Array<{ repaymentId: string; obligationId: string; amount: number; type: EmployeeObligationType }> = [];
  const deferredRepayments: Array<{ repaymentId: string; obligationId: string; amount: number; reason: string; dueDate?: string }> = [];

  for (const repayment of input.dueRepayments) {
    const outstanding = roundCurrency(Math.max(repayment.expectedAmount - repayment.paidAmount, 0));
    if (outstanding <= 0) continue;
    if (!shouldAutoDeduct || (repayment.method !== EmployeeRepaymentMethod.SALARY_DEDUCTION && repayment.method !== EmployeeRepaymentMethod.MIXED)) {
      deferredRepayments.push({
        repaymentId: repayment.id,
        obligationId: repayment.obligationId,
        amount: outstanding,
        reason: mode === EmployeeDeductionMode.MANUAL ? "Mode manuel: attente decision administrateur financier." : "Paiement hors salaire ou non deductible automatiquement.",
        dueDate: repayment.dueDate?.toISOString()
      });
      continue;
    }
    if (remainingDeductionRoom <= 0) {
      deferredRepayments.push({
        repaymentId: repayment.id,
        obligationId: repayment.obligationId,
        amount: outstanding,
        reason: "Plafond de protection salariale atteint.",
        dueDate: repayment.dueDate?.toISOString()
      });
      continue;
    }
    const amount = roundCurrency(Math.min(outstanding, remainingDeductionRoom));
    plannedRepayments.push({ repaymentId: repayment.id, obligationId: repayment.obligationId, amount, type: repayment.obligation.type });
    if (repayment.obligation.type === EmployeeObligationType.SALARY_ADVANCE) advancesRecovered = roundCurrency(advancesRecovered + amount);
    else scheduledDebtRecovered = roundCurrency(scheduledDebtRecovered + amount);
    remainingDeductionRoom = roundCurrency(remainingDeductionRoom - amount);
    if (amount < outstanding) {
      deferredRepayments.push({
        repaymentId: repayment.id,
        obligationId: repayment.obligationId,
        amount: roundCurrency(outstanding - amount),
        reason: "Solde reporte car le plafond de deduction est atteint.",
        dueDate: repayment.dueDate?.toISOString()
      });
    }
  }

  const debtRecovered = roundCurrency(baseDebtRecovered + scheduledDebtRecovered);
  const totalDeductions = roundCurrency(deductions + advancesRecovered + debtRecovered);
  const grossSalary = roundCurrency(baseSalary + bonuses);
  const netSalary = roundCurrency(grossSalary - totalDeductions);
  const salaryPressure = baseSalary > 0 ? roundCurrency((totalDeductions / baseSalary) * 100) : 0;
  const riskLevel = salaryPressure >= 45 || deferredRepayments.length >= 3
    ? "HIGH"
    : salaryPressure >= 30 || deferredRepayments.length
      ? "MEDIUM"
      : "LOW";

  return {
    mode,
    baseSalary,
    bonuses,
    deductions,
    advancesRecovered,
    debtRecovered,
    totalDeductions,
    grossSalary,
    netSalary,
    salaryPressure,
    maxDeductionRate,
    deductionCeiling,
    plannedRepayments,
    deferredRepayments,
    recommendation: mode === EmployeeDeductionMode.MANUAL
      ? "Mode manuel actif: aucune dette n'est prelevee sans action du financier."
      : salaryPressure > maxDeductionRate
        ? "Revoir le plan: la pression salariale depasse le plafond configure."
        : deferredRepayments.length
          ? "Certaines echeances sont reportees pour proteger le salaire mensuel."
          : "Deduction compatible avec le plafond de protection salariale.",
    riskLevel
  };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getRoleStepsForUser(role: Role): ApprovalStepRole[] {
  if (role === Role.SUPER_ADMIN) return [ApprovalStepRole.FINANCIAL_OFFICER, ApprovalStepRole.ADMINISTRATION, ApprovalStepRole.OWNER];
  if (role === Role.OWNER) return [ApprovalStepRole.OWNER];
  if (role === Role.ADMIN) return [ApprovalStepRole.FINANCIAL_OFFICER, ApprovalStepRole.ADMINISTRATION];
  if (role === Role.FINANCIAL_MANAGER || role === Role.ACCOUNTANT || role === Role.CASHIER) return [ApprovalStepRole.FINANCIAL_OFFICER];
  return [];
}

async function ensureDefaultExpenseCatalog(schoolId: string, client: DbClient = prisma) {
  const now = dayjs();
  const currentYearName = `FY ${now.year()}`;
  const currentMonthName = now.format("YYYY-MM");

  const yearlyPeriod = await client.financialPeriod.upsert({
    where: { schoolId_name: { schoolId, name: currentYearName } },
    update: {},
    create: {
      schoolId,
      name: currentYearName,
      type: FinancialPeriodType.YEARLY,
      startDate: now.startOf("year").toDate(),
      endDate: now.endOf("year").toDate()
    }
  });

  const monthlyPeriod = await client.financialPeriod.upsert({
    where: { schoolId_name: { schoolId, name: currentMonthName } },
    update: {},
    create: {
      schoolId,
      name: currentMonthName,
      type: FinancialPeriodType.MONTHLY,
      startDate: now.startOf("month").toDate(),
      endDate: now.endOf("month").toDate()
    }
  });

  for (const category of DEFAULT_EXPENSE_CATEGORIES) {
    const parent = await client.expenseCategory.upsert({
      where: { schoolId_slug: { schoolId, slug: category.slug } },
      update: {
        name: category.name,
        type: category.type,
        ownerApprovalRequired: Boolean(category.ownerApprovalRequired),
        isSystem: true,
        isActive: true
      },
      create: {
        schoolId,
        slug: category.slug,
        name: category.name,
        type: category.type,
        ownerApprovalRequired: Boolean(category.ownerApprovalRequired),
        isSystem: true,
        isActive: true
      }
    });

    for (const subcategory of category.subcategories) {
      await client.expenseCategory.upsert({
        where: { schoolId_slug: { schoolId, slug: `${category.slug}-${subcategory.slug}` } },
        update: {
          name: subcategory.name,
          type: category.type,
          parentCategoryId: parent.id,
          isSystem: true,
          isActive: true
        },
        create: {
          schoolId,
          slug: `${category.slug}-${subcategory.slug}`,
          name: subcategory.name,
          type: category.type,
          parentCategoryId: parent.id,
          isSystem: true,
          isActive: true
        }
      });
    }
  }

  const categories = await client.expenseCategory.findMany({
    where: { schoolId, isActive: true },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
  });

  return { yearlyPeriod, monthlyPeriod, categories };
}

async function getPreferredPeriod(schoolId: string, periodId: string | undefined, client: DbClient = prisma) {
  const catalog = await ensureDefaultExpenseCatalog(schoolId, client);
  if (!periodId) return catalog.monthlyPeriod;
  return (await client.financialPeriod.findFirst({ where: { id: periodId, schoolId } })) ?? catalog.monthlyPeriod;
}

export async function getExpenseOverview(input: { schoolId: string; client?: DbClient }) {
  const client = input.client ?? prisma;
  await ensureDefaultExpenseCatalog(input.schoolId, client);

  const [
    categories,
    expenses,
    budgets,
    payrollRuns,
    completedPayments,
    pendingExpenses,
    pendingApprovalSteps
  ] = await Promise.all([
    client.expenseCategory.findMany({ where: { schoolId: input.schoolId, isActive: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    client.expense.findMany({
      where: { schoolId: input.schoolId },
      include: { category: true, budget: true, approvalSteps: true },
      orderBy: { expenseDate: "desc" }
    }),
    client.budget.findMany({ where: { schoolId: input.schoolId }, include: { category: true, period: true }, orderBy: { createdAt: "desc" } }),
    client.payrollRun.findMany({ where: { schoolId: input.schoolId }, include: { items: true, period: true }, orderBy: { createdAt: "desc" } }),
    client.payment.aggregate({ where: { schoolId: input.schoolId, status: PaymentStatus.COMPLETED }, _sum: { amount: true } }),
    client.expense.count({ where: { schoolId: input.schoolId, status: ExpenseStatus.PENDING } }),
    client.expenseApprovalStep.count({ where: { schoolId: input.schoolId, status: ApprovalStepStatus.PENDING } })
  ]);

  const approvedExpenses = expenses.filter((expense) => expense.status === ExpenseStatus.APPROVED);
  const rejectedExpenses = expenses.filter((expense) => expense.status === ExpenseStatus.REJECTED);
  const payrollTotal = payrollRuns.reduce((sum, run) => sum + Number(run.totalNet || 0), 0);
  const expenseTotal = approvedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalRevenue = roundCurrency(Number(completedPayments._sum.amount || 0));
  const totalExpenses = roundCurrency(expenseTotal + payrollTotal);
  const availableCash = roundCurrency(totalRevenue - totalExpenses);

  const budgetSummaries = budgets.map((budget) => {
    const consumedAmount = roundCurrency(expenses
      .filter((expense) => expense.budgetId === budget.id && expense.status === ExpenseStatus.APPROVED)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
    const utilization = budget.plannedAmount > 0 ? roundCurrency((consumedAmount / budget.plannedAmount) * 100) : 0;
    return {
      id: budget.id,
      name: budget.name,
      department: budget.department,
      plannedAmount: roundCurrency(budget.plannedAmount),
      consumedAmount,
      remainingAmount: roundCurrency(Math.max(budget.plannedAmount - consumedAmount, 0)),
      utilization,
      status: consumedAmount > budget.plannedAmount ? BudgetStatus.EXCEEDED : budget.status,
      periodName: budget.period.name,
      categoryName: budget.category?.name ?? null
    };
  });

  const categorySpending = categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      type: category.type,
      total: roundCurrency(approvedExpenses
        .filter((expense) => expense.categoryId === category.id || expense.category.parentCategoryId === category.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0))
    }))
    .filter((entry) => entry.total > 0)
    .sort((left, right) => right.total - left.total);

  const departmentMap = new Map<string, number>();
  for (const expense of approvedExpenses) {
    departmentMap.set(expense.department, roundCurrency((departmentMap.get(expense.department) ?? 0) + Number(expense.amount || 0)));
  }
  for (const run of payrollRuns) {
    const department = run.department || "Human Resources";
    departmentMap.set(department, roundCurrency((departmentMap.get(department) ?? 0) + Number(run.totalNet || 0)));
  }

  const departmentSpending = [...departmentMap.entries()]
    .map(([department, total]) => ({ department, total }))
    .sort((left, right) => right.total - left.total);

  const performanceMap = new Map<string, { revenue: number; expenses: number }>();
  for (const expense of approvedExpenses) {
    const key = dayjs(expense.expenseDate).format("YYYY-MM");
    const current = performanceMap.get(key) ?? { revenue: 0, expenses: 0 };
    current.expenses = roundCurrency(current.expenses + Number(expense.amount || 0));
    performanceMap.set(key, current);
  }
  const paymentRows = await client.payment.findMany({
    where: { schoolId: input.schoolId, status: PaymentStatus.COMPLETED },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  for (const payment of paymentRows) {
    const key = dayjs(payment.createdAt).format("YYYY-MM");
    const current = performanceMap.get(key) ?? { revenue: 0, expenses: 0 };
    current.revenue = roundCurrency(current.revenue + Number(payment.amount || 0));
    performanceMap.set(key, current);
  }

  const monthlyPerformance = [...performanceMap.entries()]
    .map(([period, values]) => ({
      period,
      revenue: values.revenue,
      expenses: values.expenses,
      profitLoss: roundCurrency(values.revenue - values.expenses)
    }))
    .sort((left, right) => left.period.localeCompare(right.period));

  return {
    revenue: {
      totalRevenue,
      totalCompletedPayments: paymentRows.length
    },
    expenses: {
      totalExpenses,
      approvedExpenses: approvedExpenses.length,
      pendingExpenses,
      rejectedExpenses: rejectedExpenses.length,
      pendingApprovalSteps
    },
    payroll: {
      activeProfiles: await client.employeeSalaryProfile.count({ where: { schoolId: input.schoolId, isActive: true } }),
      runCount: payrollRuns.length,
      totalPayroll: roundCurrency(payrollTotal),
      salaryLiability: roundCurrency(payrollRuns.filter((run) => run.status !== PayrollRunStatus.PAID).reduce((sum, run) => sum + Number(run.totalNet || 0), 0))
    },
    cashflow: {
      availableCash,
      operationalBalance: availableCash,
      profitLoss: roundCurrency(totalRevenue - totalExpenses)
    },
    liabilities: {
      supplierDebt: roundCurrency(expenses.filter((expense) => expense.status === ExpenseStatus.PENDING).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)),
      payrollLiability: roundCurrency(payrollRuns.filter((run) => run.status !== PayrollRunStatus.PAID).reduce((sum, run) => sum + Number(run.totalNet || 0), 0)),
      institutionalObligations: roundCurrency(expenses.filter((expense) => expense.requiresOwnerApproval && expense.status !== ExpenseStatus.APPROVED).reduce((sum, expense) => sum + Number(expense.amount || 0), 0))
    },
    budgets: budgetSummaries,
    budgetAlerts: budgetSummaries.filter((budget) => budget.utilization >= 80 || budget.status === BudgetStatus.EXCEEDED),
    categorySpending,
    departmentSpending,
    monthlyPerformance,
    recentExpenses: expenses.slice(0, 8).map((expense) => ({
      id: expense.id,
      title: expense.title,
      department: expense.department,
      amount: roundCurrency(expense.amount),
      categoryName: expense.category.name,
      status: expense.status,
      expenseDate: expense.expenseDate.toISOString()
    })),
    recentPayrollRuns: payrollRuns.slice(0, 5).map((run) => ({
      id: run.id,
      title: run.title,
      department: run.department,
      totalNet: roundCurrency(run.totalNet),
      status: run.status,
      periodName: run.period?.name ?? null,
      processedAt: run.processedAt?.toISOString() ?? null
    }))
  };
}

export async function listExpenseCategories(input: { schoolId: string; client?: DbClient }) {
  const client = input.client ?? prisma;
  await ensureDefaultExpenseCatalog(input.schoolId, client);
  return client.expenseCategory.findMany({
    where: { schoolId: input.schoolId, isActive: true },
    include: { parentCategory: true, subcategories: true },
    orderBy: [{ type: "asc" }, { name: "asc" }]
  });
}

export async function createExpenseCategory(input: {
  schoolId: string;
  name: string;
  type: ExpenseCategoryType;
  parentCategoryId?: string;
  description?: string;
  ownerApprovalRequired?: boolean;
}) {
  const slug = slugify(input.name);
  return prisma.expenseCategory.create({
    data: {
      schoolId: input.schoolId,
      name: input.name,
      slug,
      type: input.type,
      parentCategoryId: input.parentCategoryId,
      description: input.description,
      ownerApprovalRequired: Boolean(input.ownerApprovalRequired)
    }
  });
}

export async function listVendors(input: { schoolId: string }) {
  return prisma.vendor.findMany({ where: { schoolId: input.schoolId }, orderBy: { name: "asc" } });
}

export async function createVendor(input: {
  schoolId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  return prisma.vendor.create({ data: input });
}

export async function updateVendor(input: {
  schoolId: string;
  vendorId: string;
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, schoolId: input.schoolId } });
  if (!vendor) {
    throw new Error("Vendor not found.");
  }

  return prisma.vendor.update({
    where: { id: input.vendorId },
    data: {
      name: input.name,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      notes: input.notes
    }
  });
}

export async function deleteVendor(input: { schoolId: string; vendorId: string }) {
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, schoolId: input.schoolId } });
  if (!vendor) {
    throw new Error("Vendor not found.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.expense.updateMany({
      where: { schoolId: input.schoolId, vendorId: input.vendorId },
      data: { vendorId: null }
    });
    await tx.vendor.delete({ where: { id: input.vendorId } });
    return { id: input.vendorId, deleted: true };
  });
}

export async function listBudgets(input: { schoolId: string }) {
  await ensureDefaultExpenseCatalog(input.schoolId, prisma);
  const budgets = await prisma.budget.findMany({
    where: { schoolId: input.schoolId },
    include: { category: true, period: true },
    orderBy: [{ createdAt: "desc" }]
  });

  return budgets.map((budget) => ({
    ...budget,
    utilization: budget.plannedAmount > 0 ? roundCurrency((Number(budget.consumedAmount || 0) / budget.plannedAmount) * 100) : 0
  }));
}

export async function createBudget(input: {
  schoolId: string;
  createdById?: string;
  periodId?: string;
  categoryId?: string;
  name: string;
  department: string;
  plannedAmount: number;
  alertThreshold?: number;
  notes?: string;
}) {
  const period = await getPreferredPeriod(input.schoolId, input.periodId);
  return prisma.budget.create({
    data: {
      schoolId: input.schoolId,
      createdById: input.createdById,
      periodId: period.id,
      categoryId: input.categoryId,
      name: input.name,
      department: input.department,
      plannedAmount: roundCurrency(input.plannedAmount),
      alertThreshold: roundCurrency(input.alertThreshold ?? 80),
      notes: input.notes
    },
    include: { category: true, period: true }
  });
}

export async function listExpenses(input: { schoolId: string; status?: ExpenseStatus }) {
  await ensureDefaultExpenseCatalog(input.schoolId, prisma);
  return prisma.expense.findMany({
    where: {
      schoolId: input.schoolId,
      ...(input.status ? { status: input.status } : {})
    },
    include: {
      category: true,
      vendor: true,
      budget: true,
      period: true,
      approvalSteps: { orderBy: { stage: "asc" } },
      attachments: true,
      submittedBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } }
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
  });
}

export async function listAccountingEntries(input: { schoolId: string }) {
  return prisma.accountingEntry.findMany({
    where: { schoolId: input.schoolId },
    include: {
      expense: { select: { id: true, title: true, department: true, status: true } },
      payrollRun: { select: { id: true, title: true, department: true, status: true } },
      payrollItem: {
        select: {
          id: true,
          salarySlipNumber: true,
          netSalary: true,
          salaryProfile: { select: { id: true, fullName: true, employeeCode: true, department: true, position: true } }
        }
      }
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }]
  });
}

export async function listCashflowEntries(input: { schoolId: string }) {
  return prisma.cashflowEntry.findMany({
    where: { schoolId: input.schoolId },
    include: {
      expense: { select: { id: true, title: true, department: true, status: true } },
      payrollRun: { select: { id: true, title: true, department: true, status: true } },
      payrollItem: {
        select: {
          id: true,
          salarySlipNumber: true,
          netSalary: true,
          salaryProfile: { select: { id: true, fullName: true, employeeCode: true, department: true, position: true } }
        }
      }
    },
    orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }]
  });
}

export async function createExpense(input: {
  schoolId: string;
  submittedById?: string;
  categoryId: string;
  vendorId?: string;
  budgetId?: string;
  periodId?: string;
  title: string;
  subcategory?: string;
  description?: string;
  department: string;
  amount: number;
  currency?: string;
  paymentMethod?: PaymentMethod;
  supplierName?: string;
  expenseDate: string;
  financialPeriodLabel?: string;
  comments?: string;
  attachments?: Array<{ kind: FinancialAttachmentKind; fileName: string; fileUrl: string; mimeType?: string; notes?: string }>;
}) {
  return prisma.$transaction(async (tx) => {
    const period = await getPreferredPeriod(input.schoolId, input.periodId, tx);
    const category = await tx.expenseCategory.findFirst({ where: { id: input.categoryId, schoolId: input.schoolId } });
    if (!category) {
      throw new Error("Expense category not found.");
    }

    const requiresOwnerApproval = category.ownerApprovalRequired || input.amount >= 5000 || category.type === ExpenseCategoryType.SPECIAL_INSTITUTIONAL;
    const expense = await tx.expense.create({
      data: {
        schoolId: input.schoolId,
        submittedById: input.submittedById,
        categoryId: input.categoryId,
        vendorId: input.vendorId,
        budgetId: input.budgetId,
        periodId: period.id,
        title: input.title,
        subcategory: input.subcategory,
        description: input.description,
        department: input.department,
        amount: roundCurrency(input.amount),
        currency: input.currency ?? "USD",
        paymentMethod: input.paymentMethod,
        supplierName: input.supplierName,
        expenseDate: new Date(input.expenseDate),
        financialPeriodLabel: input.financialPeriodLabel ?? period.name,
        comments: input.comments,
        requiresOwnerApproval
      }
    });

    const steps: Array<{ stage: number; role: ApprovalStepRole }> = [
      { stage: 1, role: ApprovalStepRole.FINANCIAL_OFFICER },
      { stage: 2, role: ApprovalStepRole.ADMINISTRATION }
    ];
    if (requiresOwnerApproval) {
      steps.push({ stage: 3, role: ApprovalStepRole.OWNER });
    }

    await tx.expenseApprovalStep.createMany({
      data: steps.map((step) => ({
        schoolId: input.schoolId,
        expenseId: expense.id,
        stage: step.stage,
        role: step.role,
        status: ApprovalStepStatus.PENDING
      }))
    });

    if (input.attachments?.length) {
      await tx.financialAttachment.createMany({
        data: input.attachments.map((attachment) => ({
          schoolId: input.schoolId,
          expenseId: expense.id,
          uploadedById: input.submittedById,
          kind: attachment.kind,
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          mimeType: attachment.mimeType,
          notes: attachment.notes
        }))
      });
    }

    return tx.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: {
        category: true,
        vendor: true,
        budget: true,
        period: true,
        approvalSteps: { orderBy: { stage: "asc" } },
        attachments: true
      }
    });
  });
}

export async function processExpenseApproval(input: {
  schoolId: string;
  expenseId: string;
  userId: string;
  userRole: Role;
  status: ApprovalStepStatus;
  comments?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: input.expenseId, schoolId: input.schoolId },
      include: { approvalSteps: { orderBy: { stage: "asc" } }, budget: true }
    });
    if (!expense) throw new Error("Expense not found.");

    const currentStep = expense.approvalSteps.find((step) => step.status === ApprovalStepStatus.PENDING);
    if (!currentStep) throw new Error("This expense no longer has a pending approval step.");

    const allowedSteps = getRoleStepsForUser(input.userRole);
    if (!allowedSteps.includes(currentStep.role)) {
      throw new Error("Your role cannot validate the current approval step.");
    }

    await tx.expenseApprovalStep.update({
      where: { expenseId_stage: { expenseId: expense.id, stage: currentStep.stage } },
      data: {
        status: input.status,
        comments: input.comments,
        decidedById: input.userId,
        decidedAt: new Date()
      }
    });

    if (input.status === ApprovalStepStatus.REJECTED) {
      return tx.expense.update({
        where: { id: expense.id },
        data: { status: ExpenseStatus.REJECTED },
        include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true, vendor: true, attachments: true }
      });
    }

    const remainingStep = expense.approvalSteps.find((step) => step.stage > currentStep.stage);
    if (remainingStep) {
      return tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true, vendor: true, attachments: true }
      });
    }

    const approvedExpense = await tx.expense.update({
      where: { id: expense.id },
      data: {
        status: ExpenseStatus.APPROVED,
        approvedById: input.userId
      },
      include: { budget: true, category: true, period: true, approvalSteps: { orderBy: { stage: "asc" } } }
    });

    await tx.accountingEntry.create({
      data: {
        schoolId: input.schoolId,
        expenseId: expense.id,
        entryType: AccountingEntryType.EXPENSE,
        direction: "OUTFLOW",
        title: expense.title,
        amount: roundCurrency(expense.amount),
        currency: expense.currency,
        entryDate: expense.expenseDate,
        department: expense.department,
        metadata: {
          categoryId: expense.categoryId,
          budgetId: expense.budgetId,
          approvedById: input.userId
        }
      }
    });

    await tx.cashflowEntry.create({
      data: {
        schoolId: input.schoolId,
        expenseId: expense.id,
        direction: "OUTFLOW",
        sourceType: "EXPENSE",
        amount: roundCurrency(expense.amount),
        currency: expense.currency,
        method: expense.paymentMethod,
        referenceDate: expense.expenseDate,
        notes: expense.comments
      }
    });

    if (expense.budgetId && approvedExpense.budget) {
      const consumedAmount = roundCurrency(Number(approvedExpense.budget.consumedAmount || 0) + Number(expense.amount || 0));
      const utilization = approvedExpense.budget.plannedAmount > 0 ? (consumedAmount / approvedExpense.budget.plannedAmount) * 100 : 0;
      await tx.budget.update({
        where: { id: approvedExpense.budget.id },
        data: {
          consumedAmount,
          status: consumedAmount > approvedExpense.budget.plannedAmount || utilization >= 100 ? BudgetStatus.EXCEEDED : approvedExpense.budget.status
        }
      });
    }

    return tx.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true, vendor: true, attachments: true }
    });
  });
}

export async function listSalaryProfiles(input: { schoolId: string }) {
  return prisma.employeeSalaryProfile.findMany({ where: { schoolId: input.schoolId }, orderBy: [{ isActive: "desc" }, { fullName: "asc" }] });
}

export async function createSalaryProfile(input: {
  schoolId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  baseSalary: number;
  currency?: string;
  frequency?: PayrollFrequency;
  defaultBonus?: number;
  defaultDeduction?: number;
  advanceBalance?: number;
  debtRecoveryRate?: number;
  deductionMode?: EmployeeDeductionMode;
  maxDeductionRate?: number;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}) {
  return prisma.employeeSalaryProfile.create({
    data: {
      schoolId: input.schoolId,
      employeeCode: input.employeeCode,
      fullName: input.fullName,
      department: input.department,
      position: input.position,
      baseSalary: roundCurrency(input.baseSalary),
      currency: input.currency ?? "USD",
      frequency: input.frequency ?? PayrollFrequency.MONTHLY,
      defaultBonus: roundCurrency(input.defaultBonus ?? 0),
      defaultDeduction: roundCurrency(input.defaultDeduction ?? 0),
      advanceBalance: roundCurrency(input.advanceBalance ?? 0),
      debtRecoveryRate: roundCurrency(input.debtRecoveryRate ?? 0),
      deductionMode: input.deductionMode ?? EmployeeDeductionMode.AUTOMATIC,
      maxDeductionRate: roundCurrency(input.maxDeductionRate ?? 35),
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      notes: input.notes
    }
  });
}

export async function updateSalaryProfile(input: {
  schoolId: string;
  salaryProfileId: string;
  employeeCode?: string;
  fullName?: string;
  department?: string;
  position?: string;
  baseSalary?: number;
  currency?: string;
  frequency?: PayrollFrequency;
  defaultBonus?: number;
  defaultDeduction?: number;
  advanceBalance?: number;
  debtRecoveryRate?: number;
  deductionMode?: EmployeeDeductionMode;
  maxDeductionRate?: number;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const existing = await prisma.employeeSalaryProfile.findFirst({ where: { id: input.salaryProfileId, schoolId: input.schoolId } });
  if (!existing) throw new Error("Profil salarial employe introuvable.");
  return prisma.employeeSalaryProfile.update({
    where: { id: existing.id },
    data: {
      ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.baseSalary !== undefined ? { baseSalary: roundCurrency(input.baseSalary) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.defaultBonus !== undefined ? { defaultBonus: roundCurrency(input.defaultBonus) } : {}),
      ...(input.defaultDeduction !== undefined ? { defaultDeduction: roundCurrency(input.defaultDeduction) } : {}),
      ...(input.advanceBalance !== undefined ? { advanceBalance: roundCurrency(input.advanceBalance) } : {}),
      ...(input.debtRecoveryRate !== undefined ? { debtRecoveryRate: roundCurrency(input.debtRecoveryRate) } : {}),
      ...(input.deductionMode !== undefined ? { deductionMode: input.deductionMode } : {}),
      ...(input.maxDeductionRate !== undefined ? { maxDeductionRate: roundCurrency(input.maxDeductionRate) } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail || null } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    }
  });
}

function buildEmployeeFinanceReceipt(input: {
  kind: "OBLIGATION" | "REPAYMENT";
  reference: string;
  employeeName: string;
  employeeCode: string;
  title: string;
  amount: number;
  currency: string;
  method?: PaymentMethod | null;
  createdAt?: Date;
  balance?: number;
  recordedById?: string;
  notes?: string | null;
}) {
  const receiptNumber = `EMP-${input.kind === "OBLIGATION" ? "ADV" : "PAY"}-${dayjs(input.createdAt ?? new Date()).format("YYYYMMDD-HHmmss")}-${input.reference.slice(-6).toUpperCase()}`;
  const payload = {
    receiptNumber,
    reference: input.reference,
    employeeName: input.employeeName,
    employeeCode: input.employeeCode,
    title: input.title,
    amount: roundCurrency(input.amount),
    currency: input.currency,
    method: input.method ?? null,
    balance: input.balance ?? null,
    recordedById: input.recordedById ?? null,
    notes: input.notes ?? null,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    issuer: "EduPay Employee Finance"
  };

  return {
    receiptNumber,
    fileName: `${receiptNumber}.json`,
    fileUrl: `data:application/json;base64,${Buffer.from(JSON.stringify(payload, null, 2)).toString("base64")}`,
    payload
  };
}

export async function listEmployeeFinancialObligations(input: {
  schoolId: string;
  salaryProfileId?: string;
  employeeCode?: string;
  query?: string;
  status?: EmployeeObligationStatus;
  type?: EmployeeObligationType;
  dateFrom?: string;
  dateTo?: string;
}) {
  const profileFilter = input.salaryProfileId || input.employeeCode
    ? {
        salaryProfile: {
          ...(input.salaryProfileId ? { id: input.salaryProfileId } : {}),
          ...(input.employeeCode ? { employeeCode: { equals: input.employeeCode, mode: "insensitive" as const } } : {})
        }
      }
    : {};
  const text = input.query?.trim();
  return prisma.employeeObligation.findMany({
    where: {
      schoolId: input.schoolId,
      ...profileFilter,
      ...(input.status ? { status: input.status } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.dateFrom || input.dateTo ? {
        OR: [
          { startDate: { ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}), ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}) } },
          { dueDate: { ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}), ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}) } },
          { repayments: { some: { dueDate: { ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}), ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}) } } } }
        ]
      } : {}),
      ...(text ? {
        OR: [
          { title: { contains: text, mode: "insensitive" } },
          { notes: { contains: text, mode: "insensitive" } },
          { salaryProfile: { fullName: { contains: text, mode: "insensitive" } } },
          { salaryProfile: { employeeCode: { contains: text, mode: "insensitive" } } },
          { salaryProfile: { department: { contains: text, mode: "insensitive" } } }
        ]
      } : {})
    },
    include: {
      salaryProfile: true,
      repayments: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      createdBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } }
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
  });
}

export async function createEmployeeFinancialObligation(input: {
  schoolId: string;
  salaryProfileId: string;
  createdById?: string;
  approvedById?: string;
  type: EmployeeObligationType;
  title: string;
  principalAmount: number;
  currency?: string;
  repaymentMethod?: EmployeeRepaymentMethod;
  installmentAmount: number;
  startDate: string;
  dueDate: string;
  notes?: string;
  disbursementMethod?: PaymentMethod;
}) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.employeeSalaryProfile.findFirst({ where: { id: input.salaryProfileId, schoolId: input.schoolId } });
    if (!profile) throw new Error("Profil salarial employe introuvable.");
    const principalAmount = roundCurrency(input.principalAmount);
    const installmentAmount = roundCurrency(input.installmentAmount);
    if (installmentAmount <= 0 || installmentAmount > principalAmount) {
      throw new Error("Le montant par echeance doit etre positif et ne peut pas depasser le montant total.");
    }

    const startDate = new Date(input.startDate);
    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime()) || dueDate < startDate) {
      throw new Error("Echeance invalide pour cet engagement employe.");
    }

    const risk = deriveEmployeeRisk({ balance: principalAmount, baseSalary: Number(profile.baseSalary || 0), dueDate, installmentAmount });
    const obligation = await tx.employeeObligation.create({
      data: {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        createdById: input.createdById,
        approvedById: input.approvedById,
        type: input.type,
        title: input.title,
        principalAmount,
        balance: principalAmount,
        currency: input.currency ?? profile.currency,
        repaymentMethod: input.repaymentMethod ?? EmployeeRepaymentMethod.SALARY_DEDUCTION,
        installmentAmount,
        startDate,
        dueDate,
        riskLevel: risk.riskLevel,
        riskScore: risk.riskScore,
        notes: input.notes,
        approvedAt: input.approvedById ? new Date() : null,
        metadata: {
          salaryAtCreation: profile.baseSalary,
          suggestedMaxSalaryDeduction: roundCurrency(Number(profile.baseSalary || 0) * 0.35),
          daysLateAtCreation: risk.daysLate
        }
      }
    });

    const repayments = [];
    let remaining = principalAmount;
    let sequence = 0;
    let cursor = startDate;
    while (remaining > 0 && cursor <= dueDate && sequence < 60) {
      const expectedAmount = roundCurrency(Math.min(installmentAmount, remaining));
      repayments.push({
        schoolId: input.schoolId,
        obligationId: obligation.id,
        salaryProfileId: profile.id,
        method: input.repaymentMethod ?? EmployeeRepaymentMethod.SALARY_DEDUCTION,
        expectedAmount,
        currency: input.currency ?? profile.currency,
        dueDate: cursor
      });
      remaining = roundCurrency(remaining - expectedAmount);
      cursor = addMonths(startDate, sequence + 1);
      sequence += 1;
    }
    if (remaining > 0) {
      repayments.push({
        schoolId: input.schoolId,
        obligationId: obligation.id,
        salaryProfileId: profile.id,
        method: input.repaymentMethod ?? EmployeeRepaymentMethod.SALARY_DEDUCTION,
        expectedAmount: remaining,
        currency: input.currency ?? profile.currency,
        dueDate
      });
    }
    await tx.employeeRepayment.createMany({ data: repayments });
    await tx.employeeSalaryProfile.update({
      where: { id: profile.id },
      data: { advanceBalance: { increment: input.type === EmployeeObligationType.SALARY_ADVANCE ? principalAmount : 0 } }
    });

    const receipt = buildEmployeeFinanceReceipt({
      kind: "OBLIGATION",
      reference: obligation.id,
      employeeName: profile.fullName,
      employeeCode: profile.employeeCode,
      title: input.title,
      amount: principalAmount,
      currency: input.currency ?? profile.currency,
      method: input.disbursementMethod ?? PaymentMethod.CASH,
      balance: principalAmount,
      recordedById: input.createdById,
      notes: input.notes
    });

    await tx.accountingEntry.create({
      data: {
        schoolId: input.schoolId,
        entryType: input.type === EmployeeObligationType.SALARY_ADVANCE ? AccountingEntryType.LIABILITY : AccountingEntryType.ADJUSTMENT,
        direction: input.type === EmployeeObligationType.SALARY_ADVANCE ? "OUTFLOW" : "INFLOW",
        title: `${input.type === EmployeeObligationType.SALARY_ADVANCE ? "Avance employé" : "Dette employé"} - ${profile.fullName}`,
        amount: principalAmount,
        currency: input.currency ?? profile.currency,
        entryDate: new Date(),
        department: profile.department,
        metadata: {
          receiptNumber: receipt.receiptNumber,
          employeeObligationId: obligation.id,
          salaryProfileId: profile.id,
          employeeCode: profile.employeeCode,
          type: input.type,
          method: input.disbursementMethod ?? PaymentMethod.CASH
        }
      }
    });

    await tx.cashflowEntry.create({
      data: {
        schoolId: input.schoolId,
        direction: input.type === EmployeeObligationType.SALARY_ADVANCE ? "OUTFLOW" : "INFLOW",
        sourceType: "EMPLOYEE_OBLIGATION",
        amount: principalAmount,
        currency: input.currency ?? profile.currency,
        method: input.disbursementMethod ?? PaymentMethod.CASH,
        referenceDate: new Date(),
        notes: `${receipt.receiptNumber} | ${input.title} | ${profile.employeeCode}`
      }
    });

    await tx.financialAttachment.create({
      data: {
        schoolId: input.schoolId,
        uploadedById: input.createdById,
        kind: FinancialAttachmentKind.RECEIPT,
        fileName: receipt.fileName,
        fileUrl: receipt.fileUrl,
        mimeType: "application/json",
        notes: `Reçu ${receipt.receiptNumber} lié à l'engagement employé ${obligation.id}.`
      }
    });

    const savedObligation = await tx.employeeObligation.findUniqueOrThrow({
      where: { id: obligation.id },
      include: { salaryProfile: true, repayments: { orderBy: { dueDate: "asc" } } }
    });
    return { ...savedObligation, receipt };
  });
}

export async function recordEmployeeRepayment(input: {
  schoolId: string;
  repaymentId: string;
  recordedById?: string;
  paidAmount: number;
  paidAt?: string;
  reference?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
}) {
  return prisma.$transaction(async (tx) => {
    const repayment = await tx.employeeRepayment.findFirst({
      where: { id: input.repaymentId, schoolId: input.schoolId },
      include: { obligation: true }
    });
    if (!repayment) throw new Error("Echeance de remboursement introuvable.");
    const paidAmount = roundCurrency(input.paidAmount);
    const nextPaid = roundCurrency(Number(repayment.paidAmount || 0) + paidAmount);
    const status = deriveRepaymentStatus(Number(repayment.expectedAmount || 0), nextPaid, repayment.dueDate);
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const updatedRepayment = await tx.employeeRepayment.update({
      where: { id: repayment.id },
      data: {
        paidAmount: nextPaid,
        paidAt,
        status,
        recordedById: input.recordedById,
        reference: input.reference,
        notes: input.notes,
        method: EmployeeRepaymentMethod.EXTERNAL_PAYMENT
      }
    });
    const newBalance = roundCurrency(Math.max(Number(repayment.obligation.balance || 0) - paidAmount, 0));
    const obligationStatus = newBalance <= 0
      ? EmployeeObligationStatus.PAID
      : (dayjs(repayment.obligation.dueDate).isBefore(dayjs(), "day") ? EmployeeObligationStatus.OVERDUE : EmployeeObligationStatus.ACTIVE);
    await tx.employeeObligation.update({
      where: { id: repayment.obligationId },
      data: {
        amountPaid: { increment: paidAmount },
        balance: newBalance,
        status: obligationStatus,
        settledAt: newBalance <= 0 ? paidAt : null
      }
    });
    if (repayment.obligation.type === EmployeeObligationType.SALARY_ADVANCE) {
      await tx.employeeSalaryProfile.update({
        where: { id: repayment.salaryProfileId },
        data: { advanceBalance: { decrement: paidAmount } }
      });
    }
    const profile = await tx.employeeSalaryProfile.findUnique({ where: { id: repayment.salaryProfileId } });
    const receipt = buildEmployeeFinanceReceipt({
      kind: "REPAYMENT",
      reference: updatedRepayment.id,
      employeeName: profile?.fullName ?? repayment.salaryProfileId,
      employeeCode: profile?.employeeCode ?? repayment.salaryProfileId,
      title: repayment.obligation.title,
      amount: paidAmount,
      currency: repayment.currency,
      method: input.paymentMethod ?? PaymentMethod.CASH,
      createdAt: paidAt,
      balance: newBalance,
      recordedById: input.recordedById,
      notes: input.notes
    });

    await tx.accountingEntry.create({
      data: {
        schoolId: input.schoolId,
        entryType: AccountingEntryType.LIABILITY,
        direction: "INFLOW",
        title: `Remboursement employé - ${profile?.fullName ?? repayment.salaryProfileId}`,
        amount: paidAmount,
        currency: repayment.currency,
        entryDate: paidAt,
        department: profile?.department ?? "Human Resources",
        metadata: {
          receiptNumber: receipt.receiptNumber,
          employeeRepaymentId: updatedRepayment.id,
          employeeObligationId: repayment.obligationId,
          salaryProfileId: repayment.salaryProfileId,
          employeeCode: profile?.employeeCode,
          method: input.paymentMethod ?? PaymentMethod.CASH,
          reference: input.reference
        }
      }
    });

    await tx.cashflowEntry.create({
      data: {
        schoolId: input.schoolId,
        direction: "INFLOW",
        sourceType: "EMPLOYEE_REPAYMENT",
        amount: paidAmount,
        currency: repayment.currency,
        method: input.paymentMethod ?? PaymentMethod.CASH,
        referenceDate: paidAt,
        notes: `${receipt.receiptNumber} | ${repayment.obligation.title} | ${profile?.employeeCode ?? repayment.salaryProfileId}`
      }
    });

    await tx.financialAttachment.create({
      data: {
        schoolId: input.schoolId,
        uploadedById: input.recordedById,
        kind: FinancialAttachmentKind.PAYMENT_PROOF,
        fileName: receipt.fileName,
        fileUrl: receipt.fileUrl,
        mimeType: "application/json",
        notes: `Reçu ${receipt.receiptNumber} lié au remboursement employé ${updatedRepayment.id}.`
      }
    });

    return { ...updatedRepayment, receipt };
  });
}

export async function getEmployeeFinancialSnapshot(input: {
  schoolId: string;
  salaryProfileId?: string;
  employeeCode?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const user = input.userId ? await prisma.user.findFirst({ where: { id: input.userId, schoolId: input.schoolId } }) : null;
  const profile = await prisma.employeeSalaryProfile.findFirst({
    where: {
      schoolId: input.schoolId,
      ...(input.salaryProfileId ? { id: input.salaryProfileId } : {}),
      ...(input.employeeCode ? { employeeCode: { equals: input.employeeCode, mode: "insensitive" } } : {}),
      ...(!input.salaryProfileId && !input.employeeCode && user ? {
        OR: [
          { employeeCode: { equals: user.accessCode.replace(/^ACC-/, ""), mode: "insensitive" } },
          { fullName: { equals: user.fullName, mode: "insensitive" } },
          { notes: { contains: `UserId: ${user.id}`, mode: "insensitive" } },
          { notes: { contains: `Email: ${user.email}`, mode: "insensitive" } },
          { notes: { contains: `AccessCode: ${user.accessCode}`, mode: "insensitive" } },
          { contactEmail: { equals: user.email, mode: "insensitive" } }
        ]
      } : {})
    }
  });
  if (!profile) throw new Error("Profil financier employe introuvable.");
  const obligations = await listEmployeeFinancialObligations({
    schoolId: input.schoolId,
    salaryProfileId: profile.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo
  });
  const payrollRecords = await prisma.payrollItem.findMany({
    where: {
      schoolId: input.schoolId,
      salaryProfileId: profile.id,
      payrollRun: {
        ...(input.dateFrom || input.dateTo ? {
          processedAt: {
            ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: new Date(input.dateTo) } : {})
          }
        } : {})
      }
    },
    include: { payrollRun: { include: { period: true } }, employeeRepayments: true, salaryProfile: true },
    orderBy: { createdAt: "desc" }
  });
  const repayments = obligations.flatMap((obligation) => obligation.repayments);
  const now = dayjs();
  const overdueRepayments = repayments.filter((repayment) => repayment.status !== EmployeeRepaymentStatus.PAID && dayjs(repayment.dueDate).isBefore(now, "day"));
  const nextRepayment = repayments
    .filter((repayment) => repayment.status !== EmployeeRepaymentStatus.PAID)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ?? null;
  const totalBalance = roundCurrency(obligations.reduce((sum, obligation) => sum + Number(obligation.balance || 0), 0));
  const totalPaid = roundCurrency(obligations.reduce((sum, obligation) => sum + Number(obligation.amountPaid || 0), 0));
  const salaryPressure = profile.baseSalary > 0 ? roundCurrency((Number(nextRepayment?.expectedAmount || 0) / Number(profile.baseSalary || 1)) * 100) : 0;
  const dueRepaymentsForProjection = repayments
    .filter((repayment) => repayment.status !== EmployeeRepaymentStatus.PAID && !dayjs(repayment.dueDate).isAfter(dayjs(), "day"))
    .map((repayment) => {
      const obligation = obligations.find((item) => item.id === repayment.obligationId);
      return {
        id: repayment.id,
        obligationId: repayment.obligationId,
        expectedAmount: Number(repayment.expectedAmount || 0),
        paidAmount: Number(repayment.paidAmount || 0),
        method: repayment.method,
        dueDate: repayment.dueDate,
        obligation: {
          type: obligation?.type ?? EmployeeObligationType.OTHER_DEBT,
          balance: Number(obligation?.balance || 0),
          title: obligation?.title
        }
      };
    });
  const salaryProjection = calculateEmployeeMonthlySalary({ profile, dueRepayments: dueRepaymentsForProjection });
  const communicationHistory = await prisma.employeeCommunicationLog.findMany({
    where: { schoolId: input.schoolId, salaryProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { sentBy: { select: { id: true, fullName: true, role: true } } }
  });
  return {
    profile,
    obligations,
    payrollRecords,
    salaryProjection,
    communicationHistory,
    totals: {
      totalPrincipal: roundCurrency(obligations.reduce((sum, obligation) => sum + Number(obligation.principalAmount || 0), 0)),
      totalPaid,
      totalBalance,
      salaryAdvanceBalance: roundCurrency(obligations.filter((item) => item.type === EmployeeObligationType.SALARY_ADVANCE).reduce((sum, item) => sum + Number(item.balance || 0), 0)),
      schoolDebtBalance: roundCurrency(obligations.filter((item) => item.type === EmployeeObligationType.SCHOOL_DEBT).reduce((sum, item) => sum + Number(item.balance || 0), 0)),
      overdueAmount: roundCurrency(overdueRepayments.reduce((sum, repayment) => sum + Math.max(Number(repayment.expectedAmount || 0) - Number(repayment.paidAmount || 0), 0), 0)),
      overdueCount: overdueRepayments.length,
      nextRepaymentAmount: roundCurrency(Number(nextRepayment?.expectedAmount || 0)),
      nextRepaymentDueDate: nextRepayment?.dueDate.toISOString() ?? null,
      salaryPressure
    },
    intelligence: {
      riskLevel: totalBalance > Number(profile.baseSalary || 0) * 2 || overdueRepayments.length >= 2 || salaryProjection.riskLevel === "HIGH" ? "HIGH" : totalBalance > Number(profile.baseSalary || 0) || overdueRepayments.length || salaryProjection.riskLevel === "MEDIUM" ? "MEDIUM" : "LOW",
      recommendation: salaryProjection.salaryPressure > salaryProjection.maxDeductionRate
        ? "Revoir l'echeancier: la projection de deduction depasse le plafond salarial configure."
        : overdueRepayments.length
          ? "Prioriser les echeances en retard avant toute nouvelle avance."
          : salaryProjection.recommendation,
      salaryProtectionFloor: salaryProjection.deductionCeiling
    }
  };
}

export async function sendEmployeeFinancialTransparencyNotice(input: {
  schoolId: string;
  salaryProfileId: string;
  sentById?: string;
  channels: NotificationChannel[];
  subject?: string;
  body?: string;
}) {
  const snapshot = await getEmployeeFinancialSnapshot({ schoolId: input.schoolId, salaryProfileId: input.salaryProfileId });
  const profile = snapshot.profile;
  const matchedUser = await prisma.user.findFirst({
    where: {
      schoolId: input.schoolId,
      OR: [
        { fullName: { equals: profile.fullName, mode: "insensitive" } },
        { accessCode: { equals: `ACC-${profile.employeeCode}`, mode: "insensitive" } },
        { accessCode: { equals: profile.employeeCode, mode: "insensitive" } }
      ]
    }
  });
  const contactEmail = profile.contactEmail || matchedUser?.email || null;
  const contactPhone = profile.contactPhone || null;
  const subject = input.subject?.trim() || "Transparence salariale EduPay";
  const body = input.body?.trim() || [
    `Bonjour ${profile.fullName},`,
    "",
    "Votre situation financiere employee a ete mise a jour dans EduPay.",
    `Salaire mensuel brut: ${snapshot.salaryProjection.grossSalary.toFixed(2)} ${profile.currency}`,
    `Deductions prevues: ${snapshot.salaryProjection.totalDeductions.toFixed(2)} ${profile.currency}`,
    `Salaire net previsionnel: ${snapshot.salaryProjection.netSalary.toFixed(2)} ${profile.currency}`,
    `Solde avances/dettes: ${snapshot.totals.totalBalance.toFixed(2)} ${profile.currency}`,
    `Mode de deduction: ${snapshot.salaryProjection.mode}`,
    `Recommandation: ${snapshot.intelligence.recommendation}`,
    "",
    "Connectez-vous a votre dashboard EduPay pour verifier les details, echeances et historiques."
  ].join("\n");
  const statuses: Array<{ channel: NotificationChannel; status: string; target?: string | null }> = [];

  if (input.channels.includes(NotificationChannel.EMAIL)) {
    let status = "SKIPPED:NO_EMAIL";
    if (contactEmail) status = await sendEmail({ to: contactEmail, subject, text: body });
    await prisma.employeeCommunicationLog.create({
      data: {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        sentById: input.sentById,
        channel: NotificationChannel.EMAIL,
        subject,
        content: body,
        status,
        metadata: { target: contactEmail, netSalary: snapshot.salaryProjection.netSalary }
      }
    });
    statuses.push({ channel: NotificationChannel.EMAIL, status, target: contactEmail });
  }

  if (input.channels.includes(NotificationChannel.SMS)) {
    const smsBody = `EduPay: salaire net prevu ${snapshot.salaryProjection.netSalary.toFixed(2)} ${profile.currency}, deductions ${snapshot.salaryProjection.totalDeductions.toFixed(2)}, solde ${snapshot.totals.totalBalance.toFixed(2)}. Verifiez votre dashboard.`;
    let status = "SKIPPED:NO_PHONE";
    if (contactPhone) status = await sendSms({ to: contactPhone, text: smsBody });
    await prisma.employeeCommunicationLog.create({
      data: {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        sentById: input.sentById,
        channel: NotificationChannel.SMS,
        subject,
        content: smsBody,
        status,
        metadata: { target: contactPhone, netSalary: snapshot.salaryProjection.netSalary }
      }
    });
    statuses.push({ channel: NotificationChannel.SMS, status, target: contactPhone });
  }

  if (input.channels.includes(NotificationChannel.DASHBOARD) || statuses.length === 0) {
    await prisma.employeeCommunicationLog.create({
      data: {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        sentById: input.sentById,
        channel: NotificationChannel.DASHBOARD,
        subject,
        content: body,
        status: "VISIBLE",
        metadata: { netSalary: snapshot.salaryProjection.netSalary, salaryPressure: snapshot.salaryProjection.salaryPressure }
      }
    });
    statuses.push({ channel: NotificationChannel.DASHBOARD, status: "VISIBLE" });
  }

  return { profileId: profile.id, statuses, snapshot: { totals: snapshot.totals, salaryProjection: snapshot.salaryProjection } };
}

export async function listPayrollRuns(input: { schoolId: string }) {
  return prisma.payrollRun.findMany({
    where: { schoolId: input.schoolId },
    include: { period: true, items: { include: { salaryProfile: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ createdAt: "desc" }]
  });
}

export async function createPayrollRun(input: {
  schoolId: string;
  createdById?: string;
  title: string;
  periodId?: string;
  department?: string;
  frequency?: PayrollFrequency;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const period = await getPreferredPeriod(input.schoolId, input.periodId, tx);
    const salaryProfiles = await tx.employeeSalaryProfile.findMany({
      where: {
        schoolId: input.schoolId,
        isActive: true,
        ...(input.department ? { department: input.department } : {})
      },
      orderBy: { fullName: "asc" }
    });

    if (!salaryProfiles.length) {
      throw new Error("No active salary profiles found for this payroll run.");
    }

    const dueRepaymentsByProfile = new Map<string, Array<{
      id: string;
      obligationId: string;
      expectedAmount: number;
      paidAmount: number;
      method: EmployeeRepaymentMethod;
      dueDate: Date;
      obligation: { type: EmployeeObligationType; balance: number };
    }>>();
    const dueRepayments = await tx.employeeRepayment.findMany({
      where: {
        schoolId: input.schoolId,
        salaryProfileId: { in: salaryProfiles.map((profile) => profile.id) },
        status: { in: [EmployeeRepaymentStatus.SCHEDULED, EmployeeRepaymentStatus.PARTIALLY_PAID, EmployeeRepaymentStatus.OVERDUE] },
        dueDate: { lte: new Date() },
        method: { in: [EmployeeRepaymentMethod.SALARY_DEDUCTION, EmployeeRepaymentMethod.MIXED] }
      },
      include: { obligation: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
    });
    for (const repayment of dueRepayments) {
      const list = dueRepaymentsByProfile.get(repayment.salaryProfileId) ?? [];
      list.push({
        id: repayment.id,
        obligationId: repayment.obligationId,
        expectedAmount: Number(repayment.expectedAmount || 0),
        paidAmount: Number(repayment.paidAmount || 0),
        method: repayment.method,
        dueDate: repayment.dueDate,
        obligation: { type: repayment.obligation.type, balance: Number(repayment.obligation.balance || 0) }
      });
      dueRepaymentsByProfile.set(repayment.salaryProfileId, list);
    }

    const itemRepaymentPlans = new Map<number, Array<{ repaymentId: string; obligationId: string; amount: number; type: EmployeeObligationType }>>();
    const items = salaryProfiles.map((profile, index) => {
      const salaryCalculation = calculateEmployeeMonthlySalary({
        profile,
        dueRepayments: dueRepaymentsByProfile.get(profile.id) ?? []
      });
      itemRepaymentPlans.set(index, salaryCalculation.plannedRepayments);
      return {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        baseSalary: salaryCalculation.baseSalary,
        bonuses: salaryCalculation.bonuses,
        deductions: salaryCalculation.deductions,
        advancesRecovered: salaryCalculation.advancesRecovered,
        debtRecovered: salaryCalculation.debtRecovered,
        netSalary: salaryCalculation.netSalary,
        salarySlipNumber: `SLIP-${dayjs().format("YYYYMM")}-${String(index + 1).padStart(3, "0")}`
      };
    });

    const totalGross = roundCurrency(items.reduce((sum, item) => sum + item.baseSalary, 0));
    const totalBonuses = roundCurrency(items.reduce((sum, item) => sum + item.bonuses, 0));
    const totalDeductions = roundCurrency(items.reduce((sum, item) => sum + item.deductions + item.advancesRecovered + item.debtRecovered, 0));
    const totalNet = roundCurrency(items.reduce((sum, item) => sum + item.netSalary, 0));

    const payrollRun = await tx.payrollRun.create({
      data: {
        schoolId: input.schoolId,
        periodId: period.id,
        createdById: input.createdById,
        title: input.title,
        department: input.department,
        frequency: input.frequency ?? PayrollFrequency.MONTHLY,
        status: PayrollRunStatus.PROCESSED,
        totalGross,
        totalBonuses,
        totalDeductions,
        totalNet,
        processedAt: new Date(),
        notes: input.notes
      }
    });

    for (const [index, item] of items.entries()) {
      const payrollItem = await tx.payrollItem.create({
        data: {
          ...item,
          payrollRunId: payrollRun.id
        }
      });
      for (const planned of itemRepaymentPlans.get(index) ?? []) {
        const repayment = await tx.employeeRepayment.findUnique({ where: { id: planned.repaymentId }, include: { obligation: true } });
        if (!repayment) continue;
        const nextPaid = roundCurrency(Number(repayment.paidAmount || 0) + planned.amount);
        await tx.employeeRepayment.update({
          where: { id: repayment.id },
          data: {
            payrollItemId: payrollItem.id,
            paidAmount: nextPaid,
            paidAt: new Date(),
            status: deriveRepaymentStatus(Number(repayment.expectedAmount || 0), nextPaid, repayment.dueDate),
            notes: "Recupere automatiquement par run de paie"
          }
        });
        const newBalance = roundCurrency(Math.max(Number(repayment.obligation.balance || 0) - planned.amount, 0));
        await tx.employeeObligation.update({
          where: { id: planned.obligationId },
          data: {
            amountPaid: { increment: planned.amount },
            balance: newBalance,
            status: newBalance <= 0 ? EmployeeObligationStatus.PAID : EmployeeObligationStatus.ACTIVE,
            settledAt: newBalance <= 0 ? new Date() : null
          }
        });
        if (planned.type === EmployeeObligationType.SALARY_ADVANCE) {
          await tx.employeeSalaryProfile.update({
            where: { id: item.salaryProfileId },
            data: { advanceBalance: { decrement: planned.amount } }
          });
        }
      }
    }

    await tx.accountingEntry.create({
      data: {
        schoolId: input.schoolId,
        payrollRunId: payrollRun.id,
        entryType: AccountingEntryType.PAYROLL,
        direction: "OUTFLOW",
        title: payrollRun.title,
        amount: totalNet,
        currency: "USD",
        entryDate: new Date(),
        department: input.department ?? "Human Resources",
        metadata: {
          periodId: period.id,
          itemCount: items.length
        }
      }
    });

    await tx.cashflowEntry.create({
      data: {
        schoolId: input.schoolId,
        payrollRunId: payrollRun.id,
        direction: "OUTFLOW",
        sourceType: "PAYROLL",
        amount: totalNet,
        currency: "USD",
        referenceDate: new Date(),
        notes: input.notes
      }
    });

    return tx.payrollRun.findUniqueOrThrow({
      where: { id: payrollRun.id },
      include: { period: true, items: { include: { salaryProfile: true }, orderBy: { createdAt: "asc" } } }
    });
  });
}
