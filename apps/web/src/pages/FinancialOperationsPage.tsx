import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Landmark,
  Printer,
  ReceiptText,
  Users
} from "lucide-react";
import { SearchField } from "../components/SearchField";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";
import { exportWorkbook } from "../utils/financeExcel";

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

const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "MPESA", "AIRTEL_MONEY", "ORANGE_MONEY", "CHEQUE", "INTERNAL_TRANSFER"];
const PAYROLL_FREQUENCIES = ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "ANNUAL"];

const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  title: "",
  categoryId: "",
  vendorId: "",
  budgetId: "",
  department: "Administration",
  amount: "",
  paymentMethod: "CASH",
  expenseDate: new Date().toISOString().slice(0, 10),
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
  department: "Administration",
  plannedAmount: "",
  categoryId: "",
  alertThreshold: "80",
  notes: ""
};

const EMPTY_SALARY_FORM: SalaryFormState = {
  employeeCode: "",
  fullName: "",
  department: "Administration",
  position: "",
  baseSalary: "",
  frequency: "MONTHLY",
  defaultBonus: "0",
  defaultDeduction: "0",
  debtRecoveryRate: "0",
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
    <section className="card glass border border-white/10 shadow-lg">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
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
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{value}</span>;
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

export function FinancialOperationsPage() {
  const role = useAuthStore((state) => state.role);
  const canWrite = role !== "AUDITOR" && role !== "PARENT";
  const currency = useMemo(() => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }), []);

  const [activeTab, setActiveTab] = useState<"expenses" | "budgets" | "payroll" | "accounting" | "cashflow" | "documents">("expenses");
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
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [pendingAttachments, setPendingAttachments] = useState<ExpenseAttachment[]>([]);
  const [vendorForm, setVendorForm] = useState<VendorFormState>(EMPTY_VENDOR_FORM);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(EMPTY_BUDGET_FORM);
  const [salaryForm, setSalaryForm] = useState<SalaryFormState>(EMPTY_SALARY_FORM);
  const [payrollForm, setPayrollForm] = useState<PayrollFormState>(EMPTY_PAYROLL_FORM);

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

  function printSalarySlip(run: PayrollRun, item: PayrollRun["items"][number]) {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=920,height=720");
    if (!printWindow) {
      setActionError("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Fiche salariale ${item.salarySlipNumber}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
    .sheet { max-width: 780px; margin: 0 auto; background: white; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; }
    .hero { padding: 28px; background: linear-gradient(135deg, #082f49, #0f172a); color: white; }
    .hero h1 { margin: 8px 0 0; font-size: 28px; }
    .hero p { margin: 6px 0 0; color: #cbd5e1; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 24px 28px 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
    .value { margin-top: 8px; font-size: 18px; font-weight: 700; }
    .table-wrap { padding: 0 28px 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 13px; }
    th { color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
    .foot { padding: 0 28px 28px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div class="label">EduPay Smart System</div>
      <h1>Fiche salariale</h1>
      <p>${item.salaryProfile.fullName} • ${item.salaryProfile.position} • ${run.period?.name ?? "Periode active"}</p>
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
    <div class="foot">Document genere par EduPay Financial ERP le ${new Date().toLocaleDateString("fr-FR")}.</div>
  </div>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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

  function printLedgerReport(title: string, subtitle: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1080,height=780");
    if (!printWindow) {
      setActionError("Impossible d'ouvrir la fenetre d'impression.");
      return;
    }

    const headHtml = headers.map((header) => `<th>${header}</th>`).join("");
    const rowsHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? "")}</td>`).join("")}</tr>`).join("");
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #f8fafc; }
    .sheet { background: white; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; }
    .hero { background: linear-gradient(135deg, #082f49, #0f172a); color: white; padding: 24px 28px; }
    .hero h1 { margin: 0; font-size: 26px; }
    .hero p { margin: 8px 0 0; color: #cbd5e1; }
    .table-wrap { padding: 24px 28px 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; font-size: 12px; }
    th { background: #f8fafc; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
    .foot { padding: 0 28px 24px; color: #475569; font-size: 12px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="foot">Document genere le ${new Date().toLocaleDateString("fr-FR")} par EduPay Financial ERP.</div>
  </div>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function exportAccountingCsv() {
    downloadCsv(
      `journal-comptable-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Direction", "Titre", "Departement", "Montant", "Devise", "Source"],
      accountingEntries.map((entry) => [
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
        name: "Journal comptable",
        rows: accountingEntries.map((entry) => ({
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
      cashflowEntries.map((entry) => [
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
        name: "Journal tresorerie",
        rows: cashflowEntries.map((entry) => ({
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
      ])
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
      ])
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
      setSuccess("Budget enregistre.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de creer le budget.");
    } finally {
      setSubmittingKey(null);
    }
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
          frequency: salaryForm.frequency,
          defaultBonus: Number(salaryForm.defaultBonus || 0),
          defaultDeduction: Number(salaryForm.defaultDeduction || 0),
          debtRecoveryRate: Number(salaryForm.debtRecoveryRate || 0),
          notes: salaryForm.notes
        })
      });
      setSalaryProfiles((current) => [created, ...current]);
      setSalaryForm(EMPTY_SALARY_FORM);
      setSuccess("Profil salarial ajoute.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de creer le profil salarial.");
    } finally {
      setSubmittingKey(null);
    }
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
      setSuccess("Run de paie genere.");
      await refreshOverview();
      await refreshLedgers();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Impossible de lancer la paie.");
    } finally {
      setSubmittingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">Chargement du centre operationnel financier...</p>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-xl rounded-2xl border border-red-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">Operations unavailable</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Les operations financieres ne sont pas disponibles</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? "Aucune donnee n'a ete renvoyee."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 animate-fadeInUp">
      <section className="glass border border-brand-300/15 px-6 py-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">EduPay Financial Operations</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">Centre operationnel des depenses, budgets et paie</h1>
            <p className="mt-3 text-sm text-ink-dim">
              Cet espace complete le cockpit ERP avec les operations executables: creation de depenses,
              fournisseurs, budgets, profils salariaux, runs de paie et validation des sorties de cash.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Cash disponible</p>
              <p className="mt-1 font-display text-2xl font-bold text-white">{currency.format(overview.cashflow.availableCash)}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Etapes en attente</p>
              <p className="mt-1 font-display text-2xl font-bold text-white">{overview.expenses.pendingApprovalSteps}</p>
            </div>
            <button onClick={exportOperationsWorkbook} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400/20 sm:col-span-2">
              <Download className="h-4 w-4" /> Exporter le pack Excel
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Depenses</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{currency.format(overview.expenses.totalExpenses)}</p>
              <p className="mt-2 text-xs text-ink-dim">{expenseStats.approved} approuvees, {expenseStats.pending} en attente</p>
            </div>
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-300"><ReceiptText className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Budgets</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{budgets.length}</p>
              <p className="mt-2 text-xs text-ink-dim">{budgets.filter((budget) => budget.status === "EXCEEDED").length} en depassement</p>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-300"><Landmark className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Profils salariaux</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{salaryProfiles.length}</p>
              <p className="mt-2 text-xs text-ink-dim">{currency.format(overview.payroll.totalPayroll)} de masse salariale</p>
            </div>
            <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 text-brand-100"><Users className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Passifs</p>
              <p className="mt-3 font-display text-2xl font-bold text-white">{currency.format(overview.liabilities.supplierDebt + overview.liabilities.payrollLiability)}</p>
              <p className="mt-2 text-xs text-ink-dim">Obligations salariales et fournisseurs</p>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300"><AlertTriangle className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        {[
          ["expenses", "Depenses", expenses.length],
          ["budgets", "Budgets", budgets.length],
          ["payroll", "Paie", payrollRuns.length],
          ["accounting", "Comptabilite", accountingEntries.length],
          ["cashflow", "Tresorerie", cashflowEntries.length],
          ["documents", "Documents", documentEntries.length]
        ].map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => setActiveTab(value as "expenses" | "budgets" | "payroll" | "accounting" | "cashflow" | "documents")}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${activeTab === value ? "border-brand-300/40 bg-brand-500/15 text-white" : "border-white/10 bg-white/[0.04] text-ink-dim hover:text-white"}`}
          >
            {label} <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">{count}</span>
          </button>
        ))}
      </section>

      {!canWrite && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Votre role est en lecture seule. Les formulaires de creation restent masques, mais les journaux et statuts restent consultables.
        </div>
      )}

      {actionError && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{actionError}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>}

      {activeTab === "expenses" && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
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
          </div>

          <div className="space-y-6">
            {canWrite && (
              <>
                <SectionCard title="Nouvelle depense" subtitle="Soumettre une sortie de cash avec categorie, budget et piece justificative.">
                  <form className="grid gap-3" onSubmit={handleCreateExpense}>
                    <input className="input" value={expenseForm.title} onChange={(event) => setExpenseForm((current) => ({ ...current, title: event.target.value }))} placeholder="Titre de la depense" required />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="input" value={expenseForm.categoryId} onChange={(event) => setExpenseForm((current) => ({ ...current, categoryId: event.target.value }))} required>
                        <option value="">Categorie</option>
                        {leafCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <select className="input" value={expenseForm.budgetId} onChange={(event) => setExpenseForm((current) => ({ ...current, budgetId: event.target.value }))}>
                        <option value="">Budget associe</option>
                        {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="input" value={expenseForm.vendorId} onChange={(event) => setExpenseForm((current) => ({ ...current, vendorId: event.target.value }))}>
                        <option value="">Fournisseur</option>
                        {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                      </select>
                      <input className="input" value={expenseForm.supplierName} onChange={(event) => setExpenseForm((current) => ({ ...current, supplierName: event.target.value }))} placeholder="Nom fournisseur libre" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="input" value={expenseForm.department} onChange={(event) => setExpenseForm((current) => ({ ...current, department: event.target.value }))} placeholder="Departement responsable" required />
                      <input className="input" type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Montant" required />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="input" value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                        {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                      <input className="input" type="date" value={expenseForm.expenseDate} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))} required />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="input" value={expenseForm.attachmentName} onChange={(event) => setExpenseForm((current) => ({ ...current, attachmentName: event.target.value }))} placeholder="Nom piece justificative" />
                      <input className="input" value={expenseForm.attachmentUrl} onChange={(event) => setExpenseForm((current) => ({ ...current, attachmentUrl: event.target.value }))} placeholder="URL ou reference document" />
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
                    <textarea className="input min-h-24" value={expenseForm.comments} onChange={(event) => setExpenseForm((current) => ({ ...current, comments: event.target.value }))} placeholder="Commentaires, notes, periode, justification..." />
                    <button type="submit" disabled={submittingKey === "expense"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                      Soumettre la depense
                    </button>
                  </form>
                </SectionCard>

                <SectionCard title="Nouveau fournisseur" subtitle="Creer un tiers payable pour les achats, abonnements et utilities.">
                  <form className="grid gap-3" onSubmit={handleCreateVendor}>
                    <input className="input" value={vendorForm.name} onChange={(event) => setVendorForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom fournisseur" required />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="input" value={vendorForm.contactName} onChange={(event) => setVendorForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Contact" />
                      <input className="input" value={vendorForm.phone} onChange={(event) => setVendorForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telephone" />
                    </div>
                    <input className="input" value={vendorForm.email} onChange={(event) => setVendorForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                    <input className="input" value={vendorForm.address} onChange={(event) => setVendorForm((current) => ({ ...current, address: event.target.value }))} placeholder="Adresse" />
                    <textarea className="input min-h-20" value={vendorForm.notes} onChange={(event) => setVendorForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes fournisseur" />
                    <button type="submit" disabled={submittingKey === "vendor"} className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500/20 disabled:opacity-60">
                      Ajouter le fournisseur
                    </button>
                  </form>
                </SectionCard>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "budgets" && (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          {canWrite && (
            <SectionCard title="Nouveau budget" subtitle="Planifier les enveloppes annuelles ou departementales avec seuil d'alerte.">
              <form className="grid gap-3" onSubmit={handleCreateBudget}>
                <input className="input" value={budgetForm.name} onChange={(event) => setBudgetForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom du budget" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="input" value={budgetForm.department} onChange={(event) => setBudgetForm((current) => ({ ...current, department: event.target.value }))} placeholder="Departement" required />
                  <input className="input" type="number" min="0" step="0.01" value={budgetForm.plannedAmount} onChange={(event) => setBudgetForm((current) => ({ ...current, plannedAmount: event.target.value }))} placeholder="Montant planifie" required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="input" value={budgetForm.categoryId} onChange={(event) => setBudgetForm((current) => ({ ...current, categoryId: event.target.value }))}>
                    <option value="">Categorie associee</option>
                    {categories.filter((category) => !category.parentCategoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <input className="input" type="number" min="1" max="100" value={budgetForm.alertThreshold} onChange={(event) => setBudgetForm((current) => ({ ...current, alertThreshold: event.target.value }))} placeholder="Seuil alerte %" />
                </div>
                <textarea className="input min-h-24" value={budgetForm.notes} onChange={(event) => setBudgetForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes budgetaires" />
                <button type="submit" disabled={submittingKey === "budget"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                  Enregistrer le budget
                </button>
              </form>
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
              <SectionCard title="Profil salarial" subtitle="Base salariale, bonus, deductions et recovery rate pour les futurs runs.">
                <form className="grid gap-3" onSubmit={handleCreateSalaryProfile}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="input" value={salaryForm.employeeCode} onChange={(event) => setSalaryForm((current) => ({ ...current, employeeCode: event.target.value }))} placeholder="Code employe" required />
                    <input className="input" value={salaryForm.fullName} onChange={(event) => setSalaryForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nom complet" required />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="input" value={salaryForm.department} onChange={(event) => setSalaryForm((current) => ({ ...current, department: event.target.value }))} placeholder="Departement" required />
                    <input className="input" value={salaryForm.position} onChange={(event) => setSalaryForm((current) => ({ ...current, position: event.target.value }))} placeholder="Poste" required />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.baseSalary} onChange={(event) => setSalaryForm((current) => ({ ...current, baseSalary: event.target.value }))} placeholder="Salaire de base" required />
                    <select className="input" value={salaryForm.frequency} onChange={(event) => setSalaryForm((current) => ({ ...current, frequency: event.target.value }))}>
                      {PAYROLL_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{labelizeFrequency(frequency)}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.defaultBonus} onChange={(event) => setSalaryForm((current) => ({ ...current, defaultBonus: event.target.value }))} placeholder="Bonus" />
                    <input className="input" type="number" min="0" step="0.01" value={salaryForm.defaultDeduction} onChange={(event) => setSalaryForm((current) => ({ ...current, defaultDeduction: event.target.value }))} placeholder="Deductions" />
                    <input className="input" type="number" min="0" max="100" step="0.01" value={salaryForm.debtRecoveryRate} onChange={(event) => setSalaryForm((current) => ({ ...current, debtRecoveryRate: event.target.value }))} placeholder="Recovery %" />
                  </div>
                  <textarea className="input min-h-24" value={salaryForm.notes} onChange={(event) => setSalaryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes RH" />
                  <button type="submit" disabled={submittingKey === "salary"} className="btn-primary justify-center px-5 py-3 text-sm font-semibold disabled:opacity-60">
                    Ajouter le profil salarial
                  </button>
                </form>
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
            {canWrite && (
              <SectionCard title="Lancer une paie" subtitle="Genere un run avec calcul net et sorties de cash correspondantes.">
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
              </SectionCard>
            )}

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
        </div>
      )}

      {activeTab === "accounting" && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Lecture comptable" subtitle="Journal des ecritures generees par les depenses et la paie.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Total ecritures</p>
                <p className="mt-2 text-2xl font-bold text-white">{accountingEntries.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Charges comptabilisees</p>
                <p className="mt-2 text-2xl font-bold text-red-300">{currency.format(accountingEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Source principale</p>
                <p className="mt-2 text-sm font-semibold text-white">Depenses approuvees et runs de paie</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Journal general" subtitle="Chaque ligne relie la comptabilisation a son objet source.">
            <div className="mb-4 flex flex-wrap gap-3">
              <button onClick={exportAccountingCsv} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button onClick={exportAccountingExcel} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20">
                <Download className="h-4 w-4" /> Export Excel
              </button>
              <button onClick={printAccountingReport} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10">
                <Printer className="h-4 w-4" /> Imprimer
              </button>
            </div>
            <div className="space-y-3">
              {accountingEntries.map((entry) => (
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
              {!accountingEntries.length && <p className="text-sm text-ink-dim">Aucune ecriture comptable disponible.</p>}
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
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Sorties cumulees</p>
                <p className="mt-2 text-2xl font-bold text-red-300">{currency.format(cashflowEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Balance disponible</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">{currency.format(overview.cashflow.availableCash)}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Journal de cashflow" subtitle="Reference, source, moyen de paiement et notes operationnelles.">
            <div className="mb-4 flex flex-wrap gap-3">
              <button onClick={exportCashflowCsv} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button onClick={exportCashflowExcel} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20">
                <Download className="h-4 w-4" /> Export Excel
              </button>
              <button onClick={printCashflowReport} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:border-brand-300/30 hover:bg-brand-500/10">
                <Printer className="h-4 w-4" /> Imprimer
              </button>
            </div>
            <div className="space-y-3">
              {cashflowEntries.map((entry) => (
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
              {!cashflowEntries.length && <p className="text-sm text-ink-dim">Aucun mouvement de tresorerie disponible.</p>}
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
    </div>
  );
}