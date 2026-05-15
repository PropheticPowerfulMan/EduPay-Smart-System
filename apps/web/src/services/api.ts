import {
  buildDemoFinanceCatalog,
  buildDemoFinanceOverview,
  buildDemoParentFinanceProfile,
  buildDemoReductionAnalytics,
  setDemoFinanceOverrides
} from "./demoFinance";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const API_BASE_URL = RAW_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");
const TOKEN_STORAGE_KEY = "edupay_token";
const ROLE_STORAGE_KEY = "edupay_role";
const NAME_STORAGE_KEY = "edupay_name";
const PARENT_ID_STORAGE_KEY = "edupay_parent_id";
const SESSION_ACTIVE_KEY = "edupay_session_active";
const DEMO_PARENTS_KEY = "edupay_demo_parents_v2";
const DEMO_PAYMENTS_KEY = "edupay_payments_v3";
const DEMO_NOTIFICATIONS_KEY = "edupay-payment-notifications-enabled";
const DEMO_PARENT_CREDENTIALS_KEY = "edupay_demo_parent_credentials_v1";
const DEMO_FINANCE_OVERRIDES_KEY = "edupay_demo_finance_overrides_v1";
const DEMO_EXPENSE_CATEGORIES_KEY = "edupay_demo_expense_categories_v1";
const DEMO_EXPENSE_VENDORS_KEY = "edupay_demo_expense_vendors_v1";
const DEMO_EXPENSE_BUDGETS_KEY = "edupay_demo_expense_budgets_v1";
const DEMO_EXPENSE_ITEMS_KEY = "edupay_demo_expense_items_v1";
const DEMO_SALARY_PROFILES_KEY = "edupay_demo_salary_profiles_v1";
const DEMO_PAYROLL_RUNS_KEY = "edupay_demo_payroll_runs_v1";
const DEMO_FALLBACK_ENABLED = (import.meta.env.VITE_ENABLE_DEMO_FALLBACK ?? "").trim().toLowerCase() === "true";
const STATIC_APP_FALLBACK_ENABLED = ["demo", "github-pages", "pages"].includes((import.meta.env.VITE_ENVIRONMENT ?? "").trim().toLowerCase());
const PLACEHOLDER_API_URL = /MON-BACKEND|example\.com/i.test(API_BASE_URL);
const PRODUCTION_MODE = import.meta.env.PROD && !STATIC_APP_FALLBACK_ENABLED && !DEMO_FALLBACK_ENABLED;
const LOCAL_API_FALLBACK_ENABLED =
  !PRODUCTION_MODE && (
    DEMO_FALLBACK_ENABLED ||
    STATIC_APP_FALLBACK_ENABLED ||
    PLACEHOLDER_API_URL ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL)
  );

type DemoStudent = { id: string; fullName: string; classId: string; className: string; annualFee: number; payments?: DemoPayment[] };
type DemoParent = { id: string; nom: string; postnom: string; prenom: string; fullName: string; phone: string; email: string; photoUrl?: string; students: DemoStudent[]; createdAt: string };
type DemoTuitionAllocationLine = {
  installmentId: string;
  studentId: string;
  studentName: string;
  label: string;
  dueDate: string;
  dueBucket: "OVERDUE" | "CURRENT" | "FUTURE";
  amountDue: number;
  alreadyPaid: number;
  outstandingBefore: number;
  allocated: number;
  outstandingAfter: number;
};
type DemoTuitionAllocationSummary = {
  mode: "AUTO" | "MANUAL";
  message: string;
  totalReceived: number;
  allocatedTotal: number;
  missingAmount: number;
  advanceBalance: number;
  perChild: Array<{
    studentName: string;
    allocated: number;
    remaining: number;
    lines: Array<{ label: string; dueBucket: string; outstandingBefore: number; allocated: number; outstandingAfter: number }>;
  }>;
};
type DemoPayment = { id: string; transactionNumber: string; parentId?: string; parentFullName: string; paymentSubjectName?: string; studentNames?: string[]; reason: string; method: string; amount: number; status: string; createdAt: string; date: string; tuitionAllocationSummary?: DemoTuitionAllocationSummary };
type DemoParentCredential = { parentId: string; email: string; password: string };
type DemoPaymentOptionType = "FULL_PRESEPTEMBER" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS" | "STANDARD_MONTHLY" | "SPECIAL_OWNER_AGREEMENT";
type DemoFinanceOverride =
  | { mode: "OFFICIAL"; paymentOptionType: DemoPaymentOptionType }
  | {
      mode: "AGREEMENT";
      agreement: {
        title: string;
        customTotal: number;
        reductionAmount: number;
        status: string;
        privateNotes: string;
        notes: string;
        installments: Array<{ label: string; dueDate: string; amountDue: number; notes?: string }>;
      };
    };

type DemoExpenseCategory = {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentCategoryId: string | null;
  ownerApprovalRequired: boolean;
  description?: string;
};

type DemoVendor = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
};

type DemoBudget = {
  id: string;
  name: string;
  department: string;
  plannedAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  utilization: number;
  status: string;
  alertThreshold: number;
  notes?: string;
  categoryId?: string;
  period: { id: string; name: string };
  category: { id: string; name: string } | null;
  createdAt: string;
};

type DemoExpenseApprovalStep = {
  stage: number;
  role: string;
  status: string;
  comments?: string;
  decidedAt?: string | null;
};

type DemoExpenseItem = {
  id: string;
  title: string;
  subcategory?: string;
  description?: string;
  department: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  supplierName?: string;
  status: string;
  categoryId: string;
  budgetId?: string;
  vendorId?: string;
  financialPeriodLabel: string;
  expenseDate: string;
  requiresOwnerApproval: boolean;
  comments?: string;
  createdAt: string;
  category: { id: string; name: string; type: string; parentCategoryId: string | null };
  vendor: DemoVendor | null;
  budget: DemoBudget | null;
  period: { id: string; name: string };
  attachments: Array<{ id: string; kind: string; fileName: string; fileUrl: string; mimeType?: string; notes?: string }>;
  approvalSteps: DemoExpenseApprovalStep[];
};

type DemoSalaryProfile = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  baseSalary: number;
  currency: string;
  frequency: string;
  defaultBonus: number;
  defaultDeduction: number;
  advanceBalance: number;
  debtRecoveryRate: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
};

type DemoPayrollRun = {
  id: string;
  title: string;
  department?: string;
  frequency: string;
  status: string;
  totalGross: number;
  totalBonuses: number;
  totalDeductions: number;
  totalNet: number;
  notes?: string;
  processedAt: string | null;
  createdAt: string;
  period: { id: string; name: string };
  items: Array<{
    id: string;
    baseSalary: number;
    bonuses: number;
    deductions: number;
    advancesRecovered: number;
    debtRecovered: number;
    netSalary: number;
    salarySlipNumber: string;
    salaryProfile: DemoSalaryProfile;
  }>;
};

const demoClasses = [
  ...Array.from({ length: 3 }, (_v, index) => ({ id: `section-k${index + 3}`, name: `K${index + 3}` })),
  ...Array.from({ length: 12 }, (_v, index) => ({ id: `section-grade-${index + 1}`, name: `Grade ${index + 1}` }))
];

const seedParents: DemoParent[] = [
  {
    id: "PAR-KCS-RACHEL-KABONGO",
    nom: "Kabongo",
    postnom: "",
    prenom: "Rachel",
    fullName: "Rachel Kabongo",
    phone: "+243 812 450 221",
    email: "rachel.kabongo@kcs.local",
    createdAt: new Date().toISOString(),
    students: [
      { id: "STU-KCS-ELISE-KABONGO", fullName: "Elise Kabongo", classId: "section-grade-11", className: "Grade 11A", annualFee: 2200 },
      { id: "STU-KCS-DAVID-KABONGO", fullName: "David Kabongo", classId: "section-grade-8", className: "Grade 8B", annualFee: 1800 }
    ]
  },
  {
    id: "PAR-KCS-MIREILLE-MBUYI",
    nom: "Mbuyi",
    postnom: "",
    prenom: "Mireille",
    fullName: "Mireille Mbuyi",
    phone: "+243 899 120 882",
    email: "mireille.mbuyi@kcs.local",
    createdAt: new Date().toISOString(),
    students: [
      { id: "STU-KCS-AMANI-MBUYI", fullName: "Amani Mbuyi", classId: "section-grade-10", className: "Grade 10A", annualFee: 2400 }
    ]
  }
];

