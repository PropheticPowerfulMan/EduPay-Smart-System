import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FilePlus2,
  Landmark,
  Printer,
  ReceiptText,
  UserPlus,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { schoolBranding } from "../config/branding";
import { SearchField } from "../components/SearchField";
import { api } from "../services/api";
import { useI18n } from "../i18n";
import { useAuthStore } from "../store/auth";
import { exportWorkbook } from "../utils/financeExcel";
import { printHtmlDocument as sharedPrintHtmlDocument } from "../utils/printDocument";

type ExpenseAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  notes?: string;
};

type ExpenseCategory = {
  id: string;
  name: string;
  type: string;
  parentCategoryId: string | null;
  ownerApprovalRequired?: boolean;
};

type Vendor = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

type Budget = {
  id: string;
  name: string;
  department: string;
  plannedAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  utilization: number;
  status: string;
  alertThreshold?: number;
  notes?: string;
  category?: { id: string; name: string } | null;
  period?: { id: string; name: string } | null;
};

type Expense = {
  id: string;
  title: string;
  department: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  supplierName?: string;
  status: string;
  financialPeriodLabel: string;
  expenseDate: string;
  comments?: string;
  category: { id: string; name: string; type: string; parentCategoryId: string | null };
  vendor?: Vendor | null;
  budget?: Budget | null;
  attachments?: ExpenseAttachment[];
  approvalSteps: Array<{ stage: number; role: string; status: string; comments?: string }>;
};

type DocumentEntry = ExpenseAttachment & {
  expenseId: string;
  expenseTitle: string;
  department: string;
  status: string;
  expenseDate: string;
};

type SalaryProfile = {
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
  debtRecoveryRate: number;
  notes?: string;
  isActive: boolean;
};

type PayrollRun = {
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
  period?: { id: string; name: string } | null;
  items: Array<{
    id: string;
    netSalary: number;
    salarySlipNumber: string;
    salaryProfile: SalaryProfile;
  }>;
};

type AccountingEntry = {
  id: string;
  entryType: string;
  direction: string;
  title: string;
  amount: number;
  currency: string;
  entryDate: string;
  department?: string | null;
  createdAt?: string;
  expense?: { id: string; title: string; department?: string | null; status?: string | null } | null;
  payrollRun?: { id: string; title: string; department?: string | null; status?: string | null } | null;
  payrollItem?: {
    id: string;
    salarySlipNumber?: string | null;
    netSalary: number;
    salaryProfile: { id: string; fullName: string; employeeCode: string; department?: string | null; position?: string | null };
  } | null;
};

type CashflowEntry = {
  id: string;
  direction: string;
  sourceType: string;
  amount: number;
  currency: string;
  method?: string | null;
  referenceDate: string;
  notes?: string | null;
  createdAt?: string;
  expense?: { id: string; title: string; department?: string | null; status?: string | null } | null;
  payrollRun?: { id: string; title: string; department?: string | null; status?: string | null } | null;
  payrollItem?: {
    id: string;
    salarySlipNumber?: string | null;
    netSalary: number;
    salaryProfile: { id: string; fullName: string; employeeCode: string; department?: string | null; position?: string | null };
  } | null;
};

type ExpenseOverview = {
  expenses: {
    totalExpenses: number;
    approvedExpenses: number;
    pendingExpenses: number;
    rejectedExpenses: number;
    pendingApprovalSteps: number;
  };
  payroll: {
    activeProfiles: number;
    runCount: number;
    totalPayroll: number;
    salaryLiability: number;
  };
  cashflow: {
    availableCash: number;
    profitLoss: number;
  };
  liabilities: {
    supplierDebt: number;
    payrollLiability: number;
    institutionalObligations: number;
  };
};

type ExpenseFormState = {
  title: string;
  categoryId: string;
  vendorId: string;
  budgetId: string;
  department: string;
  amount: string;
  paymentMethod: string;
  expenseDate: string;
  supplierName: string;
  comments: string;
  attachmentName: string;
  attachmentUrl: string;
};

type BudgetFormState = {
  name: string;
  department: string;
  plannedAmount: string;
  categoryId: string;
  alertThreshold: string;
  notes: string;
};

type VendorFormState = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type SalaryFormState = {
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  baseSalary: string;
  frequency: string;
  defaultBonus: string;
  defaultDeduction: string;
  debtRecoveryRate: string;
  notes: string;
};

type PayrollFormState = {
  title: string;
  department: string;
  frequency: string;
  notes: string;
};

const EMPTY_EXPENSE_OVERVIEW: ExpenseOverview = {
  expenses: {
    totalExpenses: 0,
    approvedExpenses: 0,
    pendingExpenses: 0,
    rejectedExpenses: 0,
    pendingApprovalSteps: 0,
  },
  payroll: {
    activeProfiles: 0,
    runCount: 0,
    totalPayroll: 0,
    salaryLiability: 0,
  },
  cashflow: {
    availableCash: 0,
    profitLoss: 0,
  },
  liabilities: {
    supplierDebt: 0,
    payrollLiability: 0,
    institutionalObligations: 0,
  }
};

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "MPESA", "AIRTEL_MONEY", "ORANGE_MONEY", "CHEQUE", "INTERNAL_TRANSFER"];
const PAYROLL_FREQUENCIES = ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "ANNUAL"];
type OperationTab = "expenses" | "budgets" | "payroll" | "accounting" | "cashflow" | "documents";
type OperationSubDialog = "expense-create" | "vendor-create" | "budget-create" | "salary-profile-create" | "payroll-run-create";

const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  title: "",
  categoryId: "",
  vendorId: "",
  budgetId: "",
  department: "",
  amount: "",
  paymentMethod: "",
  expenseDate: "",
  supplierName: "",
  comments: "",
  attachmentName: "",
  attachmentUrl: ""
};

const EMPTY_VENDOR_FORM: VendorFormState = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: ""
};

const EMPTY_BUDGET_FORM: BudgetFormState = {
  name: "",
  department: "",
  plannedAmount: "",
  categoryId: "",
  alertThreshold: "",
  notes: ""
};

const EMPTY_SALARY_FORM: SalaryFormState = {
  employeeCode: "",
  fullName: "",
  department: "",
  position: "",
  baseSalary: "",
  frequency: "",
  defaultBonus: "",
  defaultDeduction: "",
  debtRecoveryRate: "",
  notes: ""
};

const EMPTY_PAYROLL_FORM: PayrollFormState = {
  title: "",
  department: "",
  frequency: "MONTHLY",
  notes: ""
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card glass min-w-0 border border-white/10 shadow-lg">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold text-white sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
      </div>
      <div className="mt-5 min-w-0">{children}</div>
    </section>
  );
}

