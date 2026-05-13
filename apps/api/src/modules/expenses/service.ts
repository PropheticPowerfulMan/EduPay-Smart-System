import {
  AccountingEntryType,
  ApprovalStepRole,
  ApprovalStepStatus,
  BudgetStatus,
  ExpenseCategoryType,
  ExpenseStatus,
  FinancialAttachmentKind,
  FinancialPeriodType,
  PayrollFrequency,
  PayrollRunStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role
} from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "../../prisma";

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
    slug: "charges-exploitation-60-achat",
    name: "60 Achat",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "60100-achats-fournitures-bureau-consommables-informatiques", name: "60100 Achats fournitures de bureau et consommables informatiques" },
      { slug: "60101-achats-fournitures-entretiens", name: "60101 Achats fournitures d'entretiens" },
      { slug: "60102-fournitures-non-stockables", name: "60102 Fournitures non stockables (eau, électricité et autres énergies)" },
      { slug: "60103-achats-petit-materiel-outillage", name: "60103 Achats petit matériel et outillage" },
      { slug: "60104-achats-carburant-lubrifiant", name: "60104 Achats carburant et lubrifiant véhicule et générateur" }
    ]
  },
  {
    slug: "charges-exploitation-61-transports",
    name: "61 Transports",
    type: ExpenseCategoryType.TRANSPORT,
    subcategories: [
      { slug: "60100-voyage-deplacement", name: "60100 Voyage et déplacement" }
    ]
  },
  {
    slug: "charges-exploitation-62-services-exterieurs",
    name: "62 Services extérieurs",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "62100-sous-traitance-generale", name: "62100 Sous traitance générale" },
      { slug: "62101-location-charge-locative", name: "62101 Location et charge locative" },
      { slug: "62102-entretien-reparation", name: "62102 Entretien et réparation (véhicules et autres)" },
      { slug: "62103-primes-assurance", name: "62103 Primes d'assurance (véhicules bâtiment)" },
      { slug: "62104-divers-services-exterieurs", name: "62104 Divers services extérieurs" }
    ]
  },
  {
    slug: "charges-exploitation-63-autres-services-exterieurs",
    name: "63 Autres services extérieurs",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "63100-honoraire-avocat-conseil", name: "63100 Honoraire Avocat conseil" },
      { slug: "63101-honoraire-cabinet-audit-externe", name: "63101 Honoraire Cabinet audit externe" },
      { slug: "63102-honoraires-autres-consultants", name: "63102 Honoraires Autres consultants" },
      { slug: "63105-frais-postaux-telecommunications", name: "63105 Frais postaux et de télécommunications (courrier, téléphone, internet)" },
      { slug: "63106-services-bancaires-autres", name: "63106 Services bancaires et autres" }
    ]
  },
  {
    slug: "charges-exploitation-64-impots-taxes",
    name: "64 Impôts et taxes",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "64100-vignettes-assurances-controle-technique", name: "64100 Vignettes, Assurances, contrôle technique..." },
      { slug: "64101-autres-impots-taxes", name: "64101 Autres impôts et taxes" }
    ]
  },
  {
    slug: "charges-exploitation-65-autres-charges-gestion-courante",
    name: "65 Autres charges de gestion courante",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "65100-frais-representation-reunions", name: "65100 Frais de représentation et des réunions" },
      { slug: "65101-jetons-presence-remunerations-administrateurs", name: "65101 Jetons de présence et autres rémunérations d'administrateurs" },
      { slug: "65102-autres-frais-tenue-ca", name: "65102 Autres frais tenue CA (location salle, rafraîchissement et autres)" }
    ]
  },
  {
    slug: "charges-exploitation-66-charges-personnel",
    name: "66 Charges de personnel",
    type: ExpenseCategoryType.HUMAN_RESOURCES,
    subcategories: [
      { slug: "66-remuneration-personnels", name: "66 Rémunération des personnels" },
      { slug: "66110-charges-sociales", name: "66110 Charges sociales (INSS QPP, INPP, ONEM)" },
      { slug: "66111-soins-medicaux-personnel", name: "66111 Soins médicaux personnel" },
      { slug: "66112-autres-charges-personnel", name: "66112 Autres charges de personnel (Coût formation personnel)" }
    ]
  },
  {
    slug: "charges-financieres-67",
    name: "67 Charges financières",
    type: ExpenseCategoryType.ADMINISTRATIVE,
    subcategories: [
      { slug: "67100-interets-bancaires-tresorerie", name: "67100 Intérêts bancaires et sur opérations de trésorerie" }
    ]
  },
  {
    slug: "charges-exceptionnelles-83",
    name: "83 Charges exceptionnelles",
    type: ExpenseCategoryType.SPECIAL_INSTITUTIONAL,
    ownerApprovalRequired: true,
    subcategories: [
      { slug: "83100-operations-gestion-penalites-amendes", name: "83100 Sur opérations de gestion (pénalités, amandes fiscales et penales)" },
      { slug: "83100-autres-charges-exceptionnelles", name: "83100 Autres charges exceptionnelles" }
    ]
  },
  {
    slug: "investissement-2",
    name: "2 Investissement",
    type: ExpenseCategoryType.INFRASTRUCTURE,
    ownerApprovalRequired: true,
    subcategories: [
      { slug: "20100-batiment-administratif-propre", name: "20100 Bâtiment administratif propre" },
      { slug: "20101-mobilier-materiels-informatiques-classe-bureau", name: "20101 Mobilier, matériels informatiques et autres matériels de Classe & bureau" },
      { slug: "20102-telephone-interne", name: "20102 Téléphone interne" }
    ]
  }
];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
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
  if (role === Role.ADMIN) return [ApprovalStepRole.ADMINISTRATION];
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
  const period = await client.financialPeriod.findFirst({ where: { id: periodId, schoolId } });
  return period ?? catalog.monthlyPeriod;
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
  status: "APPROVED" | "REJECTED";
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
        include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true }
      });
    }

    const remainingStep = expense.approvalSteps.find((step) => step.stage > currentStep.stage);
    if (remainingStep) {
      return tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true }
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
      include: { approvalSteps: { orderBy: { stage: "asc" } }, category: true, budget: true, period: true }
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
      notes: input.notes
    }
  });
}

export async function listPayrollRuns(input: { schoolId: string }) {
  return prisma.payrollRun.findMany({
    where: { schoolId: input.schoolId },
    include: { period: true, items: { include: { salaryProfile: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ createdAt: "desc" }]
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

    const items = salaryProfiles.map((profile, index) => {
      const bonuses = roundCurrency(profile.defaultBonus || 0);
      const deductions = roundCurrency(profile.defaultDeduction || 0);
      const advancesRecovered = 0;
      const debtRecovered = roundCurrency((Number(profile.baseSalary || 0) * Number(profile.debtRecoveryRate || 0)) / 100);
      const netSalary = roundCurrency(Number(profile.baseSalary || 0) + bonuses - deductions - advancesRecovered - debtRecovered);
      return {
        schoolId: input.schoolId,
        salaryProfileId: profile.id,
        baseSalary: roundCurrency(profile.baseSalary),
        bonuses,
        deductions,
        advancesRecovered,
        debtRecovered,
        netSalary,
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

    for (const item of items) {
      await tx.payrollItem.create({
        data: {
          ...item,
          payrollRunId: payrollRun.id
        }
      });
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