const seedPayments: DemoPayment[] = [
  { id: "pay-1", transactionNumber: "TXN-20260420-10001", parentId: "PAR-KCS-RACHEL-KABONGO", parentFullName: "Rachel Kabongo", reason: "Frais scolaires - Elise Kabongo", method: "CASH", amount: 1600, status: "COMPLETED", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") },
  { id: "pay-2", transactionNumber: "TXN-20260421-10002", parentId: "PAR-KCS-RACHEL-KABONGO", parentFullName: "Rachel Kabongo", reason: "Frais scolaires - David Kabongo", method: "MPESA", amount: 980, status: "COMPLETED", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") },
  { id: "pay-3", transactionNumber: "TXN-20260422-10003", parentId: "PAR-KCS-MIREILLE-MBUYI", parentFullName: "Mireille Mbuyi", reason: "Frais scolaires - Amani Mbuyi", method: "MPESA", amount: 800, status: "PENDING", createdAt: new Date().toISOString(), date: new Date().toLocaleString("fr-FR") }
];

function clearLocalSession() {
  sessionStorage.removeItem(SESSION_ACTIVE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ROLE_STORAGE_KEY);
  localStorage.removeItem(NAME_STORAGE_KEY);
  localStorage.removeItem(PARENT_ID_STORAGE_KEY);
  localStorage.removeItem("edupay_fullName");
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function buildReadableEntityId(prefix: "PAR" | "STU", fullName: string) {
  const tokens = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  const safeTokens = tokens.length ? tokens : [prefix === "PAR" ? "PARENT" : "STUDENT"];
  return `${prefix}-KCS-${safeTokens.join("-")}`;
}

function buildUniqueDemoEntityId(prefix: "PAR" | "STU", fullName: string, existingIds: string[]) {
  const baseId = buildReadableEntityId(prefix, fullName);
  if (!existingIds.includes(baseId)) return baseId;

  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidateId = `${baseId}-${String(attempt).padStart(2, "0")}`;
    if (!existingIds.includes(candidateId)) return candidateId;
  }

  return `${baseId}-${Date.now().toString().slice(-6)}`;
}

function getDemoParents() {
  const parents = readJson<DemoParent[]>(DEMO_PARENTS_KEY, seedParents);
  writeJson(DEMO_PARENTS_KEY, parents);
  return parents;
}

function getDemoPayments() {
  const payments = readJson<DemoPayment[]>(DEMO_PAYMENTS_KEY, seedPayments);
  writeJson(DEMO_PAYMENTS_KEY, payments);
  return payments;
}

function getDemoParentCredentials() {
  const credentials = readJson<DemoParentCredential[]>(DEMO_PARENT_CREDENTIALS_KEY, []);
  writeJson(DEMO_PARENT_CREDENTIALS_KEY, credentials);
  return credentials;
}

function saveDemoParentCredential(credential: DemoParentCredential) {
  const email = credential.email.trim().toLowerCase();
  const credentials = getDemoParentCredentials().filter((item) => item.email.trim().toLowerCase() !== email);
  writeJson(DEMO_PARENT_CREDENTIALS_KEY, [{ ...credential, email }, ...credentials]);
}

function getDemoFinanceOverrides() {
  const overrides = readJson<Record<string, DemoFinanceOverride>>(DEMO_FINANCE_OVERRIDES_KEY, {});
  setDemoFinanceOverrides(overrides);
  return overrides;
}

function saveDemoFinanceOverrides(overrides: Record<string, DemoFinanceOverride>) {
  writeJson(DEMO_FINANCE_OVERRIDES_KEY, overrides);
  setDemoFinanceOverrides(overrides);
}

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return {} as Record<string, unknown>;
  try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return {}; }
}

function overview() {
  const payments = getDemoPayments();
  const parents = getDemoParents();
  const totalExpected = parents.reduce((sum, parent) => sum + parent.students.reduce((s, st) => s + Number(st.annualFee || 0), 0), 0);
  const completed = payments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + payment.amount, 0);
  return {
    totalRevenue: completed,
    monthlyRevenue: completed,
    paymentSuccessRate: payments.length ? (payments.filter((p) => p.status === "COMPLETED").length / payments.length) * 100 : 0,
    outstandingDebt: Math.max(totalExpected - completed, 0)
  };
}

function financeCatalog() {
  getDemoFinanceOverrides();
  return buildDemoFinanceCatalog();
}

function financeOverview() {
  getDemoFinanceOverrides();
  return buildDemoFinanceOverview(getDemoParents(), getDemoPayments());
}

function buildAcademicDueDate(month: number, day: number) {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year = month >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString();
}

function buildOwnerAgreementInstallments(customTotal: number) {
  const safeTotal = Math.max(Number(customTotal || 0), 0);
  const first = Math.round((safeTotal * 0.4) * 100) / 100;
  const second = Math.round((safeTotal * 0.3) * 100) / 100;
  const third = Math.round((safeTotal - first - second) * 100) / 100;
  return [
    { label: "Engagement initial", dueDate: buildAcademicDueDate(8, 31), amountDue: first, notes: "Created during parent onboarding" },
    { label: "Regularisation mi-annee", dueDate: buildAcademicDueDate(1, 31), amountDue: second, notes: "Created during parent onboarding" },
    { label: "Solde final", dueDate: buildAcademicDueDate(5, 31), amountDue: third, notes: "Created during parent onboarding" }
  ];
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function getDemoBaseAnnualTuition(className: string, annualFee: number) {
  if (/grade\s*(9|10|11|12)/i.test(className)) return 5420;
  if (/grade\s*(6|7|8)/i.test(className)) return 4595;
  if (/^k|kindergarten/i.test(className)) return 3082.5;
  if (/grade\s*(1|2|3|4|5)/i.test(className)) return 3770;
  return roundAmount(Number(annualFee || 0));
}

function buildDemoTuitionSchedule(paymentOptionType: DemoPaymentOptionType, finalTuition: number) {
  const split = (rows: Array<{ label: string; dueDate: string }>) => {
    const base = Math.floor((finalTuition / rows.length) * 100) / 100;
    let running = 0;
    return rows.map((row, index) => {
      const amountDue = index === rows.length - 1 ? roundAmount(finalTuition - running) : roundAmount(base);
      running = roundAmount(running + amountDue);
      return { sequence: index + 1, ...row, amountDue };
    });
  };

  if (paymentOptionType === "FULL_PRESEPTEMBER") {
    return split([{ label: "Full annual payment before September", dueDate: buildAcademicDueDate(8, 31) }]);
  }
  if (paymentOptionType === "TWO_INSTALLMENTS") {
    return split([
      { label: "Installment 1 - before September", dueDate: buildAcademicDueDate(8, 31) },
      { label: "Installment 2 - before February", dueDate: buildAcademicDueDate(2, 28) }
    ]);
  }
  if (paymentOptionType === "THREE_INSTALLMENTS") {
    return split([
      { label: "Installment 1 - before September", dueDate: buildAcademicDueDate(8, 31) },
      { label: "Installment 2 - Dec/Jan/Feb period", dueDate: buildAcademicDueDate(2, 28) },
      { label: "Installment 3 - Mar/Apr/May/June period", dueDate: buildAcademicDueDate(6, 30) }
    ]);
  }

  const monthlyAmount = roundAmount(finalTuition / 10);
  return [
    { sequence: 1, label: "Initial 4-month payment", dueDate: buildAcademicDueDate(8, 31), amountDue: roundAmount(monthlyAmount * 4) },
    { sequence: 2, label: "Month 5 payment", dueDate: buildAcademicDueDate(9, 30), amountDue: monthlyAmount },
    { sequence: 3, label: "Month 6 payment", dueDate: buildAcademicDueDate(10, 31), amountDue: monthlyAmount },
    { sequence: 4, label: "Month 7 payment", dueDate: buildAcademicDueDate(11, 30), amountDue: monthlyAmount },
    { sequence: 5, label: "Month 8 payment", dueDate: buildAcademicDueDate(12, 31), amountDue: monthlyAmount },
    { sequence: 6, label: "Month 9 payment", dueDate: buildAcademicDueDate(1, 31), amountDue: monthlyAmount },
    { sequence: 7, label: "Month 10 payment", dueDate: buildAcademicDueDate(2, 28), amountDue: roundAmount(finalTuition - roundAmount(monthlyAmount * 9)) }
  ];
}

function getDemoDueBucket(dueDate: string): DemoTuitionAllocationLine["dueBucket"] {
  const due = new Date(dueDate).getTime();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const currentEnd = new Date(todayEnd);
  currentEnd.setDate(currentEnd.getDate() + 30);
  if (due < todayEnd.getTime()) return "OVERDUE";
  if (due < currentEnd.getTime()) return "CURRENT";
  return "FUTURE";
}

function buildDemoAllocationMessage(input: { amount: number; lines: DemoTuitionAllocationLine[]; advanceBalance: number }) {
  const byStudent = input.lines.reduce<Record<string, number>>((acc, line) => {
    acc[line.studentName] = roundAmount((acc[line.studentName] ?? 0) + line.allocated);
    return acc;
  }, {});
  const unpaid = roundAmount(input.lines.reduce((sum, line) => sum + line.outstandingAfter, 0));
  const next = input.lines
    .filter((line) => line.outstandingAfter > 0)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0];
  const overdue = roundAmount(input.lines
    .filter((line) => line.dueBucket === "OVERDUE" && line.outstandingAfter > 0)
    .reduce((sum, line) => sum + line.outstandingAfter, 0));

  return [
    `Total amount received: $ ${input.amount.toFixed(2)}.`,
    Object.keys(byStudent).length
      ? `Allocated: ${Object.entries(byStudent).map(([student, total]) => `${student} $ ${total.toFixed(2)}`).join("; ")}.`
      : "No allocation was applied.",
    unpaid > 0 ? `Remaining unpaid: $ ${unpaid.toFixed(2)}.` : "All targeted obligations are fully paid.",
    next ? `Next required payment: ${next.studentName} - ${next.label}, $ ${next.outstandingAfter.toFixed(2)} by ${new Date(next.dueDate).toLocaleDateString("fr-FR")}.` : "No next payment is currently required.",
    overdue > 0 ? `Overdue balance: $ ${overdue.toFixed(2)}.` : "No overdue balance remains in this allocation preview.",
    input.advanceBalance > 0 ? `Advance payment balance: $ ${input.advanceBalance.toFixed(2)}.` : ""
  ].filter(Boolean).join(" ");
}

function buildDemoTuitionAllocationSummary(mode: "AUTO" | "MANUAL", preview: { allocationPreview: { message: string; totalReceived: number; allocatedTotal: number; missingAmount: number; advanceBalance: number; lines: DemoTuitionAllocationLine[] } }): DemoTuitionAllocationSummary {
  const perChild = preview.allocationPreview.lines.reduce<Record<string, DemoTuitionAllocationSummary["perChild"][number]>>((acc, line) => {
    const current = acc[line.studentName] ?? { studentName: line.studentName, allocated: 0, remaining: 0, lines: [] };
    current.allocated = roundAmount(current.allocated + line.allocated);
    current.remaining = roundAmount(current.remaining + line.outstandingAfter);
    current.lines.push({
      label: line.label,
      dueBucket: line.dueBucket,
      outstandingBefore: line.outstandingBefore,
      allocated: line.allocated,
      outstandingAfter: line.outstandingAfter
    });
    acc[line.studentName] = current;
    return acc;
  }, {});

  return {
    mode,
    message: preview.allocationPreview.message,
    totalReceived: preview.allocationPreview.totalReceived,
    allocatedTotal: preview.allocationPreview.allocatedTotal,
    missingAmount: preview.allocationPreview.missingAmount,
    advanceBalance: preview.allocationPreview.advanceBalance,
    perChild: Object.values(perChild)
  };
}

