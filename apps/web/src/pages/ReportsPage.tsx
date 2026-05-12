import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Download, FileSpreadsheet, Landmark, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { api } from "../services/api";
import { exportWorkbook } from "../utils/financeExcel";

type FinanceOverviewResponse = {
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  totalRevenue: number;
  expectedRevenue: number;
  collectedRevenue: number;
  totalDebt: number;
  paymentSuccessRate: number;
};

type ExpenseOverviewResponse = {
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
    operationalBalance: number;
    profitLoss: number;
  };
  liabilities: {
    supplierDebt: number;
    payrollLiability: number;
    institutionalObligations: number;
  };
  budgets: Array<{
    id: string;
    name: string;
    department: string;
    plannedAmount: number;
    consumedAmount: number;
    remainingAmount: number;
    utilization: number;
    status: string;
    periodName: string;
    categoryName: string | null;
  }>;
  budgetAlerts: Array<{
    id: string;
    name: string;
    department: string;
    plannedAmount: number;
    consumedAmount: number;
    remainingAmount: number;
    utilization: number;
    status: string;
    periodName: string;
    categoryName: string | null;
  }>;
  departmentSpending: Array<{ department: string; total: number }>;
  monthlyPerformance: Array<{ period: string; revenue: number; expenses: number; profitLoss: number }>;
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
  expense?: { title: string } | null;
  payrollRun?: { title: string } | null;
  payrollItem?: { salarySlipNumber?: string | null } | null;
};

type CashflowEntry = {
  id: string;
  sourceType: string;
  direction: string;
  amount: number;
  currency: string;
  method?: string | null;
  referenceDate: string;
  notes?: string | null;
  expense?: { title: string } | null;
  payrollRun?: { title: string } | null;
  payrollItem?: { salarySlipNumber?: string | null } | null;
};