function ActionNodeCard({
  title,
  subtitle,
  detail,
  icon: Icon,
  tone,
  onClick
}: {
  title: string;
  subtitle: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/36 p-4 text-left transition hover:border-brand-300/30 hover:bg-white/[0.06]"
    >
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="font-semibold text-white">{title}</span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim transition group-hover:translate-x-0.5 group-hover:text-brand-100" />
        </span>
        <span className="mt-1 block text-sm text-ink-dim">{subtitle}</span>
        <span className="mt-3 inline-flex max-w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-brand-100">
          {detail}
        </span>
      </span>
    </button>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === "APPROVED" || value === "PAID"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
    : value === "REJECTED" || value === "EXCEEDED"
      ? "border-red-500/25 bg-red-500/10 text-red-200"
      : value === "PENDING" || value === "DRAFT"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
        : "border-brand-500/25 bg-brand-500/10 text-brand-100";
  return <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{value}</span>;
}

function OperationsDialog({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="edupay-operations-dialog fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-5">
      <button aria-label="Fermer" className="absolute inset-0 bg-slate-950/78 backdrop-blur-md" onClick={onClose} />
      <section className="edupay-operations-modal relative flex max-h-[98vh] w-full max-w-8xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/95 shadow-2xl">
        <header className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Operations</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-dim hover:border-brand-300/30 hover:text-white"
            aria-label="Fermer la boite de dialogue"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="edupay-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function OperationsSubDialog({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-md sm:p-6">
      <button aria-label="Fermer le sous-dialogue" className="fixed inset-0 cursor-default" onClick={onClose} />
      <section className="edupay-operations-submodal relative my-auto flex max-h-[98vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-cyan-950/30">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Paie</p>
            <h3 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">{title}</h3>
            <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-dim hover:border-brand-300/30 hover:text-white"
            aria-label="Fermer le sous-dialogue"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="edupay-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function labelizeFrequency(value: string) {
  const map: Record<string, string> = {
    MONTHLY: "Mensuel",
    BI_MONTHLY: "Bimensuel",
    QUARTERLY: "Trimestriel",
    ANNUAL: "Annuel"
  };
  return map[value] ?? value;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function ratioPercent(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

export function FinancialOperationsPage() {
  const { lang } = useI18n();
  const role = useAuthStore((state) => state.role);
  const canWrite = role !== "AUDITOR" && role !== "PARENT";
  const currency = useMemo(() => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: "USD" }), [lang]);
  const L = (fr: string, en: string) => lang === "fr" ? fr : en;

  const [activeTab, setActiveTab] = useState<OperationTab>("expenses");
  const [activeDialog, setActiveDialog] = useState<OperationTab | null>(null);
  const [activeSubDialog, setActiveSubDialog] = useState<OperationSubDialog | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [salaryProfiles, setSalaryProfiles] = useState<SalaryProfile[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [cashflowEntries, setCashflowEntries] = useState<CashflowEntry[]>([]);
  const [overview, setOverview] = useState<ExpenseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [accountingSearch, setAccountingSearch] = useState("");
  const [accountingDepartmentFilter, setAccountingDepartmentFilter] = useState("ALL");
  const [cashflowSearch, setCashflowSearch] = useState("");
  const [cashflowSourceFilter, setCashflowSourceFilter] = useState("ALL");
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [pendingAttachments, setPendingAttachments] = useState<ExpenseAttachment[]>([]);
  const [vendorForm, setVendorForm] = useState<VendorFormState>(EMPTY_VENDOR_FORM);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(EMPTY_BUDGET_FORM);
  const [salaryForm, setSalaryForm] = useState<SalaryFormState>(EMPTY_SALARY_FORM);
  const [payrollForm, setPayrollForm] = useState<PayrollFormState>(EMPTY_PAYROLL_FORM);
  const availableCash = overview?.cashflow.availableCash ?? 0;
  const safeOverview = overview ?? EMPTY_EXPENSE_OVERVIEW;

  useEffect(() => {
    let active = true;
    Promise.all([
      api<ExpenseCategory[]>("/api/expenses/categories"),
      api<Vendor[]>("/api/expenses/vendors"),
      api<Budget[]>("/api/expenses/budgets"),
      api<Expense[]>("/api/expenses"),
      api<SalaryProfile[]>("/api/expenses/payroll/profiles"),
      api<PayrollRun[]>("/api/expenses/payroll/runs"),
      api<AccountingEntry[]>("/api/expenses/accounting-entries"),
      api<CashflowEntry[]>("/api/expenses/cashflow-entries"),
      api<ExpenseOverview>("/api/expenses/overview")
    ])
      .then(([nextCategories, nextVendors, nextBudgets, nextExpenses, nextSalaryProfiles, nextPayrollRuns, nextAccountingEntries, nextCashflowEntries, nextOverview]) => {
        if (!active) return;
        setCategories(nextCategories);
        setVendors(nextVendors);
        setBudgets(nextBudgets);
        setExpenses(nextExpenses);
        setSalaryProfiles(nextSalaryProfiles);
        setPayrollRuns(nextPayrollRuns);
        setAccountingEntries(nextAccountingEntries);
        setCashflowEntries(nextCashflowEntries);
        setOverview(nextOverview);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger les operations financieres.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const leafCategories = useMemo(() => {
    const parentIds = new Set(categories.map((category) => category.parentCategoryId).filter(Boolean));
    return categories.filter((category) => !parentIds.has(category.id));
  }, [categories]);

  const expenseStats = useMemo(() => ({
    pending: expenses.filter((expense) => expense.status === "PENDING").length,
    approved: expenses.filter((expense) => expense.status === "APPROVED").length,
    rejected: expenses.filter((expense) => expense.status === "REJECTED").length
  }), [expenses]);

  const accountingMetrics = useMemo(() => {
    const totalVolume = accountingEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const expenseVolume = accountingEntries.filter((entry) => entry.entryType === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0);
    const payrollVolume = accountingEntries.filter((entry) => entry.entryType === "PAYROLL").reduce((sum, entry) => sum + entry.amount, 0);
    const averageEntry = accountingEntries.length ? totalVolume / accountingEntries.length : 0;
    const departmentTotals = accountingEntries.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.department || "Non renseigne";
      acc[key] = (acc[key] ?? 0) + entry.amount;
      return acc;
    }, {});
    const topDepartment = Object.entries(departmentTotals).sort((left, right) => right[1] - left[1])[0];
    const documentedExpenses = expenses.filter((expense) => (expense.attachments?.length ?? 0) > 0).length;
    const documentationCoverage = ratioPercent(documentedExpenses, expenses.length);
    const approvalCoverage = ratioPercent(expenseStats.approved, expenses.length);

    return {
      totalVolume,
      expenseVolume,
      payrollVolume,
      averageEntry,
      payrollWeight: ratioPercent(payrollVolume, totalVolume),
      expenseWeight: ratioPercent(expenseVolume, totalVolume),
      topDepartmentName: topDepartment?.[0] ?? "N/A",
      topDepartmentWeight: ratioPercent(topDepartment?.[1] ?? 0, totalVolume),
      documentationCoverage,
      approvalCoverage
    };
  }, [accountingEntries, expenseStats.approved, expenses]);

  const cashflowMetrics = useMemo(() => {
    const totalOutflow = cashflowEntries.filter((entry) => entry.direction === "OUTFLOW").reduce((sum, entry) => sum + entry.amount, 0);
    const totalInflow = cashflowEntries.filter((entry) => entry.direction === "INFLOW").reduce((sum, entry) => sum + entry.amount, 0);
    const outflowCount = cashflowEntries.filter((entry) => entry.direction === "OUTFLOW").length;
    const averageOutflow = outflowCount ? totalOutflow / outflowCount : 0;
    const payrollOutflow = cashflowEntries.filter((entry) => entry.sourceType === "PAYROLL").reduce((sum, entry) => sum + entry.amount, 0);
    const expenseOutflow = cashflowEntries.filter((entry) => entry.sourceType === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0);
    const sourceTotals = cashflowEntries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.sourceType] = (acc[entry.sourceType] ?? 0) + entry.amount;
      return acc;
    }, {});
    const dominantSource = Object.entries(sourceTotals).sort((left, right) => right[1] - left[1])[0];

    return {
      totalOutflow,
      totalInflow,
      averageOutflow,
      payrollOutflow,
      expenseOutflow,
      payrollShare: ratioPercent(payrollOutflow, totalOutflow),
      expenseShare: ratioPercent(expenseOutflow, totalOutflow),
      coverageRatio: totalOutflow ? availableCash / totalOutflow : 0,
      netMovement: totalInflow - totalOutflow,
      dominantSourceName: dominantSource?.[0] ?? "N/A",
      dominantSourceWeight: ratioPercent(dominantSource?.[1] ?? 0, totalOutflow || totalInflow)
    };
  }, [availableCash, cashflowEntries]);

  const accountingDepartmentOptions = useMemo(
    () => Array.from(new Set(accountingEntries.map((entry) => entry.department || "Non renseigne"))).sort((left, right) => left.localeCompare(right)),
    [accountingEntries]
  );

  const filteredAccountingEntries = useMemo(() => {
    const needle = accountingSearch.trim().toLowerCase();
    return accountingEntries.filter((entry) => {
      const department = entry.department || "Non renseigne";
      const matchesDepartment = accountingDepartmentFilter === "ALL" || department === accountingDepartmentFilter;
      const matchesSearch = !needle
        || entry.title.toLowerCase().includes(needle)
        || department.toLowerCase().includes(needle)
        || entry.entryType.toLowerCase().includes(needle)
        || (entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "").toLowerCase().includes(needle);
      return matchesDepartment && matchesSearch;
    });
  }, [accountingDepartmentFilter, accountingEntries, accountingSearch]);

  const accountingBreakdown = useMemo(() => {
    const grouped = filteredAccountingEntries.reduce<Record<string, { count: number; volume: number }>>((acc, entry) => {
      const key = entry.department || "Non renseigne";
      const current = acc[key] ?? { count: 0, volume: 0 };
      current.count += 1;
      current.volume += entry.amount;
      acc[key] = current;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([department, data]) => ({
        department,
        count: data.count,
        volume: data.volume,
        average: data.count ? data.volume / data.count : 0,
        weight: ratioPercent(data.volume, accountingMetrics.totalVolume)
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [accountingMetrics.totalVolume, filteredAccountingEntries]);

  const cashflowSourceOptions = useMemo(
    () => Array.from(new Set(cashflowEntries.map((entry) => entry.sourceType))).sort((left, right) => left.localeCompare(right)),
    [cashflowEntries]
  );

  const filteredCashflowEntries = useMemo(() => {
    const needle = cashflowSearch.trim().toLowerCase();
    return cashflowEntries.filter((entry) => {
      const reference = entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "";
      const matchesSource = cashflowSourceFilter === "ALL" || entry.sourceType === cashflowSourceFilter;
      const matchesSearch = !needle
        || entry.sourceType.toLowerCase().includes(needle)
        || entry.direction.toLowerCase().includes(needle)
        || (entry.method || "").toLowerCase().includes(needle)
        || reference.toLowerCase().includes(needle)
        || (entry.notes || "").toLowerCase().includes(needle);
      return matchesSource && matchesSearch;
    });
  }, [cashflowEntries, cashflowSearch, cashflowSourceFilter]);

  const cashflowBreakdown = useMemo(() => {
    const grouped = filteredCashflowEntries.reduce<Record<string, { count: number; volume: number }>>((acc, entry) => {
      const current = acc[entry.sourceType] ?? { count: 0, volume: 0 };
      current.count += 1;
      current.volume += entry.amount;
      acc[entry.sourceType] = current;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([sourceType, data]) => ({
        sourceType,
        count: data.count,
        volume: data.volume,
        average: data.count ? data.volume / data.count : 0,
        weight: ratioPercent(data.volume, cashflowMetrics.totalOutflow || data.volume)
      }))
      .sort((left, right) => right.volume - left.volume);
  }, [cashflowMetrics.totalOutflow, filteredCashflowEntries]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesStatus = statusFilter === "ALL" || expense.status === statusFilter;
      const needle = search.trim().toLowerCase();
      const matchesSearch = !needle
        || expense.title.toLowerCase().includes(needle)
        || expense.department.toLowerCase().includes(needle)
        || expense.category.name.toLowerCase().includes(needle)
        || (expense.vendor?.name ?? "").toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [expenses, search, statusFilter]);

  const documentEntries = useMemo<DocumentEntry[]>(() => {
    return expenses
      .flatMap((expense) =>
        (expense.attachments ?? []).map((attachment) => ({
          ...attachment,
          expenseId: expense.id,
          expenseTitle: expense.title,
          department: expense.department,
          status: expense.status,
          expenseDate: expense.expenseDate
        }))
      )
      .sort((left, right) => new Date(right.expenseDate).getTime() - new Date(left.expenseDate).getTime());
  }, [expenses]);

  async function refreshOverview() {
    const nextOverview = await api<ExpenseOverview>("/api/expenses/overview");
    setOverview(nextOverview);
  }

  async function refreshLedgers() {
    const [nextAccountingEntries, nextCashflowEntries] = await Promise.all([
      api<AccountingEntry[]>("/api/expenses/accounting-entries"),
      api<CashflowEntry[]>("/api/expenses/cashflow-entries")
    ]);
    setAccountingEntries(nextAccountingEntries);
    setCashflowEntries(nextCashflowEntries);
  }

  function printHtmlDocument(html: string) {
    setActionError(null);
    sharedPrintHtmlDocument(html);
  }

  function printSalarySlip(run: PayrollRun, item: PayrollRun["items"][number]) {
    const brand = schoolBranding;
    const logoSrc = escapeHtml(new URL(brand.logoSrc, window.location.href).toString());
    const generatedAt = new Date();
    const documentReference = escapeHtml(`KCS-PAYROLL-${generatedAt.toISOString().slice(0, 10)}-${item.salarySlipNumber}`);
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Fiche salariale ${item.salarySlipNumber}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { position: relative; font-family: Arial, Helvetica, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
    .watermark-text { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 96px; font-weight: 900; letter-spacing: 16px; color: rgba(11,46,89,0.05); transform: rotate(-22deg); pointer-events: none; user-select: none; }
    .watermark-logo { position: fixed; left: 50%; top: 50%; width: 320px; height: 320px; opacity: 0.08; transform: translate(-50%, -50%); object-fit: contain; filter: grayscale(100%) contrast(1.05); pointer-events: none; user-select: none; }
    .sheet { position: relative; z-index: 2; max-width: 780px; margin: 0 auto; background: white; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 60px rgba(15,23,42,0.08); }
    .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; padding: 0 4px 10px; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:0.16em; }
    .topbar strong { color:#0b2e59; }
    .hero { padding: 28px; background: linear-gradient(135deg, #082f49, #1f4f8f); color: white; display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
    .hero-main { display:flex; align-items:center; gap:16px; }
    .hero-logo { width: 64px; height: 64px; object-fit: contain; border-radius: 999px; background: white; padding: 6px; border: 1px solid rgba(255,255,255,0.2); }
    .hero h1 { margin: 8px 0 0; font-size: 28px; }
    .hero p { margin: 6px 0 0; color: #cbd5e1; }
    .hero-meta { text-align:right; font-size:12px; color: rgba(255,255,255,0.86); }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 24px 28px 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
    .value { margin-top: 8px; font-size: 18px; font-weight: 700; color: #0b2e59; }
    .table-wrap { padding: 0 28px 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 13px; }
    th { color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
    .compliance { margin: 0 28px 18px; border: 1px solid rgba(15,118,110,0.2); border-left: 5px solid #0f766e; border-radius: 14px; background: rgba(240,253,250,0.96); padding: 12px 14px; color: #134e4a; font-size: 11px; line-height: 1.5; }
    .signatures { display:grid; grid-template-columns: 1fr 1fr; gap:16px; padding: 0 28px 20px; }
    .signature-box { min-height: 82px; border:1px dashed rgba(11,46,89,0.24); border-radius:14px; background: rgba(255,255,255,0.88); padding:12px; }
    .signature-title { font-size:10px; text-transform:uppercase; letter-spacing:0.14em; font-weight:800; color:#64748b; }
    .signature-line { margin-top:38px; border-top:1px solid rgba(11,46,89,0.24); padding-top:6px; font-size:11px; color:#0b2e59; font-weight:700; }
    .foot { padding: 0 28px 28px; font-size: 12px; color: #475569; display:flex; justify-content:space-between; gap:12px; border-top: 1px solid #e2e8f0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="watermark-text">${escapeHtml(brand.shortName)}</div>
  <img class="watermark-logo" src="${logoSrc}" alt="" />
  <div class="topbar"><span><strong>${escapeHtml(brand.shortName)}</strong> · fiche salariale officielle</span><span>Référence ${documentReference}</span></div>
  <div class="sheet">
    <div class="hero">
      <div class="hero-main">
        <img class="hero-logo" src="${logoSrc}" alt="Logo ${escapeHtml(brand.schoolName)}" />
        <div>
          <div class="label" style="color:${escapeHtml(brand.colors.accent)}">${escapeHtml(brand.appName)}</div>
          <h1>Fiche salariale</h1>
          <p>${item.salaryProfile.fullName} • ${item.salaryProfile.position} • ${run.period?.name ?? "Periode active"}</p>
        </div>
      </div>
      <div class="hero-meta">
        <div style="font-weight:700;">${escapeHtml(brand.schoolName)}</div>
        <div style="margin-top:4px;">${escapeHtml(brand.tagline)}</div>
        <div style="margin-top:10px;">${escapeHtml(generatedAt.toLocaleDateString("fr-FR"))}</div>
        <div>${escapeHtml(generatedAt.toLocaleTimeString("fr-FR"))}</div>
      </div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Numero de fiche</div><div class="value">${item.salarySlipNumber}</div></div>
      <div class="card"><div class="label">Run de paie</div><div class="value">${run.title}</div></div>
      <div class="card"><div class="label">Employe</div><div class="value">${item.salaryProfile.fullName}</div></div>
      <div class="card"><div class="label">Code employe</div><div class="value">${item.salaryProfile.employeeCode}</div></div>
      <div class="card"><div class="label">Departement</div><div class="value">${item.salaryProfile.department}</div></div>
      <div class="card"><div class="label">Net a payer</div><div class="value">${currency.format(item.netSalary)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Element</th><th>Valeur</th></tr>
        </thead>
        <tbody>
          <tr><td>Salaire de base</td><td>${currency.format(item.salaryProfile.baseSalary)}</td></tr>
          <tr><td>Bonus par defaut</td><td>${currency.format(item.salaryProfile.defaultBonus)}</td></tr>
          <tr><td>Deductions par defaut</td><td>${currency.format(item.salaryProfile.defaultDeduction)}</td></tr>
          <tr><td>Taux de recouvrement</td><td>${item.salaryProfile.debtRecoveryRate.toFixed(2)}%</td></tr>
          <tr><td>Frequence</td><td>${labelizeFrequency(item.salaryProfile.frequency)}</td></tr>
          <tr><td>Statut du run</td><td>${run.status}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="compliance">Cette fiche salariale est éditée selon la charte ${escapeHtml(brand.shortName)} pour consultation, archivage et validation interne. Le montant net correspond au run de paie affiché sur ce document.</div>
    <div class="signatures">
      <div class="signature-box"><div class="signature-title">Validation RH</div><div class="signature-line">Ressources humaines</div></div>
      <div class="signature-box"><div class="signature-title">Visa financier</div><div class="signature-line">Service paie / comptabilité</div></div>
    </div>
    <div class="foot"><span>Document généré par ${escapeHtml(brand.appName)} pour ${escapeHtml(brand.schoolName)}.</span><span>${escapeHtml(generatedAt.toLocaleString("fr-FR"))}</span></div>
  </div>
</body>
</html>`;

  printHtmlDocument(html);
  }

  function exportSalarySlipExcel(run: PayrollRun, item: PayrollRun["items"][number]) {
    exportWorkbook(`fiche-salariale-${item.salarySlipNumber}`, [
      {
        name: "Fiche salariale",
        rows: [{
          "Numero de fiche": item.salarySlipNumber,
          "Run": run.title,
          "Periode": run.period?.name ?? "Periode active",
          "Employe": item.salaryProfile.fullName,
          "Code employe": item.salaryProfile.employeeCode,
          "Departement": item.salaryProfile.department,
          "Poste": item.salaryProfile.position,
          "Frequence": labelizeFrequency(item.salaryProfile.frequency),
          "Salaire de base": item.salaryProfile.baseSalary,
          "Bonus par defaut": item.salaryProfile.defaultBonus,
          "Deductions par defaut": item.salaryProfile.defaultDeduction,
          "Taux de recouvrement %": Number(item.salaryProfile.debtRecoveryRate.toFixed(2)),
          "Net a payer": item.netSalary,
          "Statut du run": run.status
        }]
      }
    ]);
  }

  function openDocument(fileUrl: string) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }

  function downloadDocument(file: ExpenseAttachment) {
    const link = document.createElement("a");
    link.href = file.fileUrl;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function readFileAsAttachment(file: File) {
    return new Promise<ExpenseAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Format de fichier non pris en charge."));
          return;
        }
        resolve({
          id: `pending-${Date.now()}-${file.name}`,
          fileName: file.name,
          fileUrl: reader.result,
          mimeType: file.type || "application/octet-stream"
        });
      };
      reader.onerror = () => reject(new Error(`Impossible de charger ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  async function handleAttachmentSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    try {
      const attachments = await Promise.all(files.map((file) => readFileAsAttachment(file)));
      setPendingAttachments((current) => [...current, ...attachments]);
      setActionError(null);
    } catch (uploadError) {
      setActionError(uploadError instanceof Error ? uploadError.message : "Impossible de charger les justificatifs.");
    } finally {
      event.target.value = "";
    }
  }

  function removePendingAttachment(attachmentId: string) {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function escapeCsv(value: string | number | null | undefined) {
    const normalized = String(value ?? "").replace(/"/g, '""');
    return `"${normalized}"`;
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const content = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function printLedgerReport(
    title: string,
    subtitle: string,
    headers: string[],
    rows: Array<Array<string | number | null | undefined>>,
    metrics: Array<{ label: string; value: string; detail: string }>
  ) {
    const brand = schoolBranding;
    const logoSrc = escapeHtml(new URL(brand.logoSrc, window.location.href).toString());
    const primary = brand.colors.primary;
    const secondary = brand.colors.secondary;
    const accent = brand.colors.accent;
    const surface = brand.colors.surface;
    const generatedAt = new Date();
    const documentReference = escapeHtml(`KCS-LEDGER-${generatedAt.toISOString().slice(0, 10)}-${String(rows.length).padStart(4, "0")}`);
    const headHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const rowsHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const metricHtml = metrics.map((metric) => `
      <div class="metric-card">
        <div class="metric-label">${escapeHtml(metric.label)}</div>
        <div class="metric-value">${escapeHtml(metric.value)}</div>
        <div class="metric-detail">${escapeHtml(metric.detail)}</div>
      </div>
    `).join("");
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: ${surface}; }
    .watermark-text { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 112px; font-weight: 900; letter-spacing: 16px; color: rgba(11,46,89,0.05); transform: rotate(-22deg); pointer-events: none; user-select: none; }
    .watermark-logo { position: fixed; left: 50%; top: 50%; width: 360px; height: 360px; opacity: 0.08; transform: translate(-50%, -50%); object-fit: contain; filter: grayscale(100%) contrast(1.05); pointer-events: none; user-select: none; }
    .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; padding: 0 2px 10px; font-size:10px; text-transform:uppercase; letter-spacing:0.16em; color:#64748b; }
    .topbar strong { color:${primary}; }
    .sheet { position: relative; z-index: 2; background: white; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 60px rgba(15,23,42,0.08); }
    .hero { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; background: linear-gradient(135deg, ${primary}, ${secondary}); color: white; padding: 24px 28px; }
    .hero-main { display:flex; align-items:center; gap:16px; }
    .hero-logo { width: 62px; height: 62px; object-fit: contain; border-radius: 999px; background: white; padding: 5px; border: 1px solid rgba(255,255,255,0.18); }
    .hero h1 { margin: 4px 0 0; font-size: 28px; }
    .hero p { margin: 8px 0 0; color: rgba(255,255,255,0.82); }
    .hero-meta { text-align:right; font-size:12px; color: rgba(255,255,255,0.86); }
    .metrics { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 22px 28px 8px; }
    .metric-card { border: 1px solid #dbeafe; border-radius: 16px; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); padding: 14px; }
    .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; font-weight: 700; }
    .metric-value { margin-top: 8px; color: ${primary}; font-size: 18px; font-weight: 800; }
    .metric-detail { margin-top: 6px; font-size: 11px; color: #475569; }
    .table-wrap { padding: 18px 28px 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; font-size: 12px; }
    th { background: #eff6ff; color: ${primary}; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
    tr:nth-child(even) td { background: #fbfdff; }
    .compliance { margin: 0 28px 18px; border: 1px solid rgba(15,118,110,0.2); border-left: 5px solid #0f766e; border-radius: 14px; background: rgba(240,253,250,0.96); padding: 12px 14px; color: #134e4a; font-size: 11px; line-height: 1.5; }
    .signatures { display:grid; grid-template-columns: 1fr 1fr; gap:16px; padding: 0 28px 20px; }
    .signature-box { min-height: 82px; border:1px dashed rgba(11,46,89,0.24); border-radius:14px; background: rgba(255,255,255,0.88); padding:12px; }
    .signature-title { font-size:10px; text-transform:uppercase; letter-spacing:0.14em; font-weight:800; color:#64748b; }
    .signature-line { margin-top:38px; border-top:1px solid rgba(11,46,89,0.24); padding-top:6px; font-size:11px; color:${primary}; font-weight:700; }
    .foot { padding: 0 28px 24px; color: #475569; font-size: 12px; border-top: 1px solid #e2e8f0; margin-top: 4px; display:flex; justify-content:space-between; gap:12px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="topbar"><span><strong>${escapeHtml(brand.shortName)}</strong> · rapport financier officiel</span><span>Référence ${documentReference}</span></div>
  <div class="watermark-text">${escapeHtml(brand.shortName)}</div>
  <img class="watermark-logo" src="${logoSrc}" alt="" />
  <div class="sheet">
    <div class="hero">
      <div class="hero-main">
        <img class="hero-logo" src="${logoSrc}" alt="Logo ${escapeHtml(brand.schoolName)}" />
        <div>
          <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${escapeHtml(brand.shortName)} Financial Report</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <div class="hero-meta">
        <div style="font-weight:700;">${escapeHtml(brand.schoolName)}</div>
        <div style="margin-top:4px;">${escapeHtml(brand.tagline)}</div>
        <div style="margin-top:10px;">${generatedAt.toLocaleDateString("fr-FR")}</div>
        <div>${generatedAt.toLocaleTimeString("fr-FR")}</div>
      </div>
    </div>
    <div class="metrics">${metricHtml}</div>
    <div class="table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="compliance">Ce journal financier est édité selon la charte ${escapeHtml(brand.shortName)} pour audit, pilotage et archivage. Les indicateurs de synthèse et le tableau détaillé correspondent aux lignes visibles dans l'interface au moment de l'impression.</div>
    <div class="signatures"><div class="signature-box"><div class="signature-title">Contrôle comptable</div><div class="signature-line">Service financier</div></div><div class="signature-box"><div class="signature-title">Visa de direction</div><div class="signature-line">Direction administrative</div></div></div>
    <div class="foot"><span>Document officiel ${escapeHtml(brand.appName)} généré pour ${escapeHtml(brand.schoolName)}.</span><span>${generatedAt.toLocaleString("fr-FR")}</span></div>
  </div>
</body>
</html>`;

    printHtmlDocument(html);
  }

  function exportAccountingCsv() {
    downloadCsv(
      `journal-comptable-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Direction", "Titre", "Departement", "Montant", "Devise", "Source"],
      filteredAccountingEntries.map((entry) => [
        new Date(entry.entryDate).toLocaleDateString("fr-FR"),
        entry.entryType,
        entry.direction,
        entry.title,
        entry.department || "",
        entry.amount,
        entry.currency,
        entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
      ])
    );
  }

  function exportAccountingExcel() {
    exportWorkbook(`journal-comptable-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Synthese",
        rows: [{
          "Ecritures filtrées": filteredAccountingEntries.length,
          "Volume comptabilisé": accountingMetrics.totalVolume,
          "Ticket moyen": Number(accountingMetrics.averageEntry.toFixed(2)),
          "Part paie %": Number(accountingMetrics.payrollWeight.toFixed(2)),
          "Couverture documentaire %": Number(accountingMetrics.documentationCoverage.toFixed(2)),
          "Taux approbation %": Number(accountingMetrics.approvalCoverage.toFixed(2))
        }]
      },
      {
        name: "Repartition departements",
        rows: accountingBreakdown.map((entry) => ({
          "Departement": entry.department,
          "Ecritures": entry.count,
          "Volume": entry.volume,
          "Moyenne": entry.average,
          "Poids %": Number(entry.weight.toFixed(2))
        }))
      },
      {
        name: "Journal comptable",
        rows: filteredAccountingEntries.map((entry) => ({
          "Date": new Date(entry.entryDate).toLocaleDateString("fr-FR"),
          "Type": entry.entryType,
          "Direction": entry.direction,
          "Titre": entry.title,
          "Departement": entry.department || "",
          "Montant": entry.amount,
          "Devise": entry.currency,
          "Source": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
        }))
      }
    ]);
  }

  function exportCashflowCsv() {
    downloadCsv(
      `journal-tresorerie-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Source", "Direction", "Methode", "Montant", "Devise", "Reference", "Notes"],
      filteredCashflowEntries.map((entry) => [
        new Date(entry.referenceDate).toLocaleDateString("fr-FR"),
        entry.sourceType,
        entry.direction,
        entry.method || "",
        entry.amount,
        entry.currency,
        entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "",
        entry.notes || ""
      ])
    );
  }

  function exportCashflowExcel() {
    exportWorkbook(`journal-tresorerie-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Synthese",
        rows: [{
          "Lignes filtrées": filteredCashflowEntries.length,
          "Sorties cumulées": cashflowMetrics.totalOutflow,
          "Ticket moyen sortie": Number(cashflowMetrics.averageOutflow.toFixed(2)),
          "Part paie %": Number(cashflowMetrics.payrollShare.toFixed(2)),
          "Couverture cash": Number(cashflowMetrics.coverageRatio.toFixed(2)),
          "Variation nette": cashflowMetrics.netMovement
        }]
      },
      {
        name: "Repartition sources",
        rows: cashflowBreakdown.map((entry) => ({
          "Source": entry.sourceType,
          "Lignes": entry.count,
          "Volume": entry.volume,
          "Moyenne": entry.average,
          "Poids %": Number(entry.weight.toFixed(2))
        }))
      },
      {
        name: "Journal tresorerie",
        rows: filteredCashflowEntries.map((entry) => ({
          "Date": new Date(entry.referenceDate).toLocaleDateString("fr-FR"),
          "Source": entry.sourceType,
          "Direction": entry.direction,
          "Methode": entry.method || "",
          "Montant": entry.amount,
          "Devise": entry.currency,
          "Reference": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "",
          "Notes": entry.notes || ""
        }))
      }
    ]);
  }

  function printAccountingReport() {
    printLedgerReport(
      "Journal comptable",
      "Vue consolidee des ecritures issues des depenses et de la paie.",
      ["Date", "Type", "Direction", "Titre", "Departement", "Montant", "Source"],
      accountingEntries.map((entry) => [
        new Date(entry.entryDate).toLocaleDateString("fr-FR"),
        entry.entryType,
        entry.direction,
        entry.title,
        entry.department || "",
        currency.format(entry.amount),
        entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
      ]),
      [
        { label: "Volume comptabilisé", value: currency.format(accountingMetrics.totalVolume), detail: "Somme totale des écritures reconnues" },
        { label: "Ticket moyen", value: currency.format(accountingMetrics.averageEntry), detail: "Moyenne = volume / nombre d'écritures" },
        { label: "Part paie", value: formatPercent(accountingMetrics.payrollWeight), detail: `Paie ${currency.format(accountingMetrics.payrollVolume)}` },
        { label: "Couverture documentaire", value: formatPercent(accountingMetrics.documentationCoverage), detail: `Dépenses documentées et traçables` }
      ]
    );
  }

  function printCashflowReport() {
    printLedgerReport(
      "Journal de tresorerie",
      "Vue consolidee des sorties et references de cash liees aux operations financieres.",
      ["Date", "Source", "Direction", "Methode", "Montant", "Reference", "Notes"],
      cashflowEntries.map((entry) => [
        new Date(entry.referenceDate).toLocaleDateString("fr-FR"),
        entry.sourceType,
        entry.direction,
        entry.method || "",
        currency.format(entry.amount),
        entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "",
        entry.notes || ""
      ]),
      [
        { label: "Sorties cumulées", value: currency.format(cashflowMetrics.totalOutflow), detail: "Somme des flux sortants enregistrés" },
        { label: "Ticket moyen sortie", value: currency.format(cashflowMetrics.averageOutflow), detail: "Moyenne des lignes OUTFLOW" },
        { label: "Part paie", value: formatPercent(cashflowMetrics.payrollShare), detail: `Paie ${currency.format(cashflowMetrics.payrollOutflow)}` },
        { label: "Couverture cash", value: `${cashflowMetrics.coverageRatio.toFixed(2)}x`, detail: "Cash disponible / sorties journalisées" }
      ]
    );
  }

  function exportOperationsWorkbook() {
    if (!overview) return;
    exportWorkbook(`pack-financier-operations-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Synthese",
        rows: [{
          "Depenses": overview.expenses.totalExpenses,
          "Budgets": budgets.length,
          "Paies": payrollRuns.length,
          "Comptabilite": accountingEntries.length,
          "Tresorerie": cashflowEntries.length,
          "Documents": documentEntries.length,
          "Cash disponible": overview.cashflow.availableCash
        }]
      },
      {
        name: "Depenses",
        rows: expenses.map((expense) => ({
          "Date": new Date(expense.expenseDate).toLocaleDateString("fr-FR"),
          "Titre": expense.title,
          "Departement": expense.department,
          "Categorie": expense.category.name,
          "Statut": expense.status,
          "Montant": expense.amount,
          "Budget": expense.budget?.name || "",
          "Fournisseur": expense.vendor?.name || expense.supplierName || "",
          "Pieces": expense.attachments?.length || 0
        }))
      },
      {
        name: "Budgets",
        rows: budgets.map((budget) => ({
          "Nom": budget.name,
          "Departement": budget.department,
          "Planifie": budget.plannedAmount,
          "Consomme": budget.consumedAmount,
          "Reste": budget.remainingAmount,
          "Utilisation %": Number(budget.utilization.toFixed(2)),
          "Statut": budget.status
        }))
      },
      {
        name: "Paie",
        rows: payrollRuns.map((run) => ({
          "Run": run.title,
          "Departement": run.department || "Tous",
          "Frequence": run.frequency,
          "Statut": run.status,
          "Net": run.totalNet,
          "Deductions": run.totalDeductions,
          "Bulletins": run.items.length
        }))
      },
      {
        name: "Comptabilite",
        rows: accountingEntries.map((entry) => ({
          "Date": new Date(entry.entryDate).toLocaleDateString("fr-FR"),
          "Type": entry.entryType,
          "Direction": entry.direction,
          "Titre": entry.title,
          "Departement": entry.department || "",
          "Montant": entry.amount,
          "Source": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
        }))
      },
      {
        name: "Tresorerie",
        rows: cashflowEntries.map((entry) => ({
          "Date": new Date(entry.referenceDate).toLocaleDateString("fr-FR"),
          "Source": entry.sourceType,
          "Direction": entry.direction,
          "Montant": entry.amount,
          "Methode": entry.method || "",
          "Reference": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "",
          "Notes": entry.notes || ""
        }))
      },
      {
        name: "Documents",
        rows: documentEntries.map((entry) => ({
          "Date": new Date(entry.expenseDate).toLocaleDateString("fr-FR"),
          "Document": entry.fileName,
          "Depense": entry.expenseTitle,
          "Departement": entry.department,
          "Statut": entry.status,
          "Type MIME": entry.mimeType || ""
        }))
      }
    ]);
  }

  async function handleCreateVendor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    setSubmittingKey("vendor");
    try {
      const created = await api<Vendor>("/api/expenses/vendors", { method: "POST", body: JSON.stringify(vendorForm) });
      setVendors((current) => [created, ...current]);
      setVendorForm(EMPTY_VENDOR_FORM);
      setActiveSubDialog(null);
      setSuccess("Fournisseur ajoute.");
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de creer le fournisseur.");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function handleCreateBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    setSubmittingKey("budget");
    try {
      const created = await api<Budget>("/api/expenses/budgets", {
        method: "POST",
        body: JSON.stringify({
          name: budgetForm.name,
          department: budgetForm.department,
          plannedAmount: Number(budgetForm.plannedAmount || 0),
          categoryId: budgetForm.categoryId || undefined,
          alertThreshold: Number(budgetForm.alertThreshold || 80),
          notes: budgetForm.notes
        })
      });
      setBudgets((current) => [created, ...current]);
      setBudgetForm(EMPTY_BUDGET_FORM);
      setActiveSubDialog(null);
      setSuccess("Budget enregistre.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de creer le budget.");
    } finally {
      setSubmittingKey(null);
    }
  }

  function openBudgetDialog() {
    setBudgetForm(EMPTY_BUDGET_FORM);
    setActiveSubDialog("budget-create");
  }

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    setSubmittingKey("expense");
    try {
      const created = await api<Expense>("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          categoryId: expenseForm.categoryId,
          vendorId: expenseForm.vendorId || undefined,
          budgetId: expenseForm.budgetId || undefined,
          title: expenseForm.title,
          department: expenseForm.department,
          amount: Number(expenseForm.amount || 0),
          paymentMethod: expenseForm.paymentMethod,
          expenseDate: expenseForm.expenseDate,
          supplierName: expenseForm.supplierName,
          comments: expenseForm.comments,
          attachments: [
            ...(expenseForm.attachmentName && expenseForm.attachmentUrl
              ? [{ kind: "EXPENSE_SUPPORT", fileName: expenseForm.attachmentName, fileUrl: expenseForm.attachmentUrl }]
              : []),
            ...pendingAttachments.map((attachment) => ({
              kind: "EXPENSE_SUPPORT",
              fileName: attachment.fileName,
              fileUrl: attachment.fileUrl,
              mimeType: attachment.mimeType,
              notes: attachment.notes
            }))
          ]
        })
      });
      setExpenses((current) => [created, ...current]);
      setExpenseForm(EMPTY_EXPENSE_FORM);
      setPendingAttachments([]);
      setActiveSubDialog(null);
      setSuccess("Depense soumise au workflow d'approbation.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de soumettre la depense.");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function handleApproval(expenseId: string, status: "APPROVED" | "REJECTED") {
    setActionError(null);
    setSuccess(null);
    setSubmittingKey(`approval-${expenseId}-${status}`);
    try {
      const updated = await api<Expense>(`/api/expenses/${expenseId}/approval`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setExpenses((current) => current.map((expense) => expense.id === expenseId ? updated : expense));
      setSuccess(status === "APPROVED" ? "Etape d'approbation validee." : "Depense rejetee.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de traiter l'approbation.");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function handleCreateSalaryProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    setSubmittingKey("salary");
    try {
      const created = await api<SalaryProfile>("/api/expenses/payroll/profiles", {
        method: "POST",
        body: JSON.stringify({
          employeeCode: salaryForm.employeeCode,
          fullName: salaryForm.fullName,
          department: salaryForm.department,
          position: salaryForm.position,
          baseSalary: Number(salaryForm.baseSalary || 0),
          frequency: salaryForm.frequency || undefined,
          defaultBonus: salaryForm.defaultBonus === "" ? undefined : Number(salaryForm.defaultBonus),
          defaultDeduction: salaryForm.defaultDeduction === "" ? undefined : Number(salaryForm.defaultDeduction),
          debtRecoveryRate: salaryForm.debtRecoveryRate === "" ? undefined : Number(salaryForm.debtRecoveryRate),
          notes: salaryForm.notes
        })
      });
      setSalaryProfiles((current) => [created, ...current]);
      setSalaryForm(EMPTY_SALARY_FORM);
      setActiveSubDialog(null);
      setSuccess("Profil salarial ajoute.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de creer le profil salarial.");
    } finally {
      setSubmittingKey(null);
    }
  }

  function openSalaryProfileDialog() {
    setSalaryForm(EMPTY_SALARY_FORM);
    setActiveSubDialog("salary-profile-create");
  }

  async function handleCreatePayrollRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    setSubmittingKey("payroll");
    try {
      const created = await api<PayrollRun>("/api/expenses/payroll/runs", {
        method: "POST",
        body: JSON.stringify(payrollForm)
      });
      setPayrollRuns((current) => [created, ...current]);
      setPayrollForm(EMPTY_PAYROLL_FORM);
      setActiveSubDialog(null);
      setSuccess("Run de paie genere.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de lancer la paie.");
    } finally {
      setSubmittingKey(null);
    }
  }

  if (error && !overview) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-xl rounded-2xl border border-red-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">{L("Operations indisponibles", "Operations unavailable")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">{L("Les operations financieres ne sont pas disponibles", "Financial operations are unavailable")}</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? L("Aucune donnee n'a ete renvoyee.", "No data was returned.")}</p>
        </div>
      </div>
    );
  }

  const operationModules: Array<{
    value: OperationTab;
    title: string;
    description: string;
    count: number;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = [
    {
      value: "expenses",
      title: L("Dépenses", "Expenses"),
      description: L("Demandes, justificatifs, fournisseurs et validations.", "Requests, supporting documents, vendors and approvals."),
      count: expenses.length,
      metric: L(`${expenseStats.pending} en attente`, `${expenseStats.pending} pending`),
      icon: ReceiptText,
      tone: "border-red-400/20 bg-red-500/10 text-red-200"
    },
    {
      value: "budgets",
      title: L("Budgets", "Budgets"),
      description: L("Enveloppes par departement, seuils et consommation.", "Department envelopes, thresholds and usage."),
      count: budgets.length,
      metric: L(`${budgets.filter((budget) => budget.status === "EXCEEDED").length} dépassement(s)`, `${budgets.filter((budget) => budget.status === "EXCEEDED").length} overrun(s)`),
      icon: Landmark,
      tone: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
    },
    {
      value: "payroll",
      title: L("Paie", "Payroll"),
      description: L("Profils salariaux, runs, bulletins et export.", "Salary profiles, runs, payslips and exports."),
      count: payrollRuns.length,
      metric: loading ? L("Chargement...", "Loading...") : currency.format(safeOverview.payroll.totalPayroll),
      icon: Users,
      tone: "border-brand-300/20 bg-brand-500/10 text-brand-100"
    },
    {
      value: "accounting",
      title: L("Comptabilité", "Accounting"),
      description: L("Journal général des charges et pièces sources.", "General expense ledger and source documents."),
      count: accountingEntries.length,
      metric: L("Écritures générées", "Generated entries"),
      icon: Landmark,
      tone: "border-violet-300/20 bg-violet-500/10 text-violet-100"
    },
    {
      value: "cashflow",
      title: L("Trésorerie", "Cash flow"),
      description: L("Mouvements de trésorerie, méthodes et solde disponible.", "Cash movements, methods and available balance."),
      count: cashflowEntries.length,
      metric: loading ? L("Chargement...", "Loading...") : currency.format(safeOverview.cashflow.availableCash),
      icon: CircleDollarSign,
      tone: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
    },
    {
      value: "documents",
      title: L("Documents", "Documents"),
      description: L("Pièces justificatives, ouverture et téléchargement.", "Supporting documents, opening and downloads."),
      count: documentEntries.length,
      metric: L(`${expenses.filter((expense) => (expense.attachments?.length ?? 0) > 0).length} dossier(s)`, `${expenses.filter((expense) => (expense.attachments?.length ?? 0) > 0).length} file(s)`),
      icon: BriefcaseBusiness,
      tone: "border-amber-300/20 bg-amber-500/10 text-amber-100"
    }
  ];
  const activeModule = operationModules.find((module) => module.value === activeDialog);
  const handleCloseOperationsDialog = () => {
    setActiveSubDialog(null);

    // When supporting documents are opened from the Expenses branch,
    // closing should return to Expenses instead of leaving Operations entirely.
    if (activeDialog === "expenses" && activeTab === "documents") {
      setActiveTab("expenses");
      return;
    }

    setActiveDialog(null);
  };

  return (
    <div className="edupay-operations space-y-6 pb-10 animate-fadeInUp">
      {loading && (
        <div className="rounded-2xl border border-brand-300/20 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          Chargement des données opérationnelles en arrière-plan. La page reste disponible pendant la synchronisation.
        </div>
      )}
      <section className="glass min-w-0 border border-brand-300/15 px-4 py-5 shadow-xl sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">{L("Opérations financières EduPay", "EduPay Financial Operations")}</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">{L("Centre opérationnel des dépenses, des budgets et de la paie", "Operational center for expenses, budgets and payroll")}</h1>
            <p className="mt-3 text-sm text-ink-dim">
              {L(
                "Cet espace complète le tableau financier avec les opérations exécutables : création de dépenses, fournisseurs, budgets, profils salariaux, cycles de paie et validation des sorties de trésorerie.",
                "This area complements the ERP cockpit with executable operations: expense creation, vendors, budgets, salary profiles, payroll runs and cash-out validation."
              )}
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[380px]">
            <div className="min-w-0 rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">{L("Cash disponible", "Available cash")}</p>
              <p className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">{currency.format(safeOverview.cashflow.availableCash)}</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">{L("Étapes en attente", "Pending steps")}</p>
              <p className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">{safeOverview.expenses.pendingApprovalSteps}</p>
            </div>
            <button onClick={exportOperationsWorkbook} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400/20 sm:col-span-2">
              <Download className="h-4 w-4" /> {L("Exporter le pack Excel", "Export Excel pack")}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{L("Dépenses", "Expenses")}</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{currency.format(safeOverview.expenses.totalExpenses)}</p>
              <p className="mt-2 text-xs text-ink-dim">{L(`${expenseStats.approved} approuvée(s), ${expenseStats.pending} en attente`, `${expenseStats.approved} approved, ${expenseStats.pending} pending`)}</p>
            </div>
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-300"><ReceiptText className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{L("Budgets", "Budgets")}</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{budgets.length}</p>
              <p className="mt-2 text-xs text-ink-dim">{L(`${budgets.filter((budget) => budget.status === "EXCEEDED").length} en dépassement`, `${budgets.filter((budget) => budget.status === "EXCEEDED").length} over budget`)}</p>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-300"><Landmark className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{L("Profils salariaux", "Salary profiles")}</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{salaryProfiles.length}</p>
              <p className="mt-2 text-xs text-ink-dim">{L(`${currency.format(safeOverview.payroll.totalPayroll)} de masse salariale`, `${currency.format(safeOverview.payroll.totalPayroll)} payroll mass`)}</p>
            </div>
            <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 text-brand-100"><Users className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{L("Passifs", "Liabilities")}</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{currency.format(safeOverview.liabilities.supplierDebt + safeOverview.liabilities.payrollLiability)}</p>
              <p className="mt-2 text-xs text-ink-dim">{L("Obligations salariales et fournisseurs", "Payroll and supplier obligations")}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300"><AlertTriangle className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {operationModules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.value}
              type="button"
              onClick={() => {
                setActiveTab(module.value);
                setActiveDialog(module.value);
                setActiveSubDialog(null);
              }}
              className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left shadow-lg transition hover:border-brand-300/30 hover:bg-white/[0.075]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${module.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="font-display text-xl font-bold text-white">{module.title}</span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-ink-dim">{module.count}</span>
                  </span>
                  <span className="mt-2 block text-sm text-ink-dim">{module.description}</span>
                  <span className="mt-4 flex min-w-0 items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-brand-100">
                    <span>{module.metric}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 normal-case tracking-normal text-white group-hover:border-brand-300/30">{L("Ouvrir", "Open")}</span>
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {!canWrite && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Votre role est en lecture seule. Les formulaires de creation restent masques, mais les journaux et statuts restent consultables.
        </div>
      )}

      {actionError && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{actionError}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>}

      {activeDialog && activeModule && (
        <OperationsDialog title={activeModule.title} subtitle={activeModule.description} onClose={handleCloseOperationsDialog}>
      {activeTab === "expenses" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title="Workflow des depenses" subtitle="Recherche, suivi de statut et traitement des approbations en cours.">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une depense, un service, un fournisseur..." />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input min-w-[180px]">
                  <option value="ALL">Tous les statuts</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div className="mt-5 space-y-3">
                {filteredExpenses.map((expense) => {
                  const currentStep = expense.approvalSteps.find((step) => step.status === "PENDING");
                  return (
                    <article key={expense.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{expense.title}</p>
                          <p className="mt-1 text-xs text-ink-dim">{expense.department} • {expense.category.name} • {new Date(expense.expenseDate).toLocaleDateString("fr-FR")}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={expense.status} />
                          <span className="font-mono text-sm font-bold text-white">{currency.format(expense.amount)}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
                        <div>
                          <p className="text-ink-dim">Budget</p>
                          <p className="font-semibold text-white">{expense.budget?.name ?? "Hors budget"}</p>
                        </div>
                        <div>
                          <p className="text-ink-dim">Fournisseur</p>
                          <p className="font-semibold text-white">{expense.vendor?.name ?? expense.supplierName ?? "Non precise"}</p>
                        </div>
                        <div>
                          <p className="text-ink-dim">Etape courante</p>
                          <p className="font-semibold text-white">{currentStep ? `${currentStep.role} / stage ${currentStep.stage}` : "Workflow termine"}</p>
                        </div>
                      </div>
                      {expense.comments && <p className="mt-3 text-sm text-ink-dim">{expense.comments}</p>}
                      {!!expense.attachments?.length && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-dim">
                          {expense.attachments.map((attachment) => (
                            <button
                              key={attachment.id}
                              onClick={() => openDocument(attachment.fileUrl)}
                              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 hover:border-brand-300/25 hover:text-white"
                            >
                              Piece: {attachment.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                      {currentStep && canWrite && (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={() => void handleApproval(expense.id, "APPROVED")}
                            disabled={submittingKey === `approval-${expense.id}-APPROVED`}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Valider l'etape
                          </button>
                          <button
                            onClick={() => void handleApproval(expense.id, "REJECTED")}
                            disabled={submittingKey === `approval-${expense.id}-REJECTED`}
                            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
                {!filteredExpenses.length && <p className="text-sm text-ink-dim">Aucune depense ne correspond au filtre actuel.</p>}
              </div>
            </SectionCard>

            <SectionCard title="Arborescence des actions" subtitle="Choisissez une branche, puis travaillez dans une boite de dialogue dediee.">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
                    <div>
                      <p className="font-semibold text-white">Depenses</p>
                      <p className="mt-1 text-sm text-ink-dim">Workflow principal: consulter, filtrer, valider ou rejeter les demandes.</p>
                    </div>
                  </div>
                </div>
                {canWrite && (
                  <>
                    <ActionNodeCard
                      title="Nouvelle depense"
                      subtitle="Sortie de cash, budget, fournisseur et justificatifs."
                      detail={`${leafCategories.length} categories disponibles`}
                      icon={FilePlus2}
                      tone="border-red-400/25 bg-red-500/10 text-red-200"
                      onClick={() => setActiveSubDialog("expense-create")}
                    />
                    <ActionNodeCard
                      title="Nouveau fournisseur"
                      subtitle="Creer un tiers payable avant de lier une depense."
                      detail={`${vendors.length} fournisseurs actifs`}
                      icon={UserPlus}
                      tone="border-brand-300/25 bg-brand-500/10 text-brand-100"
                      onClick={() => setActiveSubDialog("vendor-create")}
                    />
                  </>
                )}
                <ActionNodeCard
                  title="Justificatifs"
                  subtitle="Voir les pieces indexees dans la branche Documents."
                  detail={`${documentEntries.length} piece(s)`}
                  icon={BriefcaseBusiness}
                  tone="border-amber-300/25 bg-amber-500/10 text-amber-100"
                  onClick={() => setActiveTab("documents")}
                />
              </div>
            </SectionCard>
          </div>

          {activeSubDialog === "expense-create" && canWrite && (
            <OperationsSubDialog title="Nouvelle depense" subtitle="Soumettre une sortie de cash avec categorie, budget et piece justificative." onClose={() => setActiveSubDialog(null)}>
              <form className="grid gap-3" onSubmit={handleCreateExpense}>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Titre
                      <input className="input" value={expenseForm.title} onChange={(event) => setExpenseForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Achat de fournitures" required />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Categorie
                        <select className="input" value={expenseForm.categoryId} onChange={(event) => setExpenseForm((current) => ({ ...current, categoryId: event.target.value }))} required>
                          <option value="">Choisir la categorie de la sortie</option>
                          {leafCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Budget associe
                        <select className="input" value={expenseForm.budgetId} onChange={(event) => setExpenseForm((current) => ({ ...current, budgetId: event.target.value }))}>
                          <option value="">Aucun budget lie</option>
                          {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Fournisseur existant
                        <select className="input" value={expenseForm.vendorId} onChange={(event) => setExpenseForm((current) => ({ ...current, vendorId: event.target.value }))}>
                          <option value="">Aucun fournisseur existant</option>
                          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Fournisseur libre
                        <input className="input" value={expenseForm.supplierName} onChange={(event) => setExpenseForm((current) => ({ ...current, supplierName: event.target.value }))} placeholder="Nom si le fournisseur n'existe pas encore" />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Departement
                        <input className="input" value={expenseForm.department} onChange={(event) => setExpenseForm((current) => ({ ...current, department: event.target.value }))} placeholder="Ex: Administration, Transport, Academique" required />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Montant
                        <input className="input" type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Montant en USD" required />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Mode de paiement
                        <select className="input" value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                          <option value="">Non precise</option>
                          {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Date de la depense
                        <input className="input" type="date" value={expenseForm.expenseDate} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))} required />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Nom de la piece
                        <input className="input" value={expenseForm.attachmentName} onChange={(event) => setExpenseForm((current) => ({ ...current, attachmentName: event.target.value }))} placeholder="Ex: Facture, bon de livraison" />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                        Reference document
                        <input className="input" value={expenseForm.attachmentUrl} onChange={(event) => setExpenseForm((current) => ({ ...current, attachmentUrl: event.target.value }))} placeholder="URL, numero ou reference interne" />
                      </label>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-dim">Depot documentaire</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={handleAttachmentSelection}
                        className="mt-3 block w-full text-sm text-ink-dim file:mr-4 file:rounded-xl file:border-0 file:bg-brand-500/15 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-brand-500/25"
                      />
                      {!!pendingAttachments.length && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {pendingAttachments.map((attachment) => (
                            <button
                              type="button"
                              key={attachment.id}
                              onClick={() => removePendingAttachment(attachment.id)}
                              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-ink-dim hover:text-white"
                            >
                              {attachment.fileName} ×
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Commentaires
                      <textarea className="input min-h-24" value={expenseForm.comments} onChange={(event) => setExpenseForm((current) => ({ ...current, comments: event.target.value }))} placeholder="Motif, periode concernee, validation attendue..." />
                    </label>
                    <button type="submit" disabled={submittingKey === "expense"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                      Soumettre la depense
                    </button>
              </form>
            </OperationsSubDialog>
          )}

          {activeSubDialog === "vendor-create" && canWrite && (
            <OperationsSubDialog title="Nouveau fournisseur" subtitle="Creer un tiers payable pour les achats, abonnements et utilities." onClose={() => setActiveSubDialog(null)}>
              <form className="grid gap-3" onSubmit={handleCreateVendor}>
                    <input className="input" value={vendorForm.name} onChange={(event) => setVendorForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom fournisseur" required />
                    <input className="input" value={vendorForm.phone} onChange={(event) => setVendorForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telephone" />
                    <input className="input" value={vendorForm.email} onChange={(event) => setVendorForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                    <input className="input" value={vendorForm.address} onChange={(event) => setVendorForm((current) => ({ ...current, address: event.target.value }))} placeholder="Adresse" />
                    <textarea className="input min-h-20" value={vendorForm.notes} onChange={(event) => setVendorForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes fournisseur" />
                    <button type="submit" disabled={submittingKey === "vendor"} className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500/20 disabled:opacity-60">
                      Ajouter le fournisseur
                    </button>
              </form>
            </OperationsSubDialog>
          )}
        </div>
      )}

      {activeTab === "budgets" && (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          {canWrite && (
            <SectionCard title="Arborescence budgetaire" subtitle="Les actions d'ecriture s'ouvrent dans une boite dediee, le suivi reste visible.">
              <div className="grid gap-3">
                <ActionNodeCard
                  title="Nouveau budget"
                  subtitle="Planifier une enveloppe avec departement, categorie et seuil."
                  detail={`${budgets.length} budget(s) existant(s)`}
                  icon={WalletCards}
                  tone="border-cyan-400/25 bg-cyan-500/10 text-cyan-200"
                  onClick={openBudgetDialog}
                />
                <ActionNodeCard
                  title="Dépenses liées"
                  subtitle="Retourner vers le workflow pour relier les budgets aux sorties."
                  detail={`${expenseStats.pending} validation(s)`}
                  icon={ReceiptText}
                  tone="border-red-400/25 bg-red-500/10 text-red-200"
                  onClick={() => setActiveTab("expenses")}
                />
              </div>
            </SectionCard>
          )}

          <SectionCard title="Pilotage budgetaire" subtitle="Lecture planned vs actual, taux de consommation et depassements detectes.">
            <div className="space-y-3">
              {budgets.map((budget) => (
                <article key={budget.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{budget.name}</p>
                      <p className="mt-1 text-xs text-ink-dim">{budget.department} • {budget.period?.name ?? "Periode active"} • {budget.category?.name ?? "Budget global"}</p>
                    </div>
                    <StatusBadge value={budget.status} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="text-ink-dim">Prevu</p>
                      <p className="font-semibold text-white">{currency.format(budget.plannedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-ink-dim">Consomme</p>
                      <p className="font-semibold text-amber-200">{currency.format(budget.consumedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-ink-dim">Reste</p>
                      <p className="font-semibold text-emerald-300">{currency.format(budget.remainingAmount)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${budget.utilization >= 100 ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-brand-500 to-cyan-400"}`} style={{ width: `${Math.min(100, Math.max(0, budget.utilization))}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-dim">Utilisation: {budget.utilization.toFixed(1)}%</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {activeTab === "payroll" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            {canWrite && (
              <SectionCard title="Arborescence paie" subtitle="Separez les profils RH du lancement de paie pour garder la lecture claire.">
                <div className="grid gap-3">
                  <ActionNodeCard
                    title="Profil salarial"
                    subtitle="Base salariale, bonus, deductions et recovery rate."
                    detail={`${salaryProfiles.length} profil(s) actif(s)`}
                    icon={Users}
                    tone="border-brand-300/25 bg-brand-500/10 text-brand-100"
                    onClick={openSalaryProfileDialog}
                  />
                  <ActionNodeCard
                    title="Lancer une paie"
                    subtitle="Generer un run depuis les profils salariaux actifs."
                    detail={`${payrollRuns.length} run(s)`}
                    icon={CircleDollarSign}
                    tone="border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                    onClick={() => setActiveSubDialog("payroll-run-create")}
                  />
                </div>
              </SectionCard>
            )}

            <SectionCard title="Profils actifs" subtitle="Base des salaries utilises pour calculer la paie institutionnelle.">
              <div className="space-y-3">
                {salaryProfiles.map((profile) => (
                  <div key={profile.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{profile.fullName}</p>
                        <p className="mt-1 text-xs text-ink-dim">{profile.position} • {profile.department} • {labelizeFrequency(profile.frequency)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-white">{currency.format(profile.baseSalary)}</p>
                        <p className="text-xs text-ink-dim">{profile.employeeCode}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Historique de paie" subtitle="Runs generes, masse nette et nombre de bulletins salaries.">
              <div className="space-y-3">
                {payrollRuns.map((run) => (
                  <article key={run.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{run.title}</p>
                        <p className="mt-1 text-xs text-ink-dim">{run.department || "Tous departements"} • {run.period?.name ?? "Periode active"} • {labelizeFrequency(run.frequency)}</p>
                      </div>
                      <StatusBadge value={run.status} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                      <div>
                        <p className="text-ink-dim">Net</p>
                        <p className="font-semibold text-white">{currency.format(run.totalNet)}</p>
                      </div>
                      <div>
                        <p className="text-ink-dim">Deductions</p>
                        <p className="font-semibold text-amber-200">{currency.format(run.totalDeductions)}</p>
                      </div>
                      <div>
                        <p className="text-ink-dim">Bulletins</p>
                        <p className="font-semibold text-cyan-200">{run.items.length}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-dim">
                      {run.items.slice(0, 4).map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => printSalarySlip(run, item)}
                            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 hover:border-brand-300/25 hover:text-white"
                          >
                            {item.salaryProfile.fullName} • {item.salarySlipNumber}
                          </button>
                          <button
                            onClick={() => exportSalarySlipExcel(run, item)}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-200 hover:bg-emerald-500/20"
                          >
                            <Download className="h-3.5 w-3.5" /> Excel
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                {!payrollRuns.length && <p className="text-sm text-ink-dim">Aucun run de paie genere pour l'instant.</p>}
              </div>
            </SectionCard>
          </div>

          {activeSubDialog === "salary-profile-create" && canWrite && (
            <OperationsSubDialog title="Profil salarial" subtitle="Créer un profil de paie clair, sans valeurs injectées d'avance, pour les futurs runs." onClose={() => setActiveSubDialog(null)}>
              <form className="grid gap-5" onSubmit={handleCreateSalaryProfile}>
                <div className="rounded-2xl border border-brand-300/15 bg-brand-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Profil de rémunération</p>
                  <p className="mt-2 text-sm text-ink-dim">Renseignez explicitement les champs utiles. Les éléments optionnels laissés vides seront gérés par défaut côté système.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Code employé
                    <input className="input" value={salaryForm.employeeCode} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeCode: event.target.value }))} placeholder="Ex: EMP-ACAD-004" required />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Nom complet
                    <input className="input" value={salaryForm.fullName} onChange={(event) => setSalaryForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Ex: Grâce Mukendi" required />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Département
                    <input className="input" value={salaryForm.department} onChange={(event) => setSalaryForm((current) => ({ ...current, department: event.target.value }))} placeholder="Ex: Académique" required />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Poste
                    <input className="input" value={salaryForm.position} onChange={(event) => setSalaryForm((current) => ({ ...current, position: event.target.value }))} placeholder="Ex: Enseignant de mathématiques" required />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Salaire de base
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.baseSalary} onChange={(event) => setSalaryForm((current) => ({ ...current, baseSalary: event.target.value }))} placeholder="Ex: 450" required />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Fréquence de paie
                    <select className="input" value={salaryForm.frequency} onChange={(event) => setSalaryForm((current) => ({ ...current, frequency: event.target.value }))}>
                      <option value="">Laisser le système appliquer le mensuel par défaut</option>
                      {PAYROLL_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{labelizeFrequency(frequency)}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Bonus par défaut
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.defaultBonus} onChange={(event) => setSalaryForm((current) => ({ ...current, defaultBonus: event.target.value }))} placeholder="Ex: 25" />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Déduction par défaut
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.defaultDeduction} onChange={(event) => setSalaryForm((current) => ({ ...current, defaultDeduction: event.target.value }))} placeholder="Ex: 15" />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Taux de recouvrement (%)
                    <input className="input" type="number" min="0" max="100" step="0.01" value={salaryForm.debtRecoveryRate} onChange={(event) => setSalaryForm((current) => ({ ...current, debtRecoveryRate: event.target.value }))} placeholder="Ex: 5" />
                  </label>
                </div>

                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                  Notes RH
                  <textarea className="input min-h-24" value={salaryForm.notes} onChange={(event) => setSalaryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Informations utiles sur ce profil salarial" />
                </label>

                <div className="flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={() => setActiveSubDialog(null)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10">
                    Annuler
                  </button>
                  <button type="submit" disabled={submittingKey === "salary"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                    Ajouter le profil salarial
                  </button>
                </div>
              </form>
            </OperationsSubDialog>
          )}

          {activeSubDialog === "payroll-run-create" && canWrite && (
            <OperationsSubDialog title="Lancer une paie" subtitle="Genere un run avec calcul net et sorties de cash correspondantes." onClose={() => setActiveSubDialog(null)}>
              <form className="grid gap-3" onSubmit={handleCreatePayrollRun}>
                <input className="input" value={payrollForm.title} onChange={(event) => setPayrollForm((current) => ({ ...current, title: event.target.value }))} placeholder="Titre du run" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="input" value={payrollForm.department} onChange={(event) => setPayrollForm((current) => ({ ...current, department: event.target.value }))} placeholder="Departement cible (optionnel)" />
                  <select className="input" value={payrollForm.frequency} onChange={(event) => setPayrollForm((current) => ({ ...current, frequency: event.target.value }))}>
                    {PAYROLL_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{labelizeFrequency(frequency)}</option>)}
                  </select>
                </div>
                <textarea className="input min-h-24" value={payrollForm.notes} onChange={(event) => setPayrollForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes du run" />
                <button type="submit" disabled={submittingKey === "payroll"} className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500/20 disabled:opacity-60">
                  Generer la paie
                </button>
              </form>
            </OperationsSubDialog>
          )}
        </div>
      )}

      {activeTab === "accounting" && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Lecture comptable" subtitle="Journal des ecritures generees par les depenses et la paie.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Total ecritures</p>
                <p className="mt-2 text-2xl font-bold text-white">{accountingEntries.length}</p>
                <p className="mt-2 text-xs text-ink-dim">Cardinal du journal comptable actif.</p>
              </div>
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Volume comptabilisé</p>
                <p className="mt-2 text-2xl font-bold text-red-300">{currency.format(accountingMetrics.totalVolume)}</p>
                <p className="mt-2 text-xs text-red-100/80">Somme scientifique de toutes les écritures enregistrées.</p>
              </div>
              <div className="rounded-2xl border border-brand-400/20 bg-brand-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Ticket moyen</p>
                <p className="mt-2 text-2xl font-bold text-white">{currency.format(accountingMetrics.averageEntry)}</p>
                <p className="mt-2 text-xs text-brand-100/80">Moyenne = volume comptabilisé / nombre d'écritures.</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Part paie</p>
                <p className="mt-2 text-2xl font-bold text-cyan-100">{formatPercent(accountingMetrics.payrollWeight)}</p>
                <p className="mt-2 text-xs text-cyan-100/80">{currency.format(accountingMetrics.payrollVolume)} imputés à la masse salariale.</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Département dominant</p>
                <p className="mt-2 text-lg font-bold text-white">{accountingMetrics.topDepartmentName}</p>
                <p className="mt-2 text-xs text-amber-100/80">{formatPercent(accountingMetrics.topDepartmentWeight)} du volume comptable total.</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Couverture documentaire</p>
                <p className="mt-2 text-2xl font-bold text-emerald-200">{formatPercent(accountingMetrics.documentationCoverage)}</p>
                <p className="mt-2 text-xs text-emerald-100/80">Pièces jointes présentes sur les dépenses source.</p>
              </div>
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Taux d'approbation</p>
                <p className="mt-2 text-2xl font-bold text-violet-100">{formatPercent(accountingMetrics.approvalCoverage)}</p>
                <p className="mt-2 text-xs text-violet-100/80">Dépenses approuvées sur l'ensemble du pipeline.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Journal general" subtitle="Chaque ligne relie la comptabilisation a son objet source.">
            <div className="mb-4 flex flex-wrap gap-3">
              <SearchField value={accountingSearch} onChange={(event) => setAccountingSearch(event.target.value)} placeholder="Rechercher une écriture, un département ou une source..." />
              <select value={accountingDepartmentFilter} onChange={(event) => setAccountingDepartmentFilter(event.target.value)} className="input min-w-[220px]">
                <option value="ALL">Tous les départements</option>
                {accountingDepartmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </div>
            <div className="mb-4 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Répartition par département</p>
                <div className="mt-3 space-y-2">
                  {accountingBreakdown.slice(0, 5).map((entry) => (
                    <div key={entry.department} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-white">{entry.department}</p>
                        <p className="text-xs text-ink-dim">{entry.count} écriture(s) • moyenne {currency.format(entry.average)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-white">{currency.format(entry.volume)}</p>
                        <p className="text-xs text-brand-100">{formatPercent(entry.weight)}</p>
                      </div>
                    </div>
                  ))}
                  {!accountingBreakdown.length && <p className="text-sm text-ink-dim">Aucune écriture pour le filtre actuel.</p>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Actions du journal</p>
                <div className="mt-3 flex flex-wrap gap-2 xl:flex-col xl:items-stretch">
                  <button onClick={printAccountingReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-300/25 bg-brand-500/10 px-4 py-2.5 text-sm font-semibold text-white hover:border-brand-200/40 hover:bg-brand-500/20">
                    <Printer className="h-4 w-4" /> Imprimer le journal
                  </button>
                  <button onClick={exportAccountingExcel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20">
                    <Download className="h-4 w-4" /> Export Excel
                  </button>
                  <button onClick={exportAccountingCsv} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-ink-dim hover:border-brand-300/25 hover:text-white hover:bg-brand-500/10">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {filteredAccountingEntries.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{entry.title}</p>
                      <p className="mt-1 text-xs text-ink-dim">{entry.entryType} • {entry.department || "Departement non renseigne"} • {new Date(entry.entryDate).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={entry.direction} />
                      <span className="font-mono text-sm font-bold text-white">{currency.format(entry.amount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-dim">
                    {entry.expense && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Depense: {entry.expense.title}</span>}
                    {entry.payrollRun && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Run: {entry.payrollRun.title}</span>}
                    {entry.payrollItem && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Fiche: {entry.payrollItem.salarySlipNumber}</span>}
                  </div>
                </article>
              ))}
              {!filteredAccountingEntries.length && <p className="text-sm text-ink-dim">Aucune ecriture comptable disponible pour le filtre actuel.</p>}
            </div>
          </SectionCard>
        </div>
      )}

      {activeTab === "cashflow" && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Tresorerie" subtitle="Journal des sorties et mouvements de cash relies aux operations financieres.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Lignes de tresorerie</p>
                <p className="mt-2 text-2xl font-bold text-white">{cashflowEntries.length}</p>
                <p className="mt-2 text-xs text-ink-dim">Nombre d'enregistrements utilisés pour la lecture de cashflow.</p>
              </div>
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Sorties cumulees</p>
                <p className="mt-2 text-2xl font-bold text-red-300">{currency.format(cashflowMetrics.totalOutflow)}</p>
                <p className="mt-2 text-xs text-red-100/80">Flux sortants consolidés du journal de trésorerie.</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Balance disponible</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">{currency.format(safeOverview.cashflow.availableCash)}</p>
                <p className="mt-2 text-xs text-emerald-100/80">Encaisse encore disponible après les sorties enregistrées.</p>
              </div>
              <div className="rounded-2xl border border-brand-400/20 bg-brand-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Ticket moyen sortie</p>
                <p className="mt-2 text-2xl font-bold text-white">{currency.format(cashflowMetrics.averageOutflow)}</p>
                <p className="mt-2 text-xs text-brand-100/80">Moyenne des opérations classées OUTFLOW.</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Part paie</p>
                <p className="mt-2 text-2xl font-bold text-cyan-100">{formatPercent(cashflowMetrics.payrollShare)}</p>
                <p className="mt-2 text-xs text-cyan-100/80">{currency.format(cashflowMetrics.payrollOutflow)} sortis pour la paie.</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Couverture cash</p>
                <p className="mt-2 text-2xl font-bold text-amber-100">{cashflowMetrics.coverageRatio.toFixed(2)}x</p>
                <p className="mt-2 text-xs text-amber-100/80">Ratio = cash disponible / sorties consolidées.</p>
              </div>
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Source dominante</p>
                <p className="mt-2 text-lg font-bold text-white">{cashflowMetrics.dominantSourceName}</p>
                <p className="mt-2 text-xs text-violet-100/80">{formatPercent(cashflowMetrics.dominantSourceWeight)} du volume de trésorerie.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Journal de cashflow" subtitle="Reference, source, moyen de paiement et notes operationnelles.">
            <div className="mb-4 flex flex-wrap gap-3">
              <SearchField value={cashflowSearch} onChange={(event) => setCashflowSearch(event.target.value)} placeholder="Rechercher une source, une méthode, une référence ou une note..." />
              <select value={cashflowSourceFilter} onChange={(event) => setCashflowSourceFilter(event.target.value)} className="input min-w-[220px]">
                <option value="ALL">Toutes les sources</option>
                {cashflowSourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </div>
            <div className="mb-4 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">Répartition par source</p>
                <div className="mt-3 space-y-2">
                  {cashflowBreakdown.slice(0, 5).map((entry) => (
                    <div key={entry.sourceType} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-white">{entry.sourceType}</p>
                        <p className="text-xs text-ink-dim">{entry.count} ligne(s) • moyenne {currency.format(entry.average)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-white">{currency.format(entry.volume)}</p>
                        <p className="text-xs text-cyan-100">{formatPercent(entry.weight)}</p>
                      </div>
                    </div>
                  ))}
                  {!cashflowBreakdown.length && <p className="text-sm text-ink-dim">Aucun flux pour le filtre actuel.</p>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">Actions trésorerie</p>
                <div className="mt-3 flex flex-wrap gap-2 xl:flex-col xl:items-stretch">
                  <button onClick={printCashflowReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-white hover:border-cyan-200/40 hover:bg-cyan-500/20">
                    <Printer className="h-4 w-4" /> Imprimer le journal
                  </button>
                  <button onClick={exportCashflowExcel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20">
                    <Download className="h-4 w-4" /> Export Excel
                  </button>
                  <button onClick={exportCashflowCsv} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-ink-dim hover:border-brand-300/25 hover:text-white hover:bg-brand-500/10">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {filteredCashflowEntries.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{entry.sourceType}</p>
                      <p className="mt-1 text-xs text-ink-dim">{new Date(entry.referenceDate).toLocaleDateString("fr-FR")} • {entry.method || "Sans methode"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={entry.direction} />
                      <span className="font-mono text-sm font-bold text-white">{currency.format(entry.amount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-dim">
                    {entry.expense && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Depense: {entry.expense.title}</span>}
                    {entry.payrollRun && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Paie: {entry.payrollRun.title}</span>}
                    {entry.payrollItem && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Fiche: {entry.payrollItem.salarySlipNumber}</span>}
                  </div>
                  {entry.notes && <p className="mt-3 text-sm text-ink-dim">{entry.notes}</p>}
                </article>
              ))}
              {!filteredCashflowEntries.length && <p className="text-sm text-ink-dim">Aucun mouvement de tresorerie disponible pour le filtre actuel.</p>}
            </div>
          </SectionCard>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Depot documentaire" subtitle="Toutes les pieces justificatives attachees aux depenses sont visibles ici.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Documents indexes</p>
                <p className="mt-2 text-2xl font-bold text-white">{documentEntries.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Depenses documentees</p>
                <p className="mt-2 text-2xl font-bold text-white">{expenses.filter((expense) => (expense.attachments?.length ?? 0) > 0).length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-ink-dim">
                Ajoutez des justificatifs depuis l'onglet Depenses avec un vrai upload de fichiers ou une reference URL.
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Pieces justificatives" subtitle="Ouverture directe, telechargement et contexte de la depense associee.">
            <div className="space-y-3">
              {documentEntries.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{entry.fileName}</p>
                      <p className="mt-1 text-xs text-ink-dim">{entry.expenseTitle} • {entry.department} • {new Date(entry.expenseDate).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <StatusBadge value={entry.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => openDocument(entry.fileUrl)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/25 hover:bg-brand-500/10">
                      Ouvrir
                    </button>
                    <button onClick={() => downloadDocument(entry)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/25 hover:bg-brand-500/10">
                      Telecharger
                    </button>
                  </div>
                </article>
              ))}
              {!documentEntries.length && <p className="text-sm text-ink-dim">Aucune piece justificative indexee pour le moment.</p>}
            </div>
          </SectionCard>

        </div>
      )}

      {activeSubDialog === "budget-create" && canWrite && (
        <OperationsSubDialog
          title="Nouveau budget"
          subtitle="Créer une enveloppe budgétaire claire, avec un département, une catégorie, un montant planifié et un seuil d'alerte." 
          onClose={() => setActiveSubDialog(null)}
        >
          <form className="grid gap-6" onSubmit={handleCreateBudget}>
            <div className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/14 via-slate-950 to-slate-950 shadow-xl">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">Budget workspace</p>
                  <h4 className="mt-2 font-display text-2xl font-bold text-white">Créer une enveloppe budgétaire propre et traçable</h4>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-dim">
                    Renseignez manuellement chaque champ important pour éviter les budgets implicites, mal catégorisés ou mal ventilés.
                  </p>
                </div>
                <div className="grid gap-2 text-xs sm:min-w-[220px]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white">
                    <p className="font-black uppercase tracking-[0.16em] text-cyan-100">Champs clés</p>
                    <p className="mt-1 text-ink-dim">Nom, département, montant, catégorie, seuil d'alerte.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white">
                    <p className="font-black uppercase tracking-[0.16em] text-cyan-100">Résultat attendu</p>
                    <p className="mt-1 text-ink-dim">Un budget exploitable immédiatement dans le suivi des dépenses.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-lg">
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Identité du budget</p>
                  <h4 className="mt-2 text-lg font-bold text-white">Informations principales</h4>
                  <p className="mt-1 text-sm text-ink-dim">Définissez clairement le nom, le département et le volume financier prévu.</p>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Nom du budget
                    <input
                      className="input"
                      value={budgetForm.name}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ex: Budget transport T3 2026"
                      required
                    />
                    <span className="text-[11px] normal-case tracking-normal text-ink-dim">Nom lisible dans les journaux, les tableaux et les exports.</span>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Département concerné
                      <input
                        className="input"
                        value={budgetForm.department}
                        onChange={(event) => setBudgetForm((current) => ({ ...current, department: event.target.value }))}
                        placeholder="Ex: Administration, Académique, Transport"
                        required
                      />
                      <span className="text-[11px] normal-case tracking-normal text-ink-dim">Service ou unité qui consommera ce budget.</span>
                    </label>

                    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Montant planifié
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetForm.plannedAmount}
                        onChange={(event) => setBudgetForm((current) => ({ ...current, plannedAmount: event.target.value }))}
                        placeholder="Ex: 2500"
                        required
                      />
                      <span className="text-[11px] normal-case tracking-normal text-ink-dim">Montant total prévu pour l'enveloppe, en USD.</span>
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-lg">
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Pilotage</p>
                  <h4 className="mt-2 text-lg font-bold text-white">Catégorisation et suivi</h4>
                  <p className="mt-1 text-sm text-ink-dim">Préparez le budget pour le suivi analytique et les alertes de consommation.</p>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Catégorie associée
                    <select
                      className="input"
                      value={budgetForm.categoryId}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, categoryId: event.target.value }))}
                    >
                      <option value="">Choisir une catégorie principale</option>
                      {categories.filter((category) => !category.parentCategoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <span className="text-[11px] normal-case tracking-normal text-ink-dim">Permet d'ancrer le budget dans une famille de dépenses.</span>
                  </label>

                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Seuil d'alerte (%)
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="100"
                      value={budgetForm.alertThreshold}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, alertThreshold: event.target.value }))}
                      placeholder="Ex: 80"
                    />
                    <span className="text-[11px] normal-case tracking-normal text-ink-dim">Déclenche une alerte visuelle lorsque la consommation approche la limite.</span>
                  </label>

                  <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">
                    Notes budgétaires
                    <textarea
                      className="input min-h-32"
                      value={budgetForm.notes}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Contexte, période couverte, justification, limites ou remarques de gestion"
                    />
                    <span className="text-[11px] normal-case tracking-normal text-ink-dim">Visible pour garder une trace de la logique budgétaire choisie.</span>
                  </label>
                </div>
              </section>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => setActiveSubDialog(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10"
              >
                Annuler
              </button>
              <button type="submit" disabled={submittingKey === "budget"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                Enregistrer le budget
              </button>
            </div>
          </form>
        </OperationsSubDialog>
      )}
        </OperationsDialog>
      )}
    </div>
  );
}