function expenseOverview() {
  const finance = financeOverview();
  const revenueBase = Math.max(Number(finance.collectedRevenue || 0), 6400);
  const payrollTotal = roundAmount(revenueBase * 0.34);
  const operationalExpenses = roundAmount(revenueBase * 0.29);
  const totalExpenses = roundAmount(payrollTotal + operationalExpenses);
  const months = Array.from({ length: 6 }, (_value, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const revenueRatio = [0.74, 0.81, 0.86, 0.92, 0.96, 1][index] ?? 1;
    const expenseRatio = [0.48, 0.56, 0.61, 0.65, 0.69, 0.63][index] ?? 0.63;
    const monthlyRevenue = roundAmount(revenueBase * revenueRatio * 0.19);
    const monthlyExpenses = roundAmount(revenueBase * expenseRatio * 0.18);
    return {
      period,
      revenue: monthlyRevenue,
      expenses: monthlyExpenses,
      profitLoss: roundAmount(monthlyRevenue - monthlyExpenses)
    };
  });

  const budgets = [
    {
      id: "budget-hr",
      name: "Masse salariale annuelle",
      department: "Ressources humaines",
      plannedAmount: 4200,
      consumedAmount: 3880,
      remainingAmount: 320,
      utilization: 92.38,
      status: "ACTIVE",
      periodName: `FY ${new Date().getFullYear()}`,
      categoryName: "Human Resources"
    },
    {
      id: "budget-ops",
      name: "Operations campus",
      department: "Administration",
      plannedAmount: 2100,
      consumedAmount: 1875,
      remainingAmount: 225,
      utilization: 89.29,
      status: "ACTIVE",
      periodName: `FY ${new Date().getFullYear()}`,
      categoryName: "Administrative Expenses"
    },
    {
      id: "budget-tech",
      name: "Modernisation IT",
      department: "Technologie",
      plannedAmount: 1350,
      consumedAmount: 1420,
      remainingAmount: 0,
      utilization: 105.19,
      status: "EXCEEDED",
      periodName: `FY ${new Date().getFullYear()}`,
      categoryName: "Technology & IT"
    }
  ];

  return {
    revenue: {
      totalRevenue: roundAmount(Number(finance.collectedRevenue || 0)),
      totalCompletedPayments: Math.max(2, finance.parentsTracked || 0)
    },
    expenses: {
      totalExpenses,
      approvedExpenses: 18,
      pendingExpenses: 4,
      rejectedExpenses: 1,
      pendingApprovalSteps: 3
    },
    payroll: {
      activeProfiles: 12,
      runCount: 3,
      totalPayroll: payrollTotal,
      salaryLiability: roundAmount(payrollTotal * 0.22)
    },
    cashflow: {
      availableCash: roundAmount(Number(finance.collectedRevenue || 0) - totalExpenses),
      operationalBalance: roundAmount(Number(finance.collectedRevenue || 0) - totalExpenses),
      profitLoss: roundAmount(Number(finance.collectedRevenue || 0) - totalExpenses)
    },
    liabilities: {
      supplierDebt: 1240,
      payrollLiability: roundAmount(payrollTotal * 0.22),
      institutionalObligations: 980
    },
    budgets,
    budgetAlerts: budgets.filter((budget) => budget.utilization >= 80 || budget.status === "EXCEEDED"),
    categorySpending: [
      { categoryId: "cat-hr", categoryName: "Human Resources", type: "HUMAN_RESOURCES", total: roundAmount(payrollTotal * 0.86) },
      { categoryId: "cat-infra", categoryName: "Infrastructure & Maintenance", type: "INFRASTRUCTURE", total: 920 },
      { categoryId: "cat-admin", categoryName: "Administrative Expenses", type: "ADMINISTRATIVE", total: 760 },
      { categoryId: "cat-tech", categoryName: "Technology & IT", type: "TECHNOLOGY", total: 640 },
      { categoryId: "cat-academic", categoryName: "Academic Expenses", type: "ACADEMIC", total: 510 }
    ],
    departmentSpending: [
      { department: "Ressources humaines", total: roundAmount(payrollTotal) },
      { department: "Administration", total: 1180 },
      { department: "Maintenance", total: 920 },
      { department: "Technologie", total: 640 },
      { department: "Academique", total: 510 }
    ],
    monthlyPerformance: months,
    recentExpenses: [
      { id: "exp-1", title: "Electricite campus", department: "Maintenance", amount: 340, categoryName: "Infrastructure & Maintenance", status: "APPROVED", expenseDate: new Date().toISOString() },
      { id: "exp-2", title: "Abonnement internet", department: "Administration", amount: 180, categoryName: "Administrative Expenses", status: "PENDING", expenseDate: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: "exp-3", title: "Licences ERP", department: "Technologie", amount: 420, categoryName: "Technology & IT", status: "APPROVED", expenseDate: new Date(Date.now() - 86400000 * 4).toISOString() },
      { id: "exp-4", title: "Achat fournitures", department: "Academique", amount: 210, categoryName: "Academic Expenses", status: "REJECTED", expenseDate: new Date(Date.now() - 86400000 * 6).toISOString() }
    ],
    recentPayrollRuns: [
      { id: "payroll-1", title: "Paie avril", department: "Ressources humaines", totalNet: 1480, status: "PAID", periodName: "2026-04", processedAt: new Date(Date.now() - 86400000 * 8).toISOString() },
      { id: "payroll-2", title: "Paie mai", department: "Ressources humaines", totalNet: 1525, status: "PROCESSED", periodName: "2026-05", processedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: "payroll-3", title: "Prime examens", department: "Academique", totalNet: 220, status: "DRAFT", periodName: "2026-05", processedAt: null }
    ]
  };
}

function getDemoCurrentPeriod() {
  const now = new Date();
  return {
    id: `period-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    name: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  };
}

function buildDefaultExpenseCategories(): DemoExpenseCategory[] {
  const groups = [
    {
      id: "cat-charges-60",
      name: "60 Achat",
      slug: "charges-exploitation-60-achat",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-60-60100-bureau-it", "60100 Achats fournitures de bureau et consommables informatiques"],
        ["cat-charges-60-60101-entretiens", "60101 Achats fournitures d'entretiens"],
        ["cat-charges-60-60102-non-stockables", "60102 Fournitures non stockables (eau, électricité et autres énergies)"],
        ["cat-charges-60-60103-petit-materiel", "60103 Achats petit matériel et outillage"],
        ["cat-charges-60-60104-carburant", "60104 Achats carburant et lubrifiant véhicule et générateur"]
      ]
    },
    {
      id: "cat-charges-61",
      name: "61 Transports",
      slug: "charges-exploitation-61-transports",
      type: "TRANSPORT",
      children: [
        ["cat-charges-61-60100-voyage", "60100 Voyage et déplacement"]
      ]
    },
    {
      id: "cat-charges-62",
      name: "62 Services extérieurs",
      slug: "charges-exploitation-62-services-exterieurs",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-62-62100-sous-traitance", "62100 Sous traitance générale"],
        ["cat-charges-62-62101-location", "62101 Location et charge locative"],
        ["cat-charges-62-62102-entretien", "62102 Entretien et réparation (véhicules et autres)"],
        ["cat-charges-62-62103-assurance", "62103 Primes d'assurance (véhicules bâtiment)"],
        ["cat-charges-62-62104-divers", "62104 Divers services extérieurs"]
      ]
    },
    {
      id: "cat-charges-63",
      name: "63 Autres services extérieurs",
      slug: "charges-exploitation-63-autres-services-exterieurs",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-63-63100-avocat", "63100 Honoraire Avocat conseil"],
        ["cat-charges-63-63101-audit", "63101 Honoraire Cabinet audit externe"],
        ["cat-charges-63-63102-consultants", "63102 Honoraires Autres consultants"],
        ["cat-charges-63-63105-telecom", "63105 Frais postaux et de télécommunications (courrier, téléphone, internet)"],
        ["cat-charges-63-63106-bancaires", "63106 Services bancaires et autres"]
      ]
    },
    {
      id: "cat-charges-64",
      name: "64 Impôts et taxes",
      slug: "charges-exploitation-64-impots-taxes",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-64-64100-vignettes", "64100 Vignettes, Assurances, contrôle technique..."],
        ["cat-charges-64-64101-autres", "64101 Autres impôts et taxes"]
      ]
    },
    {
      id: "cat-charges-65",
      name: "65 Autres charges de gestion courante",
      slug: "charges-exploitation-65-autres-charges-gestion-courante",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-65-65100-representation", "65100 Frais de représentation et des réunions"],
        ["cat-charges-65-65101-jetons", "65101 Jetons de présence et autres rémunérations d'administrateurs"],
        ["cat-charges-65-65102-tenue-ca", "65102 Autres frais tenue CA (location salle, rafraîchissement et autres)"]
      ]
    },
    {
      id: "cat-charges-66",
      name: "66 Charges de personnel",
      slug: "charges-exploitation-66-charges-personnel",
      type: "HUMAN_RESOURCES",
      children: [
        ["cat-charges-66-remuneration", "66 Rémunération des personnels"],
        ["cat-charges-66-66110-sociales", "66110 Charges sociales (INSS QPP, INPP, ONEM)"],
        ["cat-charges-66-66111-soins", "66111 Soins médicaux personnel"],
        ["cat-charges-66-66112-autres", "66112 Autres charges de personnel (Coût formation personnel)"]
      ]
    },
    {
      id: "cat-charges-67",
      name: "67 Charges financières",
      slug: "charges-financieres-67",
      type: "ADMINISTRATIVE",
      children: [
        ["cat-charges-67-67100-interets", "67100 Intérêts bancaires et sur opérations de trésorerie"]
      ]
    },
    {
      id: "cat-charges-83",
      name: "83 Charges exceptionnelles",
      slug: "charges-exceptionnelles-83",
      type: "SPECIAL_INSTITUTIONAL",
      ownerApprovalRequired: true,
      children: [
        ["cat-charges-83-83100-operations", "83100 Sur opérations de gestion (pénalités, amandes fiscales et penales)"],
        ["cat-charges-83-83100-autres", "83100 Autres charges exceptionnelles"]
      ]
    },
    {
      id: "cat-investissement-2",
      name: "2 Investissement",
      slug: "investissement-2",
      type: "INFRASTRUCTURE",
      ownerApprovalRequired: true,
      children: [
        ["cat-investissement-2-20100-batiment", "20100 Bâtiment administratif propre"],
        ["cat-investissement-2-20101-mobilier", "20101 Mobilier, matériels informatiques et autres matériels de Classe & bureau"],
        ["cat-investissement-2-20102-telephone", "20102 Téléphone interne"]
      ]
    }
  ];

  return groups.flatMap((group) => {
    const parent: DemoExpenseCategory = {
      id: group.id,
      name: group.name,
      slug: group.slug,
      type: group.type,
      parentCategoryId: null,
      ownerApprovalRequired: Boolean(group.ownerApprovalRequired)
    };
    const children = group.children.map(([id, name]) => ({
      id,
      name,
      slug: `${group.slug}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      type: group.type,
      parentCategoryId: group.id,
      ownerApprovalRequired: Boolean(group.ownerApprovalRequired)
    }));
    return [parent, ...children];
  });
}

