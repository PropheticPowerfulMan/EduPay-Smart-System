import { useEffect, useMemo, useState } from "react";
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
import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CirclePercent,
  HandCoins,
  Landmark,
  ShieldAlert,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { api } from "../services/api";
import { useI18n } from "../i18n";

type RevenueOverviewResponse = {
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  totalRevenue: number;
  monthlyRevenue: number;
  expectedRevenue: number;
  collectedRevenue: number;
  totalDebt: number;
  totalReduction: number;
  paymentSuccessRate: number;
  paymentCompletionRate: number;
  activeAlerts: number;
  overdueParents: number;
  parentsTracked: number;
  classAnalytics: Array<{
    className: string;
    expected: number;
    collected: number;
    debt: number;
    reductions: number;
    students: number;
    collectionRate: number;
  }>;
  parentDebtAnalytics: Array<{
    parentId: string;
    parentName: string;
    totalDebt: number;
    totalPaid: number;
    carriedOverDebt: number;
    overdueInstallments: number;
    paymentBehaviorScore: number;
  }>;
  reductionStatistics: {
    totalReductions: number;
    reductionCount: number;
    byScope: Array<{ scope: string; amount: number }>;
    byGradeGroup: Array<{ gradeGroup: string; amount: number }>;
    byPaymentOption: Array<{ paymentOptionType: string; amount: number }>;
    periodLabel: string;
  };
  financialHealthIndicators: {
    collectionEfficiency: number;
    debtExposure: number;
    reductionLoad: number;
    alertPressure: number;
    averageBehaviorScore: number;
  };
};

type ExpenseOverviewResponse = {
  revenue: {
    totalRevenue: number;
    totalCompletedPayments: number;
  };
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
  categorySpending: Array<{
    categoryId: string;
    categoryName: string;
    type: string;
    total: number;
  }>;
  departmentSpending: Array<{
    department: string;
    total: number;
  }>;
  monthlyPerformance: Array<{
    period: string;
    revenue: number;
    expenses: number;
    profitLoss: number;
  }>;
  recentExpenses: Array<{
    id: string;
    title: string;
    department: string;
    amount: number;
    categoryName: string;
    status: string;
    expenseDate: string;
  }>;
  recentPayrollRuns: Array<{
    id: string;
    title: string;
    department: string | null;
    totalNet: number;
    status: string;
    periodName: string | null;
    processedAt: string | null;
  }>;
};

const expenseStatusTone: Record<string, string> = {
  APPROVED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  PENDING: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  REJECTED: "border-red-500/25 bg-red-500/10 text-red-200",
  ARCHIVED: "border-slate-500/25 bg-slate-500/10 text-slate-300"
};

const budgetStatusTone: Record<string, string> = {
  ACTIVE: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200",
  EXCEEDED: "border-red-500/25 bg-red-500/10 text-red-200",
  CLOSED: "border-slate-500/25 bg-slate-500/10 text-slate-300",
  ARCHIVED: "border-slate-500/25 bg-slate-500/10 text-slate-300"
};