type PayrollRun = {
  id: string;
  title: string;
  department?: string;
  frequency: string;
  status: string;
  totalNet: number;
  totalDeductions: number;
  processedAt: string | null;
  period?: { id: string; name: string } | null;
  items: Array<{ id: string; salarySlipNumber: string; netSalary: number; salaryProfile: { fullName: string; employeeCode: string } }>;
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card glass border border-white/10 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ReportsPage() {
  const currency = useMemo(() => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }), []);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverviewResponse | null>(null);
  const [expenseOverview, setExpenseOverview] = useState<ExpenseOverviewResponse | null>(null);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [cashflowEntries, setCashflowEntries] = useState<CashflowEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<FinanceOverviewResponse>("/api/finance/overview"),
      api<ExpenseOverviewResponse>("/api/expenses/overview"),
      api<AccountingEntry[]>("/api/expenses/accounting-entries"),
      api<CashflowEntry[]>("/api/expenses/cashflow-entries"),
      api<PayrollRun[]>("/api/expenses/payroll/runs")
    ])
      .then(([nextFinanceOverview, nextExpenseOverview, nextAccountingEntries, nextCashflowEntries, nextPayrollRuns]) => {
        if (!active) return;
        setFinanceOverview(nextFinanceOverview);
        setExpenseOverview(nextExpenseOverview);
        setAccountingEntries(nextAccountingEntries);
        setCashflowEntries(nextCashflowEntries);
        setPayrollRuns(nextPayrollRuns);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger les rapports executifs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function exportExecutiveWorkbook() {
    if (!financeOverview || !expenseOverview) return;
    exportWorkbook(`rapport-executif-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Synthese",
        rows: [
          {
            "Exercice": financeOverview.academicYear.name,
            "Revenu collecte": financeOverview.collectedRevenue,
            "Revenu attendu": financeOverview.expectedRevenue,
            "Dette globale": financeOverview.totalDebt,
            "Depenses": expenseOverview.expenses.totalExpenses,
            "Profit ou perte": expenseOverview.cashflow.profitLoss,
            "Tresorerie": expenseOverview.cashflow.availableCash,
            "Masse salariale": expenseOverview.payroll.totalPayroll
          }
        ]
      },
      {
        name: "Budgets",
        rows: expenseOverview.budgets.map((budget) => ({
          "Budget": budget.name,
          "Departement": budget.department,
          "Categorie": budget.categoryName || "Global",
          "Planifie": budget.plannedAmount,
          "Consomme": budget.consumedAmount,
          "Reste": budget.remainingAmount,
          "Utilisation %": Number(budget.utilization.toFixed(2)),
          "Statut": budget.status,
          "Periode": budget.periodName
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
          "Devise": entry.currency,
          "Source": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
        }))
      },
      {
        name: "Tresorerie",
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
      },
      {
        name: "Paie",
        rows: payrollRuns.map((run) => ({
          "Run": run.title,
          "Departement": run.department || "Tous",
          "Frequence": run.frequency,
          "Statut": run.status,
          "Periode": run.period?.name || "",
          "Net": run.totalNet,
          "Deductions": run.totalDeductions,
          "Bulletins": run.items.length,
          "Traite le": run.processedAt ? new Date(run.processedAt).toLocaleDateString("fr-FR") : ""
        }))
      }
    ]);
  }

  if (loading) {
    return <div className="card glass border border-white/10 p-10 text-sm text-ink-dim">Chargement des rapports executifs...</div>;
  }

  if (error || !financeOverview || !expenseOverview) {
    return <div className="card glass border border-red-500/20 p-10 text-sm text-red-200">{error || "Rapports indisponibles."}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="card glass overflow-hidden border border-white/10 shadow-xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_30%),linear-gradient(135deg,rgba(8,47,73,0.94),rgba(2,6,23,0.98))] p-6 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">Rapports executifs</p>
              <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Centre de pilotage financier visible et exportable</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                Cette vue consolide revenu, budgets, comptabilite, tresorerie et masse salariale. Elle sert de preuve visible dans l'interface et de point d'export Excel.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={exportExecutiveWorkbook} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400/20">
                <FileSpreadsheet className="h-4 w-4" /> Exporter pack Excel
              </button>
              <Link to="/operations" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white hover:border-cyan-300/25 hover:bg-white/[0.1]">
                <ReceiptText className="h-4 w-4" /> Ouvrir les operations
              </Link>
            </div>
          </div>
          <div className="relative mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Revenu collecte", value: currency.format(financeOverview.collectedRevenue), icon: WalletCards },
              { label: "Depenses totales", value: currency.format(expenseOverview.expenses.totalExpenses), icon: Landmark },
              { label: "Profit / perte", value: currency.format(expenseOverview.cashflow.profitLoss), icon: TrendingUp },
              { label: "Tresorerie disponible", value: currency.format(expenseOverview.cashflow.availableCash), icon: Download }
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{card.label}</p>
                    <p className="mt-3 text-2xl font-bold text-white">{card.value}</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Compte de resultat simplifie" subtitle="Revenu, depenses et resultat mensuel sur la periode courante.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseOverview.monthlyPerformance}>
                <defs>
                  <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="period" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }} />
                <Area type="monotone" dataKey="revenue" stroke="#22d3ee" fill="url(#revenueGlow)" strokeWidth={3} />
                <Area type="monotone" dataKey="profitLoss" stroke="#10b981" fill="url(#profitGlow)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Position budgetaire" subtitle="Alertes et taux de consommation a surveiller maintenant.">
          <div className="space-y-3">
            {expenseOverview.budgetAlerts.map((budget) => (
              <article key={budget.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{budget.name}</p>
                    <p className="mt-1 text-xs text-ink-dim">{budget.department} • {budget.periodName} • {budget.categoryName || "Global"}</p>
                  </div>
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">{budget.utilization.toFixed(1)}%</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                  <div><p className="text-ink-dim">Planifie</p><p className="font-semibold text-white">{currency.format(budget.plannedAmount)}</p></div>
                  <div><p className="text-ink-dim">Consomme</p><p className="font-semibold text-amber-200">{currency.format(budget.consumedAmount)}</p></div>
                  <div><p className="text-ink-dim">Reste</p><p className="font-semibold text-emerald-300">{currency.format(budget.remainingAmount)}</p></div>
                </div>
              </article>
            ))}
            {!expenseOverview.budgetAlerts.length && <p className="text-sm text-ink-dim">Aucune alerte budgetaire sur la periode.</p>}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Depenses par departement" subtitle="Lecture immediate des postes qui consomment le plus.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseOverview.departmentSpending} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis type="category" dataKey="department" stroke="#94a3b8" width={120} />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }} />
                <Bar dataKey="total" radius={[0, 14, 14, 0]} fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Synthese comptable et cash" subtitle="Volumes visibles avant de descendre dans les journaux detailles.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Ecritures comptables</p>
              <p className="mt-3 text-3xl font-bold text-white">{accountingEntries.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Montant total: {currency.format(accountingEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Lignes de tresorerie</p>
              <p className="mt-3 text-3xl font-bold text-white">{cashflowEntries.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Sorties: {currency.format(cashflowEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Runs de paie</p>
              <p className="mt-3 text-3xl font-bold text-white">{payrollRuns.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Masse nette: {currency.format(payrollRuns.reduce((sum, run) => sum + run.totalNet, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Dette institutionnelle</p>
              <p className="mt-3 text-3xl font-bold text-white">{currency.format(expenseOverview.liabilities.institutionalObligations)}</p>
              <p className="mt-2 text-sm text-ink-dim">Dette fournisseurs: {currency.format(expenseOverview.liabilities.supplierDebt)}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