function getDemoExpenseCategories() {
  const defaults = buildDefaultExpenseCategories();
  const stored = readJson<DemoExpenseCategory[]>(DEMO_EXPENSE_CATEGORIES_KEY, defaults);
  const storedIds = new Set(stored.map((category) => category.id));
  const categories = [...stored, ...defaults.filter((category) => !storedIds.has(category.id))];
  writeJson(DEMO_EXPENSE_CATEGORIES_KEY, categories);
  return categories;
}

function getDemoExpenseVendors() {
  const vendors = readJson<DemoVendor[]>(DEMO_EXPENSE_VENDORS_KEY, [
    {
      id: "vendor-campus-net",
      name: "Campus Net Services",
      contactName: "Jean Mbuyi",
      phone: "+243 810 001 122",
      email: "contact@campusnet.local",
      address: "Lubumbashi",
      notes: "Internet et communication",
      createdAt: new Date().toISOString()
    },
    {
      id: "vendor-city-power",
      name: "City Power Utility",
      contactName: "Utility Desk",
      phone: "+243 810 889 221",
      email: "service@citypower.local",
      address: "Kasumbalesa",
      notes: "Electricite campus",
      createdAt: new Date().toISOString()
    }
  ]);
  writeJson(DEMO_EXPENSE_VENDORS_KEY, vendors);
  return vendors;
}

function getDemoExpenseBudgets() {
  const budgets = readJson<DemoBudget[]>(DEMO_EXPENSE_BUDGETS_KEY, [
    {
      id: "budget-ops-1",
      name: "Operations campus",
      department: "Administration",
      plannedAmount: 2400,
      consumedAmount: 1280,
      remainingAmount: 1120,
      utilization: 53.33,
      status: "ACTIVE",
      alertThreshold: 80,
      notes: "Budget operationnel general",
      categoryId: "cat-admin",
      category: { id: "cat-admin", name: "Administrative Expenses" },
      period: getDemoCurrentPeriod(),
      createdAt: new Date().toISOString()
    },
    {
      id: "budget-tech-1",
      name: "Transformation numerique",
      department: "Technologie",
      plannedAmount: 1800,
      consumedAmount: 960,
      remainingAmount: 840,
      utilization: 53.33,
      status: "ACTIVE",
      alertThreshold: 75,
      notes: "Licences et equipements",
      categoryId: "cat-tech",
      category: { id: "cat-tech", name: "Technology & IT" },
      period: getDemoCurrentPeriod(),
      createdAt: new Date().toISOString()
    }
  ]);
  writeJson(DEMO_EXPENSE_BUDGETS_KEY, budgets);
  return budgets;
}

function getDemoSalaryProfiles() {
  const profiles = readJson<DemoSalaryProfile[]>(DEMO_SALARY_PROFILES_KEY, [
    {
      id: "salary-001",
      employeeCode: "EMP-001",
      fullName: "Mireille Ilunga",
      department: "Academique",
      position: "Teacher",
      baseSalary: 420,
      currency: "USD",
      frequency: "MONTHLY",
      defaultBonus: 25,
      defaultDeduction: 10,
      advanceBalance: 0,
      debtRecoveryRate: 0,
      notes: "Cycle secondaire",
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "salary-002",
      employeeCode: "EMP-002",
      fullName: "Patrick Nsenga",
      department: "Administration",
      position: "Accountant",
      baseSalary: 360,
      currency: "USD",
      frequency: "MONTHLY",
      defaultBonus: 15,
      defaultDeduction: 5,
      advanceBalance: 0,
      debtRecoveryRate: 0,
      notes: "Controle des operations",
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ]);
  writeJson(DEMO_SALARY_PROFILES_KEY, profiles);
  return profiles;
}

function getDemoPayrollRuns() {
  const runs = readJson<DemoPayrollRun[]>(DEMO_PAYROLL_RUNS_KEY, []);
  writeJson(DEMO_PAYROLL_RUNS_KEY, runs);
  return runs;
}

function getDemoAccountingEntries() {
  const expenseEntries = getDemoExpenseItems()
    .filter((expense) => expense.status === "APPROVED")
    .map((expense) => ({
      id: `ae-expense-${expense.id}`,
      entryType: "EXPENSE",
      direction: "OUTFLOW",
      title: expense.title,
      amount: expense.amount,
      currency: expense.currency,
      entryDate: expense.expenseDate,
      department: expense.department,
      expense: { id: expense.id, title: expense.title, department: expense.department, status: expense.status },
      payrollRun: null,
      payrollItem: null,
      metadata: {
        categoryId: expense.categoryId,
        budgetId: expense.budgetId ?? null
      },
      createdAt: expense.createdAt
    }));

  const payrollEntries = getDemoPayrollRuns().map((run) => ({
    id: `ae-payroll-${run.id}`,
    entryType: "PAYROLL",
    direction: "OUTFLOW",
    title: run.title,
    amount: run.totalNet,
    currency: "USD",
    entryDate: run.processedAt ?? run.createdAt,
    department: run.department || "Human Resources",
    expense: null,
    payrollRun: { id: run.id, title: run.title, department: run.department, status: run.status },
    payrollItem: null,
    metadata: {
      itemCount: run.items.length,
      periodName: run.period.name
    },
    createdAt: run.createdAt
  }));

  return [...expenseEntries, ...payrollEntries].sort((left, right) => String(right.entryDate).localeCompare(String(left.entryDate)));
}

function getDemoCashflowEntries() {
  const expenseEntries = getDemoExpenseItems()
    .filter((expense) => expense.status === "APPROVED")
    .map((expense) => ({
      id: `cf-expense-${expense.id}`,
      direction: "OUTFLOW",
      sourceType: "EXPENSE",
      amount: expense.amount,
      currency: expense.currency,
      method: expense.paymentMethod ?? null,
      referenceDate: expense.expenseDate,
      notes: expense.comments ?? "",
      expense: { id: expense.id, title: expense.title, department: expense.department, status: expense.status },
      payrollRun: null,
      payrollItem: null,
      createdAt: expense.createdAt
    }));

  const payrollEntries = getDemoPayrollRuns().map((run) => ({
    id: `cf-payroll-${run.id}`,
    direction: "OUTFLOW",
    sourceType: "PAYROLL",
    amount: run.totalNet,
    currency: "USD",
    method: null,
    referenceDate: run.processedAt ?? run.createdAt,
    notes: run.notes ?? "",
    expense: null,
    payrollRun: { id: run.id, title: run.title, department: run.department, status: run.status },
    payrollItem: null,
    createdAt: run.createdAt
  }));

  return [...expenseEntries, ...payrollEntries].sort((left, right) => String(right.referenceDate).localeCompare(String(left.referenceDate)));
}

function getDemoExpenseItems() {
  const categories = getDemoExpenseCategories();
  const budgets = getDemoExpenseBudgets();
  const vendors = getDemoExpenseVendors();
  const period = getDemoCurrentPeriod();
  const expenses = readJson<DemoExpenseItem[]>(DEMO_EXPENSE_ITEMS_KEY, [
    {
      id: "expense-001",
      title: "Electricite campus principal",
      department: "Maintenance",
      amount: 340,
      currency: "USD",
      paymentMethod: "BANK_TRANSFER",
      supplierName: "City Power Utility",
      status: "APPROVED",
      categoryId: "cat-infra-electricity",
      budgetId: "budget-ops-1",
      vendorId: "vendor-city-power",
      financialPeriodLabel: period.name,
      expenseDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      requiresOwnerApproval: false,
      comments: "Consommation mensuelle campus principal",
      createdAt: new Date().toISOString(),
      category: { id: "cat-infra-electricity", name: "Electricity", type: "INFRASTRUCTURE", parentCategoryId: "cat-infra" },
      vendor: vendors.find((item) => item.id === "vendor-city-power") || null,
      budget: budgets.find((item) => item.id === "budget-ops-1") || null,
      period,
      attachments: [],
      approvalSteps: [
        { stage: 1, role: "FINANCIAL_OFFICER", status: "APPROVED", decidedAt: new Date().toISOString() },
        { stage: 2, role: "ADMINISTRATION", status: "APPROVED", decidedAt: new Date().toISOString() }
      ]
    },
    {
      id: "expense-002",
      title: "Renouvellement licence ERP",
      department: "Technologie",
      amount: 420,
      currency: "USD",
      paymentMethod: "BANK_TRANSFER",
      supplierName: "Campus Net Services",
      status: "PENDING",
      categoryId: "cat-tech-licenses",
      budgetId: "budget-tech-1",
      vendorId: "vendor-campus-net",
      financialPeriodLabel: period.name,
      expenseDate: new Date().toISOString(),
      requiresOwnerApproval: false,
      comments: "Renouvellement annuel",
      createdAt: new Date().toISOString(),
      category: { id: "cat-tech-licenses", name: "Licenses", type: "TECHNOLOGY", parentCategoryId: "cat-tech" },
      vendor: vendors.find((item) => item.id === "vendor-campus-net") || null,
      budget: budgets.find((item) => item.id === "budget-tech-1") || null,
      period,
      attachments: [],
      approvalSteps: [
        { stage: 1, role: "FINANCIAL_OFFICER", status: "PENDING" },
        { stage: 2, role: "ADMINISTRATION", status: "PENDING" }
      ]
    }
  ]);
  writeJson(DEMO_EXPENSE_ITEMS_KEY, expenses);
  return expenses;
}

function saveDemoExpenseVendors(vendors: DemoVendor[]) {
  writeJson(DEMO_EXPENSE_VENDORS_KEY, vendors);
}

function saveDemoExpenseBudgets(budgets: DemoBudget[]) {
  writeJson(DEMO_EXPENSE_BUDGETS_KEY, budgets);
}

function saveDemoSalaryProfiles(profiles: DemoSalaryProfile[]) {
  writeJson(DEMO_SALARY_PROFILES_KEY, profiles);
}

function saveDemoPayrollRuns(runs: DemoPayrollRun[]) {
  writeJson(DEMO_PAYROLL_RUNS_KEY, runs);
}

function saveDemoExpenseItems(expenses: DemoExpenseItem[]) {
  writeJson(DEMO_EXPENSE_ITEMS_KEY, expenses);
}

function updateBudgetConsumptionForDemo(expense: DemoExpenseItem) {
  if (!expense.budgetId || expense.status !== "APPROVED") return;
  const budgets = getDemoExpenseBudgets().map((budget) => {
    if (budget.id !== expense.budgetId) return budget;
    const consumedAmount = roundAmount(budget.consumedAmount + expense.amount);
    const utilization = budget.plannedAmount > 0 ? roundAmount((consumedAmount / budget.plannedAmount) * 100) : 0;
    return {
      ...budget,
      consumedAmount,
      remainingAmount: roundAmount(Math.max(budget.plannedAmount - consumedAmount, 0)),
      utilization,
      status: consumedAmount > budget.plannedAmount ? "EXCEEDED" : budget.status
    };
  });
  saveDemoExpenseBudgets(budgets);
}

function financeProfile(parentId?: string | null) {
  getDemoFinanceOverrides();
  const parents = getDemoParents();
  const parent = parentId
    ? parents.find((entry) => entry.id === parentId)
    : parents[0];
  if (!parent) {
    throw new Error("Profil parent financier introuvable.");
  }
  return buildDemoParentFinanceProfile(parent.id, parents, getDemoPayments());
}

function financeReductions() {
  getDemoFinanceOverrides();
  return buildDemoReductionAnalytics(getDemoParents(), getDemoPayments());
}

function parentMe() {
  const parents = getDemoParents();
  const parentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);
  const fullName = localStorage.getItem(NAME_STORAGE_KEY);
  const parent = parents.find((item) => item.id === parentId)
    ?? parents.find((item) => item.fullName === fullName)
    ?? parents[0];
  const payments = getDemoPayments().filter((payment) => payment.parentId === parent.id || payment.parentFullName === parent.fullName);
  return {
    id: parent.id,
    fullName: parent.fullName,
    phone: parent.phone,
    email: parent.email,
    photoUrl: parent.photoUrl || "",
    students: parent.students.map((student) => ({ ...student, payments }))
  };
}