const payrollStatusTone: Record<string, string> = {
  PAID: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  PROCESSED: "border-brand-500/25 bg-brand-500/10 text-brand-100",
  DRAFT: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  ARCHIVED: "border-slate-500/25 bg-slate-500/10 text-slate-300"
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function barWidth(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof WalletCards;
  tone: string;
}) {
  return (
    <div className="card glass border border-white/10 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">{label}</p>
          <p className="mt-3 font-display text-2xl font-bold text-white">{value}</p>
          <p className="mt-2 text-xs text-ink-dim">{detail}</p>
        </div>
        <div className={`rounded-2xl border p-3 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function formatPeriod(period: string, locale: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short" });
}

export function FinanceDashboardPage() {
  const { lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const [revenueOverview, setRevenueOverview] = useState<RevenueOverviewResponse | null>(null);
  const [expenseOverview, setExpenseOverview] = useState<ExpenseOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<RevenueOverviewResponse>("/api/finance/overview"),
      api<ExpenseOverviewResponse>("/api/expenses/overview")
    ])
      .then(([revenueResult, expenseResult]) => {
        if (!active) return;
        setRevenueOverview(revenueResult);
        setExpenseOverview(expenseResult);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger l'ERP financier.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const money = useMemo(
    () => new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    [locale]
  );

  const performanceChart = useMemo(() => {
    if (!expenseOverview) return [];
    return expenseOverview.monthlyPerformance.map((entry) => ({
      ...entry,
      label: formatPeriod(entry.period, locale)
    }));
  }, [expenseOverview, locale]);

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">Chargement du centre ERP financier EduPay...</p>
        </div>
      </div>
    );
  }

  if (!revenueOverview || !expenseOverview) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-red-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">Financial ERP unavailable</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Le cockpit financier EduPay n'est pas disponible</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? "Aucune donnee n'a ete renvoyee par les modules financiers."}</p>
        </div>
      </div>
    );
  }

  const spendCoverage = revenueOverview.collectedRevenue > 0
    ? (expenseOverview.expenses.totalExpenses / revenueOverview.collectedRevenue) * 100
    : 0;

  return (
    <div className="space-y-6 pb-10 animate-fadeInUp">
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] px-6 py-6 shadow-2xl">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(125,232,255,0.07))]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">EduPay Financial ERP 2026-2027</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">Pilotage unifie revenus, depenses, paie et tresorerie</h1>
            <p className="mt-3 max-w-3xl text-sm text-ink-dim">
              EduPay devient un ecosysteme financier scolaire complet: encaissements,
              dettes parents, depenses institutionnelles, budgetisation, workflow
              d'approbation, paie et intelligence de cashflow, avec maintien du cadre de facturation parentale.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-200">Continuite complete de la facturation parentale</span>
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-200">Double moteur revenus + depenses</span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-200">Workflow d'approbation hierarchique</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Periode active</p>
              <p className="mt-1 font-display text-2xl font-bold text-white">{revenueOverview.academicYear.name}</p>
              <p className="mt-1 text-xs text-cyan-100">Mise a jour {new Date().toLocaleDateString(locale)}</p>
            </div>
            <div className="rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Sante operationnelle</p>
              <p className="mt-1 font-display text-2xl font-bold text-white">{money.format(expenseOverview.cashflow.operationalBalance)}</p>
              <p className="mt-1 text-xs text-brand-100">Cash disponible apres depenses et paie</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Encaissements"
          value={money.format(revenueOverview.collectedRevenue)}
          detail={`${formatPercent(revenueOverview.paymentCompletionRate)} du net attendu`}
          icon={WalletCards}
          tone="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        />
        <MetricCard
          label="Depenses approuvees"
          value={money.format(expenseOverview.expenses.totalExpenses)}
          detail={`${expenseOverview.expenses.approvedExpenses} depenses validees`}
          icon={BadgeDollarSign}
          tone="border-red-500/30 bg-red-500/10 text-red-300"
        />
        <MetricCard
          label="Tresorerie disponible"
          value={money.format(expenseOverview.cashflow.availableCash)}
          detail={`${formatPercent(Math.max(0, 100 - spendCoverage))} de marge sur les encaissements`}
          icon={Landmark}
          tone="border-brand-500/30 bg-brand-500/10 text-brand-200"
        />
        <MetricCard
          label="Masse salariale"
          value={money.format(expenseOverview.payroll.totalPayroll)}
          detail={`${expenseOverview.payroll.activeProfiles} profils salaries actifs`}
          icon={TrendingUp}
          tone="border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
        />
        <MetricCard
          label="Passifs"
          value={money.format(expenseOverview.liabilities.supplierDebt + expenseOverview.liabilities.payrollLiability)}
          detail={`${expenseOverview.expenses.pendingApprovalSteps} etapes d'approbation en attente`}
          icon={ShieldAlert}
          tone="border-amber-500/30 bg-amber-500/10 text-amber-300"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Command center financier</h2>
              <p className="mt-1 text-sm text-ink-dim">
                Vue instantanee des revenus, sorties de cash, dettes institutionnelles et alertes budgetaires.
              </p>
            </div>
            <BarChart3 className="h-6 w-6 text-brand-200" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Profit / perte", money.format(expenseOverview.cashflow.profitLoss), expenseOverview.cashflow.profitLoss >= 0 ? "text-emerald-300" : "text-red-300"],
              ["Dette fournisseurs", money.format(expenseOverview.liabilities.supplierDebt), "text-amber-200"],
              ["Passif salarial", money.format(expenseOverview.liabilities.payrollLiability), "text-cyan-200"],
              ["Dettes parents", money.format(revenueOverview.totalDebt), "text-red-300"],
              ["Budgets sous tension", String(expenseOverview.budgetAlerts.length), "text-white"],
              ["Alertes revenus", String(revenueOverview.activeAlerts), "text-brand-100"]
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{label}</p>
                <p className={`mt-2 font-display text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Recettes</p>
              <p className="mt-2 text-2xl font-bold text-white">{money.format(revenueOverview.expectedRevenue)}</p>
              <p className="mt-1 text-sm text-emerald-100">Attendu annuel net avec reductions et accords.</p>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Depenses</p>
              <p className="mt-2 text-2xl font-bold text-white">{money.format(expenseOverview.expenses.totalExpenses)}</p>
              <p className="mt-1 text-sm text-red-100">Operations, achats, maintenance et paie inclus.</p>
            </div>
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Cash disponible</p>
              <p className="mt-2 text-2xl font-bold text-white">{money.format(expenseOverview.cashflow.availableCash)}</p>
              <p className="mt-1 text-sm text-brand-100">Solde operationnel mobilisable en temps reel.</p>
            </div>
          </div>
        </div>

        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Workflow d'approbation</h2>
              <p className="mt-1 text-sm text-ink-dim">Validation, approbation administrative et arbitrage proprietaire si necessaire.</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["1", "Officier financier", "Controle categorie, budget, piece justificative et periode comptable."],
              ["2", "Administration", "Autorise la sortie de fonds et la coherence departementale."],
              ["3", "Owner / Direction", "Valide les depenses sensibles, urgentes ou strategiques."]
            ].map(([step, label, detail]) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-400/30 bg-brand-500/10 text-sm font-bold text-brand-100">{step}</span>
                  <div>
                    <p className="font-semibold text-white">{label}</p>
                    <p className="mt-1 text-sm text-ink-dim">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Depenses en attente</p>
              <p className="mt-2 text-2xl font-bold text-white">{expenseOverview.expenses.pendingExpenses}</p>
            </div>
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Etapes a traiter</p>
              <p className="mt-2 text-2xl font-bold text-white">{expenseOverview.expenses.pendingApprovalSteps}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Cashflow et performance mensuelle</h2>
              <p className="mt-1 text-sm text-ink-dim">Comparaison recettes vs depenses pour lire la marge operationnelle de l'institution.</p>
            </div>
            <CalendarClock className="h-6 w-6 text-brand-200" />
          </div>
          <div className="mt-4 h-80 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceChart}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(125,232,255,0.18)", borderRadius: 16 }}
                  formatter={(value: number) => money.format(Number(value))}
                />
                <Bar dataKey="revenue" radius={[10, 10, 0, 0]} fill="#22c55e" />
                <Bar dataKey="expenses" radius={[10, 10, 0, 0]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Revenus comptabilises</p>
              <p className="mt-2 text-xl font-bold text-emerald-300">{money.format(expenseOverview.revenue.totalRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Charges engagees</p>
              <p className="mt-2 text-xl font-bold text-red-300">{money.format(expenseOverview.expenses.totalExpenses)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Profit / perte</p>
              <p className={`mt-2 text-xl font-bold ${expenseOverview.cashflow.profitLoss >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {money.format(expenseOverview.cashflow.profitLoss)}
              </p>
            </div>
          </div>
        </div>

        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Analyse des depenses</h2>
              <p className="mt-1 text-sm text-ink-dim">Postes dominants et ventilation par categorie pour detecter les poches de consommation.</p>
            </div>
            <AlertTriangle className="h-6 w-6 text-amber-300" />
          </div>
          <div className="mt-4 h-80 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseOverview.categorySpending.slice(0, 6)}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="categoryName" stroke="#94a3b8" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={70} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(125,232,255,0.18)", borderRadius: 16 }}
                  formatter={(value: number) => money.format(Number(value))}
                />
                <Area type="monotone" dataKey="total" stroke="#38bdf8" fill="rgba(56,189,248,0.35)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-3">
            {expenseOverview.departmentSpending.slice(0, 5).map((entry) => (
              <div key={entry.department} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{entry.department}</p>
                  <p className="font-mono text-sm font-bold text-cyan-200">{money.format(entry.total)}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: barWidth((entry.total / Math.max(expenseOverview.expenses.totalExpenses, 1)) * 100) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Budgets et alertes de consommation</h2>
              <p className="mt-1 text-sm text-ink-dim">Suivi planned vs actual, seuils critiques et depassements par departement.</p>
            </div>
            <CirclePercent className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="mt-5 space-y-3">
            {expenseOverview.budgets.map((budget) => (
              <div key={budget.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{budget.name}</p>
                    <p className="mt-1 text-xs text-ink-dim">{budget.department} • {budget.periodName} • {budget.categoryName ?? "Global"}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${budgetStatusTone[budget.status] ?? budgetStatusTone.ACTIVE}`}>
                    {budget.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-ink-dim">Prevu</p>
                    <p className="font-semibold text-white">{money.format(budget.plannedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Consomme</p>
                    <p className="font-semibold text-amber-200">{money.format(budget.consumedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Reste</p>
                    <p className="font-semibold text-emerald-300">{money.format(budget.remainingAmount)}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full rounded-full ${budget.utilization >= 100 ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-brand-500 to-cyan-400"}`} style={{ width: barWidth(budget.utilization) }} />
                </div>
                <p className="mt-2 text-xs text-ink-dim">Utilisation: {formatPercent(budget.utilization)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Paie et obligations RH</h2>
                <p className="mt-1 text-sm text-ink-dim">Profils salariaux, historiques de run et engagements restant a payer.</p>
              </div>
              <TrendingUp className="h-6 w-6 text-brand-100" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Profils</p>
                <p className="mt-2 text-xl font-bold text-white">{expenseOverview.payroll.activeProfiles}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Runs</p>
                <p className="mt-2 text-xl font-bold text-white">{expenseOverview.payroll.runCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Passif salarial</p>
                <p className="mt-2 text-xl font-bold text-cyan-300">{money.format(expenseOverview.payroll.salaryLiability)}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {expenseOverview.recentPayrollRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{run.title}</p>
                      <p className="mt-1 text-xs text-ink-dim">{run.department ?? "RH"} • {run.periodName ?? "Periode non definie"}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${payrollStatusTone[run.status] ?? payrollStatusTone.DRAFT}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-ink-dim">Net a payer</span>
                    <span className="font-mono font-bold text-white">{money.format(run.totalNet)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Depenses recentes</h2>
                <p className="mt-1 text-sm text-ink-dim">Pieces a valider, achats traces et statut d'execution comptable.</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-5 space-y-3">
              {expenseOverview.recentExpenses.map((expense) => (
                <div key={expense.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{expense.title}</p>
                      <p className="mt-1 text-xs text-ink-dim">{expense.department} • {expense.categoryName}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${expenseStatusTone[expense.status] ?? expenseStatusTone.PENDING}`}>
                      {expense.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-ink-dim">Montant</span>
                    <span className="font-mono font-bold text-white">{money.format(expense.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Intelligence revenus et dettes parents</h2>
              <p className="mt-1 text-sm text-ink-dim">Le moteur tuition existant reste intact et s'etend maintenant a la lecture globale de sante financiere.</p>
            </div>
            <ShieldAlert className="h-6 w-6 text-red-300" />
          </div>
          <div className="mt-5 space-y-3">
            {revenueOverview.parentDebtAnalytics.slice(0, 5).map((row) => (
              <div key={row.parentId} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{row.parentName}</p>
                    <p className="mt-1 text-xs text-ink-dim">{row.overdueInstallments} echeances en retard</p>
                  </div>
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                    {money.format(row.totalDebt)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-ink-dim">Paye</p>
                    <p className="font-semibold text-emerald-300">{money.format(row.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Report historique</p>
                    <p className="font-semibold text-amber-300">{money.format(row.carriedOverDebt)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Score comportemental</p>
                    <p className="font-semibold text-cyan-300">{formatPercent(row.paymentBehaviorScore)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card glass border border-white/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Analytique scolaire et reductions</h2>
              <p className="mt-1 text-sm text-ink-dim">Encaissement par classe, charge de reduction et pression dette par segment academique.</p>
            </div>
            <HandCoins className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="mt-5 space-y-3">
            {revenueOverview.classAnalytics.slice(0, 4).map((row) => (
              <div key={row.className} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{row.className}</p>
                    <p className="text-xs text-ink-dim">{row.students} eleves suivis</p>
                  </div>
                  <p className="font-mono font-bold text-emerald-300">{money.format(row.collected)}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: barWidth(row.collectionRate) }} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-ink-dim">Couverture</p>
                    <p className="font-semibold text-white">{formatPercent(row.collectionRate)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Dette</p>
                    <p className="font-semibold text-red-300">{money.format(row.debt)}</p>
                  </div>
                  <div>
                    <p className="text-ink-dim">Reductions</p>
                    <p className="font-semibold text-cyan-300">{money.format(row.reductions)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Periode d'analyse reductions</p>
            <p className="mt-2 font-display text-2xl font-bold text-white">{revenueOverview.reductionStatistics.periodLabel}</p>
            <p className="mt-1 text-sm text-cyan-100">{revenueOverview.reductionStatistics.reductionCount} reduction(s) tracee(s) pour {money.format(revenueOverview.reductionStatistics.totalReductions)}.</p>
          </div>
        </div>
      </section>

      <section className="card glass border border-brand-500/10 shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Cadre officiel de facturation parentale</h2>
            <p className="mt-1 text-sm text-ink-dim">
              Le referentiel KCS reste une logique metier interne qui structure automatiquement la facturation des parents lors des inscriptions, reinscriptions et suivis multi-enfants.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink-dim">
            Le dashboard ERP n'expose pas les cas d'inscription en detail; il consolide seulement leurs effets sur les encaissements, ajustements, reductions et echeances.
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-300">Role du referentiel</p>
            <p className="mt-3 text-sm text-ink-dim">
              Il alimente les calculs de tuition, reductions, echeances et reports sans surcharger l'interface operationnelle.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-300">Portee parentale</p>
            <p className="mt-3 text-sm text-ink-dim">
              La logique couvre les foyers avec un ou plusieurs enfants, puis consolide automatiquement les obligations de paiement au niveau parent.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-300">Vision ERP</p>
            <p className="mt-3 text-sm text-ink-dim">
              Le cockpit conserve une vue de pilotage: dettes, encaissements, reductions et impacts sur la tresorerie, sans exposer la mecanique d'inscription.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