async function demoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init);

  await new Promise((resolve) => setTimeout(resolve, 80));

  if (normalizedPath === "/api/auth/login" && method === "POST") {
    const email = String(body.email ?? "").toLowerCase();
    const password = String(body.password ?? "");
    if (email === "parent@school.com" && password === "password123") {
      const parent = getDemoParents().find((item) => item.id === "PAR-KCS-RACHEL-KABONGO");
      return { token: "demo-parent-token", role: "PARENT", fullName: "Rachel Kabongo", parentId: "PAR-KCS-RACHEL-KABONGO", photoUrl: parent?.photoUrl || "" } as T;
    }

    const credential = getDemoParentCredentials().find((item) => item.email === email && item.password === password);
    if (credential) {
      const parent = getDemoParents().find((item) => item.id === credential.parentId);
      if (parent) {
        return {
          token: `demo-parent-token-${parent.id}`,
          role: "PARENT",
          fullName: parent.fullName,
          parentId: parent.id,
          photoUrl: parent.photoUrl || ""
        } as T;
      }
    }

    if (email === "admin@school.com" && password === "password123") {
      return { token: "local-admin-token", role: "ADMIN", fullName: "Administrateur" } as T;
    }

    throw new Error("Identifiants invalides.");
  }

  if (normalizedPath === "/api/auth/forgot-password") return { message: "OK" } as T;
  if (normalizedPath === "/api/auth/change-password") return { message: "OK" } as T;
  if (normalizedPath === "/api/auth/recover-admin-password" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const recoveryCode = String(body.recoveryCode ?? "");
    const newPassword = String(body.newPassword ?? "");
    const configuredCode = String(import.meta.env.VITE_ADMIN_RECOVERY_CODE ?? "");
    if (!configuredCode || configuredCode.startsWith("CHANGE_ME")) {
      throw new Error("La recuperation administrateur n'est pas configuree.");
    }
    if (recoveryCode !== configuredCode || email !== "admin@school.com" || newPassword.length < 10) {
      throw new Error("Informations de recuperation invalides.");
    }
    return { message: "Mot de passe administrateur reinitialise en mode local." } as T;
  }
  if (normalizedPath === "/api/parents/me/photo" && method === "PUT") {
    const parentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);
    const photoUrl = String(body.photoUrl ?? "");
    const parents = getDemoParents().map((parent) => parent.id === parentId ? { ...parent, photoUrl } : parent);
    writeJson(DEMO_PARENTS_KEY, parents);
    return { photoUrl } as T;
  }
  if (normalizedPath === "/api/ai/assistant") {
    const query = String(body.query ?? "").toLowerCase();
    const hasDebtQuestion = query.includes("impay") || query.includes("non pay") || query.includes("unpaid");
    return {
      answer: hasDebtQuestion
        ? "Mode local actif : les donnees disponibles indiquent de prioriser les familles avec le plus grand solde restant et de relancer les paiements en attente."
        : "Mode local actif : le diagnostic utilise les donnees stockees dans ce navigateur pendant que l'API distante est indisponible.",
      suggestions: hasDebtQuestion
        ? ["Voir les parents en retard", "Verifier les paiements en attente", "Preparer un echeancier"]
        : ["Analyser le tableau de bord", "Controler les paiements recents", "Generer un rapport"]
    } as T;
  }
  if (normalizedPath === "/api/classes") return demoClasses as T;
  if (normalizedPath === "/api/parents/me") return parentMe() as T;
  if (normalizedPath === "/api/analytics/overview") return overview() as T;
  if (normalizedPath === "/api/finance/catalog") return financeCatalog() as T;
  if (normalizedPath === "/api/finance/overview") return financeOverview() as T;
  if (normalizedPath === "/api/expenses/overview") return expenseOverview() as T;
  if (normalizedPath === "/api/finance/me/profile") {
    const parentId = localStorage.getItem(PARENT_ID_STORAGE_KEY);
    return financeProfile(parentId) as T;
  }
  if (normalizedPath === "/api/finance/reductions") return financeReductions() as T;
  if (normalizedPath === "/api/analytics/overdue-parents") return { overdueParents: 1 } as T;
  if (normalizedPath === "/api/analytics/payment-anomalies") return { anomalies: 0 } as T;
  if (normalizedPath === "/api/analytics/system-health") return { dbOk: true, lastBackup: new Date().toLocaleDateString("fr-FR") } as T;
  if (normalizedPath === "/api/analytics/forecast") return { nextMonthRevenue: overview().monthlyRevenue, risk: 0.18 } as T;
  if (normalizedPath === "/api/expenses/categories" && method === "GET") return getDemoExpenseCategories() as T;
  if (normalizedPath === "/api/expenses/accounting-entries" && method === "GET") return getDemoAccountingEntries() as T;
  if (normalizedPath === "/api/expenses/cashflow-entries" && method === "GET") return getDemoCashflowEntries() as T;
  if (normalizedPath === "/api/expenses/vendors" && method === "GET") return getDemoExpenseVendors() as T;
  if (normalizedPath === "/api/expenses/vendors" && method === "POST") {
    const vendor: DemoVendor = {
      id: `vendor-${Date.now()}`,
      name: String(body.name ?? "Vendor"),
      contactName: String(body.contactName ?? ""),
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
      address: String(body.address ?? ""),
      notes: String(body.notes ?? ""),
      createdAt: new Date().toISOString()
    };
    saveDemoExpenseVendors([vendor, ...getDemoExpenseVendors()]);
    return vendor as T;
  }
  if (normalizedPath === "/api/expenses/budgets" && method === "GET") return getDemoExpenseBudgets() as T;
  if (normalizedPath === "/api/expenses/budgets" && method === "POST") {
    const categories = getDemoExpenseCategories();
    const categoryId = String(body.categoryId ?? "");
    const category = categories.find((item) => item.id === categoryId) || null;
    const period = getDemoCurrentPeriod();
    const plannedAmount = roundAmount(Number(body.plannedAmount ?? 0));
    const budget: DemoBudget = {
      id: `budget-${Date.now()}`,
      name: String(body.name ?? "Budget"),
      department: String(body.department ?? "Administration"),
      plannedAmount,
      consumedAmount: 0,
      remainingAmount: plannedAmount,
      utilization: 0,
      status: "ACTIVE",
      alertThreshold: Number(body.alertThreshold ?? 80),
      notes: String(body.notes ?? ""),
      categoryId: category?.id,
      category: category ? { id: category.id, name: category.name } : null,
      period,
      createdAt: new Date().toISOString()
    };
    saveDemoExpenseBudgets([budget, ...getDemoExpenseBudgets()]);
    return budget as T;
  }
  if (normalizedPath === "/api/expenses" && method === "GET") return getDemoExpenseItems() as T;
  if (normalizedPath === "/api/expenses" && method === "POST") {
    const categories = getDemoExpenseCategories();
    const vendors = getDemoExpenseVendors();
    const budgets = getDemoExpenseBudgets();
    const period = getDemoCurrentPeriod();
    const category = categories.find((item) => item.id === String(body.categoryId ?? ""));
    if (!category) throw new Error("Categorie de depense introuvable.");
    const amount = roundAmount(Number(body.amount ?? 0));
    const requiresOwnerApproval = Boolean(category.ownerApprovalRequired) || amount >= 5000 || category.type === "SPECIAL_INSTITUTIONAL";
    const approvalSteps: DemoExpenseApprovalStep[] = [
      { stage: 1, role: "FINANCIAL_OFFICER", status: "PENDING" },
      { stage: 2, role: "ADMINISTRATION", status: "PENDING" }
    ];
    if (requiresOwnerApproval) approvalSteps.push({ stage: 3, role: "OWNER", status: "PENDING" });
    const expense: DemoExpenseItem = {
      id: `expense-${Date.now()}`,
      title: String(body.title ?? "Depense"),
      subcategory: String(body.subcategory ?? ""),
      description: String(body.description ?? ""),
      department: String(body.department ?? "Administration"),
      amount,
      currency: String(body.currency ?? "USD"),
      paymentMethod: String(body.paymentMethod ?? "CASH"),
      supplierName: String(body.supplierName ?? ""),
      status: "PENDING",
      categoryId: category.id,
      budgetId: String(body.budgetId ?? "") || undefined,
      vendorId: String(body.vendorId ?? "") || undefined,
      financialPeriodLabel: String(body.financialPeriodLabel ?? period.name),
      expenseDate: String(body.expenseDate ?? new Date().toISOString()),
      requiresOwnerApproval,
      comments: String(body.comments ?? ""),
      createdAt: new Date().toISOString(),
      category: { id: category.id, name: category.name, type: category.type, parentCategoryId: category.parentCategoryId },
      vendor: vendors.find((item) => item.id === String(body.vendorId ?? "")) || null,
      budget: budgets.find((item) => item.id === String(body.budgetId ?? "")) || null,
      period,
      attachments: Array.isArray(body.attachments)
        ? body.attachments.map((attachment, index) => ({
            id: `attachment-${Date.now()}-${index}`,
            kind: String((attachment as Record<string, unknown>).kind ?? "EXPENSE_SUPPORT"),
            fileName: String((attachment as Record<string, unknown>).fileName ?? "Document"),
            fileUrl: String((attachment as Record<string, unknown>).fileUrl ?? ""),
            mimeType: String((attachment as Record<string, unknown>).mimeType ?? ""),
            notes: String((attachment as Record<string, unknown>).notes ?? "")
          }))
        : [],
      approvalSteps
    };
    saveDemoExpenseItems([expense, ...getDemoExpenseItems()]);
    return expense as T;
  }
  if (normalizedPath === "/api/expenses/payroll/profiles" && method === "GET") return getDemoSalaryProfiles() as T;
  if (normalizedPath === "/api/expenses/payroll/profiles" && method === "POST") {
    const profile: DemoSalaryProfile = {
      id: `salary-${Date.now()}`,
      employeeCode: String(body.employeeCode ?? `EMP-${Date.now()}`),
      fullName: String(body.fullName ?? "Employe"),
      department: String(body.department ?? "Administration"),
      position: String(body.position ?? "Staff"),
      baseSalary: roundAmount(Number(body.baseSalary ?? 0)),
      currency: String(body.currency ?? "USD"),
      frequency: String(body.frequency ?? "MONTHLY"),
      defaultBonus: roundAmount(Number(body.defaultBonus ?? 0)),
      defaultDeduction: roundAmount(Number(body.defaultDeduction ?? 0)),
      advanceBalance: roundAmount(Number(body.advanceBalance ?? 0)),
      debtRecoveryRate: roundAmount(Number(body.debtRecoveryRate ?? 0)),
      notes: String(body.notes ?? ""),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    saveDemoSalaryProfiles([profile, ...getDemoSalaryProfiles()]);
    return profile as T;
  }
  if (normalizedPath === "/api/expenses/payroll/runs" && method === "GET") return getDemoPayrollRuns() as T;
  if (normalizedPath === "/api/expenses/payroll/runs" && method === "POST") {
    const profiles = getDemoSalaryProfiles().filter((profile) =>
      profile.isActive && (!body.department || profile.department === String(body.department))
    );
    if (!profiles.length) throw new Error("Aucun profil salarial actif pour ce run.");
    const period = getDemoCurrentPeriod();
    const items = profiles.map((profile, index) => {
      const bonuses = roundAmount(profile.defaultBonus || 0);
      const deductions = roundAmount(profile.defaultDeduction || 0);
      const debtRecovered = roundAmount((profile.baseSalary * profile.debtRecoveryRate) / 100);
      const netSalary = roundAmount(profile.baseSalary + bonuses - deductions - debtRecovered);
      return {
        id: `payroll-item-${Date.now()}-${index}`,
        baseSalary: profile.baseSalary,
        bonuses,
        deductions,
        advancesRecovered: 0,
        debtRecovered,
        netSalary,
        salarySlipNumber: `SLIP-${Date.now()}-${index + 1}`,
        salaryProfile: profile
      };
    });
    const run: DemoPayrollRun = {
      id: `payroll-run-${Date.now()}`,
      title: String(body.title ?? "Run de paie"),
      department: String(body.department ?? ""),
      frequency: String(body.frequency ?? "MONTHLY"),
      status: "PROCESSED",
      totalGross: roundAmount(items.reduce((sum, item) => sum + item.baseSalary, 0)),
      totalBonuses: roundAmount(items.reduce((sum, item) => sum + item.bonuses, 0)),
      totalDeductions: roundAmount(items.reduce((sum, item) => sum + item.deductions + item.debtRecovered + item.advancesRecovered, 0)),
      totalNet: roundAmount(items.reduce((sum, item) => sum + item.netSalary, 0)),
      notes: String(body.notes ?? ""),
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      period,
      items
    };
    saveDemoPayrollRuns([run, ...getDemoPayrollRuns()]);
    return run as T;
  }

  if (normalizedPath === "/api/finance/tuition-engine/preview-allocation" && method === "POST") {
    const parentId = String(body.parentId ?? "");
    const parent = getDemoParents().find((item) => item.id === parentId);
    const amount = roundAmount(Number(body.amount ?? 0));
    const paymentOptionType = String(body.paymentOptionType ?? "STANDARD_MONTHLY") as DemoPaymentOptionType;
    const allocationMode = String(body.allocationMode ?? "AUTO") === "MANUAL" ? "MANUAL" : "AUTO";
    const manualAllocations = Array.isArray(body.manualAllocations)
      ? (body.manualAllocations as Array<Record<string, unknown>>).map((row) => ({
          installmentId: String(row.installmentId ?? ""),
          amount: roundAmount(Number(row.amount ?? 0))
        }))
      : [];
    const familyRate = (parent?.students.length ?? 0) >= 2 ? 10 : 0;
    const planRate = paymentOptionType === "FULL_PRESEPTEMBER" ? 10 : paymentOptionType === "TWO_INSTALLMENTS" ? 5 : paymentOptionType === "THREE_INSTALLMENTS" ? 2 : 0;
    const calculations = (parent?.students ?? []).map((student) => {
      const baseAnnualTuition = getDemoBaseAnnualTuition(student.className, student.annualFee);
      const familyDiscountAmount = roundAmount(baseAnnualTuition * familyRate / 100);
      const familyAdjustedTuition = roundAmount(baseAnnualTuition - familyDiscountAmount);
      const planDiscountAmount = roundAmount(familyAdjustedTuition * planRate / 100);
      const finalTuition = roundAmount(familyAdjustedTuition - planDiscountAmount);
      const schedule = buildDemoTuitionSchedule(paymentOptionType, finalTuition);
      return {
        studentId: student.id,
        studentName: student.fullName,
        gradeGroup: student.className,
        paymentOptionType,
        baseAnnualTuition,
        familyDiscountRate: familyRate,
        familyDiscountAmount,
        familyAdjustedTuition,
        planDiscountRate: planRate,
        planDiscountAmount,
        finalTuition,
        monthlyAmount: paymentOptionType === "STANDARD_MONTHLY" ? roundAmount(finalTuition / 10) : null,
        schedule
      };
    });
    const candidates = calculations.flatMap((row) => row.schedule.map((installment) => ({
      installmentId: `demo-installment-${row.studentId}-${installment.sequence}`,
      studentId: row.studentId,
      studentName: row.studentName,
      label: installment.label,
      dueDate: installment.dueDate,
      dueBucket: getDemoDueBucket(installment.dueDate),
      amountDue: installment.amountDue,
      alreadyPaid: 0,
      outstandingBefore: installment.amountDue
    }))).filter((line) => line.outstandingBefore > 0);

    const allocatedByInstallment = new Map<string, number>();
    if (allocationMode === "MANUAL") {
      for (const manual of manualAllocations) {
        const candidate = candidates.find((line) => line.installmentId === manual.installmentId);
        if (candidate) allocatedByInstallment.set(manual.installmentId, roundAmount(Math.min(manual.amount, candidate.outstandingBefore)));
      }
    } else {
      let remaining = amount;
      for (const bucket of ["OVERDUE", "CURRENT", "FUTURE"] as const) {
        const bucketRows = candidates
          .filter((line) => line.dueBucket === bucket)
          .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime());
        const dueDates = Array.from(new Set(bucketRows.map((line) => line.dueDate)));
        for (const dueDate of dueDates) {
          if (remaining <= 0) break;
          const group = bucketRows.filter((line) => line.dueDate === dueDate);
          const groupOutstanding = roundAmount(group.reduce((sum, line) => sum + line.outstandingBefore, 0));
          if (remaining >= groupOutstanding) {
            for (const line of group) allocatedByInstallment.set(line.installmentId, line.outstandingBefore);
            remaining = roundAmount(remaining - groupOutstanding);
          } else {
            let distributed = 0;
            group.forEach((line, index) => {
              const allocated = index === group.length - 1
                ? roundAmount(remaining - distributed)
                : roundAmount((remaining * line.outstandingBefore) / groupOutstanding);
              distributed = roundAmount(distributed + allocated);
              allocatedByInstallment.set(line.installmentId, roundAmount(Math.min(allocated, line.outstandingBefore)));
            });
            remaining = 0;
          }
        }
        if (remaining <= 0) break;
      }
    }

    const lines: DemoTuitionAllocationLine[] = candidates.map((line) => {
      const allocated = roundAmount(allocatedByInstallment.get(line.installmentId) ?? 0);
      return {
        ...line,
        allocated,
        outstandingAfter: roundAmount(Math.max(line.outstandingBefore - allocated, 0))
      };
    });
    const allocatedTotal = roundAmount(lines.reduce((sum, line) => sum + line.allocated, 0));
    const advanceBalance = roundAmount(Math.max(amount - allocatedTotal, 0));
    const missingAmount = roundAmount(lines.reduce((sum, line) => sum + line.outstandingAfter, 0));
    const manualTotal = roundAmount(manualAllocations.reduce((sum, row) => sum + row.amount, 0));
    return {
      parent: { id: parentId, fullName: parent?.fullName ?? "Parent" },
      calculations,
      allocationPreview: {
        totalReceived: amount,
        allocatedTotal,
        advanceBalance,
        missingAmount,
        message: buildDemoAllocationMessage({ amount, lines, advanceBalance }),
        warnings: [
          allocationMode === "MANUAL" && manualTotal !== amount ? "Manual allocation total must equal the payment amount before saving." : "",
          ...lines.filter((line) => line.allocated > 0 && line.outstandingAfter > 0).map((line) => `${line.studentName} remains underpaid for ${line.label}.`),
          ...lines.filter((line) => line.dueBucket !== "FUTURE" && line.allocated === 0 && line.outstandingBefore > 0).map((line) => `${line.studentName} has an unpaid scheduled obligation: ${line.label}.`)
        ].filter(Boolean),
        lines
      }
    } as T;
  }

  if (normalizedPath === "/api/finance/tuition-engine/payments" && method === "POST") {
    const preview = await demoApi<Record<string, unknown>>("/api/finance/tuition-engine/preview-allocation", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const payment = {
      id: `pay-${Date.now()}`,
      transactionNumber: String(body.transactionNumber ?? `TXN-${Date.now()}`),
      parentId: String(body.parentId ?? ""),
      parentFullName: String((preview as any).parent?.fullName ?? "Parent"),
      paymentSubjectName: Array.isArray((preview as any).calculations) ? (preview as any).calculations.map((row: any) => String(row.studentName ?? "")).filter(Boolean).join(" / ") : "Tuition",
      studentNames: Array.isArray((preview as any).calculations) ? (preview as any).calculations.map((row: any) => String(row.studentName ?? "")).filter(Boolean) : [],
      reason: "Tuition payment",
      amount: Number(body.amount ?? 0),
      status: String(body.status ?? "COMPLETED"),
      method: String(body.method ?? "CASH"),
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleString("fr-FR"),
      tuitionAllocationSummary: buildDemoTuitionAllocationSummary(String(body.allocationMode ?? "AUTO") === "MANUAL" ? "MANUAL" : "AUTO", preview as any)
    };
    writeJson(DEMO_PAYMENTS_KEY, [payment, ...getDemoPayments()]);
    return { ...preview, payment, receipt: { receiptNumber: `REC-${payment.transactionNumber}` } } as T;
  }

  const financeParentProfileMatch = normalizedPath.match(/^\/api\/finance\/parents\/([^/]+)\/profile$/);
  if (financeParentProfileMatch && method === "GET") {
    return financeProfile(financeParentProfileMatch[1]) as T;
  }

  const expenseApprovalMatch = normalizedPath.match(/^\/api\/expenses\/([^/]+)\/approval$/);
  if (expenseApprovalMatch && method === "POST") {
    const expenseId = expenseApprovalMatch[1];
    const nextStatus = String(body.status ?? "APPROVED");
    const expenses = getDemoExpenseItems();
    const updatedExpenses = expenses.map((expense) => {
      if (expense.id !== expenseId) return expense;
      const currentStep = expense.approvalSteps.find((step) => step.status === "PENDING");
      if (!currentStep) return expense;
      const approvalSteps = expense.approvalSteps.map((step) => step.stage === currentStep.stage
        ? { ...step, status: nextStatus, comments: String(body.comments ?? ""), decidedAt: new Date().toISOString() }
        : step);
      if (nextStatus === "REJECTED") {
        return { ...expense, status: "REJECTED", approvalSteps };
      }
      const hasRemaining = approvalSteps.some((step) => step.status === "PENDING");
      const approvedExpense = { ...expense, status: hasRemaining ? "PENDING" : "APPROVED", approvalSteps };
      if (!hasRemaining) updateBudgetConsumptionForDemo(approvedExpense);
      return approvedExpense;
    });
    saveDemoExpenseItems(updatedExpenses);
    return updatedExpenses.find((expense) => expense.id === expenseId) as T;
  }
  if (normalizedPath === "/api/finance/assignments" && method === "POST") {
    const overrides = getDemoFinanceOverrides();
    const parentId = String(body.parentId ?? "");
    const studentId = String(body.studentId ?? "");
    const paymentOptionType = String(body.paymentOptionType ?? "STANDARD_MONTHLY") as DemoPaymentOptionType;
    const parents = getDemoParents();
    const targetStudents = studentId
      ? [studentId]
      : (parents.find((parent) => parent.id === parentId)?.students ?? []).map((student) => student.id);

    for (const targetStudentId of targetStudents) {
      overrides[targetStudentId] = { mode: "OFFICIAL", paymentOptionType };
    }
    saveDemoFinanceOverrides(overrides);

    return {
      academicYear: financeCatalog().academicYear,
      assignment: {
        id: `demo-assignment-${Date.now()}`,
        parentId,
        studentId: studentId || null,
        paymentOptionType,
        notes: String(body.notes ?? "")
      }
    } as T;
  }
  if (normalizedPath === "/api/finance/agreements" && method === "POST") {
    const overrides = getDemoFinanceOverrides();
    const parentId = String(body.parentId ?? "");
    const studentId = String(body.studentId ?? "");
    const parents = getDemoParents();
    const targetStudents = studentId
      ? [studentId]
      : (parents.find((parent) => parent.id === parentId)?.students ?? []).map((student) => student.id);
    const agreement = {
      title: String(body.title ?? "Custom owner agreement"),
      customTotal: Number(body.customTotal ?? 0),
      reductionAmount: Number(body.reductionAmount ?? 0),
      status: String(body.status ?? "PENDING_APPROVAL"),
      privateNotes: String(body.privateNotes ?? ""),
      notes: String(body.notes ?? ""),
      installments: Array.isArray(body.installments)
        ? body.installments.map((row) => ({
            label: String((row as Record<string, unknown>).label ?? "Installment"),
            dueDate: String((row as Record<string, unknown>).dueDate ?? new Date().toISOString()),
            amountDue: Number((row as Record<string, unknown>).amountDue ?? 0),
            notes: String((row as Record<string, unknown>).notes ?? "")
          }))
        : []
    };

    for (const targetStudentId of targetStudents) {
      overrides[targetStudentId] = { mode: "AGREEMENT", agreement };
    }
    saveDemoFinanceOverrides(overrides);

    return {
      academicYear: financeCatalog().academicYear,
      agreementId: `demo-agreement-${Date.now()}`,
      status: agreement.status,
      profileId: `demo-profile-${parentId}`
    } as T;
  }

  if (normalizedPath === "/api/payments/settings/notifications") {
    if (method === "PUT") localStorage.setItem(DEMO_NOTIFICATIONS_KEY, String(Boolean(body.paymentNotificationsEnabled)));
    return { paymentNotificationsEnabled: localStorage.getItem(DEMO_NOTIFICATIONS_KEY) !== "false" } as T;
  }

  const paymentVerifyMatch = normalizedPath.match(/^\/api\/payments\/verify\/([^/]+)$/);
  if (paymentVerifyMatch && method === "GET") {
    const tx = decodeURIComponent(paymentVerifyMatch[1]);
    const payment = getDemoPayments().find((item) => item.transactionNumber === tx);
    if (!payment) throw new Error("Paiement introuvable");
    return {
      source: "database",
      payment: {
        id: payment.id,
        transactionNumber: payment.transactionNumber,
        parentFullName: payment.parentFullName,
        paymentSubjectName: payment.paymentSubjectName || payment.studentNames?.join(" / ") || payment.parentFullName,
        studentNames: payment.studentNames ?? [],
        reason: payment.reason,
        amount: payment.amount,
        amountInWords: "",
        method: payment.method,
        status: payment.status,
        date: payment.date,
        createdAt: payment.createdAt,
        schoolName: "Kinshasa Christian School",
        receiptNumber: `REC-${payment.transactionNumber}`,
        tuitionAllocationSummary: payment.tuitionAllocationSummary ?? null,
        downloads: null
      }
    } as T;
  }

  if (normalizedPath === "/api/payments" && method === "GET") return getDemoPayments() as T;
  if (normalizedPath === "/api/payments" && method === "POST") {
    const parentId = String(body.parentId ?? "");
    const parent = parentId
      ? getDemoParents().find((item) => item.id === parentId)
      : getDemoParents().find((item) => item.fullName === String(body.parentFullName ?? ""));
    const studentIds = Array.isArray(body.studentIds) ? (body.studentIds as string[]) : [];
    const studentNames = parent
      ? parent.students.filter((student) => studentIds.includes(student.id)).map((student) => student.fullName)
      : [];
    const payment: DemoPayment = {
      id: `pay-${Date.now()}`,
      transactionNumber: `TXN-${Date.now()}`,
      parentId: parent?.id || parentId || undefined,
      parentFullName: parent?.fullName || String(body.parentFullName ?? "Parent"),
      paymentSubjectName: String(body.studentDisplayName ?? "").trim() || studentNames.join(" / ") || parent?.fullName || String(body.parentFullName ?? "Parent"),
      studentNames,
      reason: String(body.reason ?? "Paiement"),
      method: String(body.method ?? "CASH"),
      amount: Number(body.amount ?? 0),
      status: String(body.status ?? "COMPLETED"),
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleString("fr-FR")
    };
    writeJson(DEMO_PAYMENTS_KEY, [payment, ...getDemoPayments()]);
    return { payment, receipt: { id: `receipt-${Date.now()}` }, notificationStatus: { email: "SIMULATED", sms: "SIMULATED" } } as T;
  }

  if (normalizedPath === "/api/shared-directory" && method === "GET") {
    const parents = getDemoParents();
    const students = parents.flatMap((parent) =>
      parent.students.map((student) => ({
        id: student.id,
        displayId: student.id,
        studentNumber: student.id,
        externalStudentId: student.id,
        fullName: student.fullName,
        classId: student.classId,
        className: student.className,
        parentId: parent.id,
        annualFee: student.annualFee,
      }))
    );

    return {
      source: "demo",
      visibility: "shared-directory",
      counts: {
        families: parents.length,
        parents: parents.length,
        students: students.length,
        teachers: 0,
      },
      families: parents.map((parent) => ({
        id: parent.id,
        displayId: parent.id,
        familyLabel: `${parent.fullName} Family`,
        parentIds: [parent.id],
        studentIds: parent.students.map((student) => student.id),
        organizationId: "demo-school",
        externalIds: [],
      })),
      parents: parents.map((parent) => ({
        id: parent.id,
        displayId: parent.id,
        fullName: parent.fullName,
        phone: parent.phone,
        email: parent.email,
        students: parent.students.map((student) => ({
          id: student.id,
          displayId: student.id,
          studentNumber: student.id,
          externalStudentId: student.id,
          fullName: student.fullName,
          classId: student.classId,
          className: student.className,
          parentId: parent.id,
          annualFee: student.annualFee,
        })),
      })),
      students,
      teachers: [],
    } as T;
  }

  if (normalizedPath === "/api/parents" && method === "GET") return getDemoParents() as T;
  if (normalizedPath === "/api/parents" && method === "POST") {
    const existingParents = getDemoParents();
    const overrides = getDemoFinanceOverrides();
    const parentFullName = String(body.fullName ?? `${body.nom ?? ""} ${body.prenom ?? ""}`).trim() || "Nouveau parent";
    const id = buildUniqueDemoEntityId("PAR", parentFullName, existingParents.map((parent) => parent.id));
    const existingStudentIds = existingParents.flatMap((parent) => parent.students.map((student) => student.id));
    const parent: DemoParent = {
      id,
      nom: String(body.nom ?? ""),
      postnom: String(body.postnom ?? ""),
      prenom: String(body.prenom ?? ""),
      fullName: parentFullName,
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
      photoUrl: String(body.photoUrl ?? ""),
      createdAt: new Date().toISOString(),
      students: Array.isArray(body.students)
        ? (body.students as Array<DemoStudent & { paymentOptionType?: DemoPaymentOptionType }>).map((student) => ({
            ...student,
            id: buildUniqueDemoEntityId("STU", student.fullName || "Student", existingStudentIds),
            paymentOptionType: student.paymentOptionType ?? "STANDARD_MONTHLY"
          }))
        : []
    };
    const notifyEmail = body.notifyEmail !== false;
    const notifySms = body.notifySms !== false;
    const temporaryPassword = `KCS-${String(Date.now()).slice(-4)}`;
    if (parent.email) {
      saveDemoParentCredential({ parentId: parent.id, email: parent.email, password: temporaryPassword });
    }
    for (const student of parent.students as Array<DemoStudent & { paymentOptionType?: DemoPaymentOptionType }>) {
      if (student.paymentOptionType === "SPECIAL_OWNER_AGREEMENT") {
        overrides[student.id] = {
          mode: "AGREEMENT",
          agreement: {
            title: `Accord special proprietaire - ${student.fullName}`,
            customTotal: Number(student.annualFee ?? 0),
            reductionAmount: 0,
            status: "APPROVED",
            privateNotes: "",
            notes: "Created during parent onboarding",
            installments: buildOwnerAgreementInstallments(Number(student.annualFee ?? 0))
          }
        };
      } else {
        overrides[student.id] = {
          mode: "OFFICIAL",
          paymentOptionType: student.paymentOptionType ?? "STANDARD_MONTHLY"
        };
      }
    }
    saveDemoFinanceOverrides(overrides);
    writeJson(DEMO_PARENTS_KEY, [parent, ...existingParents]);
    return {
      ...parent,
      temporaryPassword,
      notificationStatus: {
        email: notifyEmail && parent.email ? "SIMULATED" : "SKIPPED",
        sms: notifySms && parent.phone ? "SIMULATED" : "SKIPPED"
      }
    } as T;
  }

  const parentMatch = normalizedPath.match(/^\/api\/parents\/([^/]+)$/);
  if (parentMatch && method === "PUT") {
    const parents = getDemoParents().map((parent) => parent.id === parentMatch[1] ? { ...parent, ...body } as DemoParent : parent);
    writeJson(DEMO_PARENTS_KEY, parents);
    return parents.find((parent) => parent.id === parentMatch[1]) as T;
  }
  if (parentMatch && method === "DELETE") {
    writeJson(DEMO_PARENTS_KEY, getDemoParents().filter((parent) => parent.id !== parentMatch[1]));
    return undefined as T;
  }

  const resetMatch = normalizedPath.match(/^\/api\/parents\/([^/]+)\/reset-password$/);
  if (resetMatch) {
    const parent = getDemoParents().find((item) => item.id === resetMatch[1]);
    const temporaryPassword = `KCS-${String(Date.now()).slice(-4)}`;
    const notifyEmail = body.notifyEmail !== false;
    const notifySms = body.notifySms !== false;
    if (parent?.email) {
      saveDemoParentCredential({ parentId: resetMatch[1], email: parent.email, password: temporaryPassword });
    }
    return {
      parentId: resetMatch[1],
      email: parent?.email ?? "parent@school.com",
      temporaryPassword,
      notificationStatus: {
        email: notifyEmail && parent?.email ? "SIMULATED" : "SKIPPED",
        sms: notifySms && parent?.phone ? "SIMULATED" : "SKIPPED"
      }
    } as T;
  }

  throw new Error("Endpoint demo non disponible.");
}

function shouldUseDemoApi(path: string) {
  if (!path.startsWith("/api/")) return false;
  if (PRODUCTION_MODE) return false;
  return (DEMO_FALLBACK_ENABLED || STATIC_APP_FALLBACK_ENABLED || PLACEHOLDER_API_URL || !API_BASE_URL);
}

function isLocalSessionToken(token: string | null) {
  return Boolean(token && (token.startsWith("local-") || token.startsWith("demo-")));
}

function canFallbackToDemo(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!path.startsWith("/api/")) return false;
  return method === "GET" ||
    path === "/api/auth/login" ||
    path === "/api/auth/change-password" ||
    path === "/api/ai/assistant" ||
    path.startsWith("/api/finance") ||
    path.startsWith("/api/expenses") ||
    path.startsWith("/api/parents/me");
}

function canUseParentSessionFallback(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const hasParentSession = Boolean(localStorage.getItem(PARENT_ID_STORAGE_KEY));
  return hasParentSession && method === "GET" && (
    path === "/api/parents/me" ||
    path === "/api/finance/me/profile"
  );
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldUseDemoApi(path)) return demoApi<T>(path, init);

  const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (isLocalSessionToken(storedToken) && canFallbackToDemo(path, init)) {
    return demoApi<T>(path, init);
  }

  const token = storedToken ?? "";
  const url = resolveApiUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    if (LOCAL_API_FALLBACK_ENABLED && canFallbackToDemo(path, init)) return demoApi<T>(path, init);
    throw new Error("Impossible de joindre l'API. Verifiez que le backend est demarre.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      if ((LOCAL_API_FALLBACK_ENABLED && canFallbackToDemo(path, init)) || canUseParentSessionFallback(path, init)) {
        return demoApi<T>(path, init);
      }
      clearLocalSession();
      window.location.replace(`${import.meta.env.BASE_URL}#/login`);
      throw new Error("Session expiree. Veuillez vous reconnecter.");
    }

    if (((LOCAL_API_FALLBACK_ENABLED && canFallbackToDemo(path, init)) || canUseParentSessionFallback(path, init)) && (response.status >= 500 || response.status === 404)) {
      return demoApi<T>(path, init);
    }

    const errorFromJson = await response.json().catch(() => null) as { message?: string } | null;
    if (errorFromJson?.message) throw new Error(errorFromJson.message);

    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Erreur API (${response.status})`);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}
