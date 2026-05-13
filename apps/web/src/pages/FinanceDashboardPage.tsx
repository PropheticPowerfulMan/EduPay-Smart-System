import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  CirclePercent,
  ClipboardList,
  Gauge,
  HandCoins,
  Landmark,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
  X
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

type FinanceErpModule = "health" | "forecast" | "revenue" | "expenses" | "budgets" | "payroll";

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

function ScienceIndicator({
  label,
  value,
  detail,
  tone = "text-white"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{label}</p>
      <p className={`mt-2 font-display text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-dim">{detail}</p>
    </div>
  );
}

function FinanceErpDialog({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="edupay-finance-erp-dialog fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/82 px-3 py-4 backdrop-blur-md sm:px-6 sm:py-8">
      <div className="edupay-finance-erp-modal w-full max-w-6xl rounded-2xl border border-brand-300/15 bg-slate-950/96 p-4 shadow-2xl sm:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Tableau financier EduPay</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">{title}</h2>
            <p className="mt-2 text-sm text-ink-dim">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-ink-dim transition hover:border-brand-300/30 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function formatPeriod(period: string, locale: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short" });
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function FinanceDashboardPage() {
  const { lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const [revenueOverview, setRevenueOverview] = useState<RevenueOverviewResponse | null>(null);
  const [expenseOverview, setExpenseOverview] = useState<ExpenseOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<FinanceErpModule | null>(null);

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
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger le tableau financier.");
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
  const L = (fr: string, en: string) => lang === "fr" ? fr : en;

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
          <p className="text-sm font-semibold text-ink-dim">{L("Chargement du centre ERP financier EduPay...", "Loading the EduPay Financial ERP center...")}</p>
        </div>
      </div>
    );
  }

  if (!revenueOverview || !expenseOverview) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-red-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">{L("ERP financier indisponible", "Financial ERP unavailable")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">{L("Le cockpit financier EduPay n'est pas disponible", "The EduPay financial cockpit is unavailable")}</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? L("Aucune donnee n'a ete renvoyee par les modules financiers.", "No data was returned by the finance modules.")}</p>
        </div>
      </div>
    );
  }

  const spendCoverage = revenueOverview.collectedRevenue > 0
    ? (expenseOverview.expenses.totalExpenses / revenueOverview.collectedRevenue) * 100
    : 0;
  const totalInstitutionalLiabilities = expenseOverview.liabilities.supplierDebt + expenseOverview.liabilities.payrollLiability + expenseOverview.liabilities.institutionalObligations;
  const operatingMargin = revenueOverview.collectedRevenue > 0
    ? (expenseOverview.cashflow.profitLoss / revenueOverview.collectedRevenue) * 100
    : 0;
  const liquidityCoverage = totalInstitutionalLiabilities > 0
    ? (expenseOverview.cashflow.availableCash / totalInstitutionalLiabilities) * 100
    : 100;
  const recentPerformance = performanceChart.slice(-3);
  const forecastRevenue = average(recentPerformance.map((entry) => entry.revenue)) || revenueOverview.monthlyRevenue;
  const forecastExpenses = average(recentPerformance.map((entry) => entry.expenses)) || expenseOverview.expenses.totalExpenses;
  const predictedCash30 = expenseOverview.cashflow.availableCash + forecastRevenue - forecastExpenses;
  const monthlyBurn = average(recentPerformance.map((entry) => entry.expenses)) || Math.max(expenseOverview.payroll.totalPayroll + expenseOverview.expenses.totalExpenses, 1);
  const runwayMonths = monthlyBurn > 0 ? expenseOverview.cashflow.availableCash / monthlyBurn : 0;
  const healthScore = clampScore(
    revenueOverview.financialHealthIndicators.collectionEfficiency * 0.24
    + Math.max(0, 100 - revenueOverview.financialHealthIndicators.debtExposure) * 0.18
    + Math.max(0, 100 - spendCoverage) * 0.14
    + Math.max(0, 100 - revenueOverview.financialHealthIndicators.alertPressure) * 0.12
    + clampScore(liquidityCoverage) * 0.12
    + revenueOverview.financialHealthIndicators.averageBehaviorScore * 0.12
    + clampScore(operatingMargin + 50) * 0.08
  );
  const healthTone = healthScore >= 78 ? "text-emerald-300" : healthScore >= 58 ? "text-amber-300" : "text-red-300";
  const healthLabel = healthScore >= 78 ? L("Stable", "Stable") : healthScore >= 58 ? L("Sous surveillance", "Under watch") : L("Critique", "Critical");
  const riskIndex = clampScore(100 - healthScore);
  const activeModuleMeta = activeModule ? {
    health: {
      title: L("Santé financière globale", "Global financial health"),
      subtitle: L("Score composite calculé avec le recouvrement, la dette, la trésorerie, les passifs, les alertes et le comportement de paiement.", "Composite score based on collection, debt, cash, liabilities, alerts and payment behavior.")
    },
    forecast: {
      title: L("Prévisions et scénarios", "Forecasts and scenarios"),
      subtitle: L("Projection scientifique simple sur 30 jours, à partir de la performance mensuelle récente.", "Simple 30-day projection based on recent monthly performance.")
    },
    revenue: {
      title: L("Revenus, parents et recouvrement", "Revenue, parents and collection"),
      subtitle: L("Lecture des encaissements, des dettes parentales, des réductions et des segments scolaires.", "View collections, parent debts, discounts and school segments.")
    },
    expenses: {
      title: L("Dépenses et contrôle opérationnel", "Expenses and operational control"),
      subtitle: L("Sorties de trésorerie, catégories, départements et workflow d'approbation.", "Cash outflows, categories, departments and approval workflow.")
    },
    budgets: {
      title: L("Budgets et seuils critiques", "Budgets and critical thresholds"),
      subtitle: L("Consommation prévue/réelle, alertes et enveloppes à surveiller.", "Planned versus actual usage, alerts and envelopes to monitor.")
    },
    payroll: {
      title: L("Paie, obligations et passifs", "Payroll, obligations and liabilities"),
      subtitle: L("Masse salariale, cycles de paie et dette institutionnelle restante.", "Payroll mass, payroll runs and remaining institutional liabilities.")
    }
  }[activeModule] : null;

  const erpModules: Array<{
    id: FinanceErpModule;
    title: string;
    description: string;
    metric: string;
    signal: string;
    icon: typeof WalletCards;
    tone: string;
  }> = [
    {
      id: "health",
      title: L("Santé financière", "Financial health"),
      description: L("Score global, marge, liquidité, dette et pression des alertes.", "Global score, margin, liquidity, debt and alert pressure."),
      metric: `${healthScore.toFixed(1)}/100`,
      signal: healthLabel,
      icon: Gauge,
      tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
    },
    {
      id: "forecast",
      title: L("Prévision à 30 jours", "30-day forecast"),
      description: L("Trésorerie projetée, risque, autonomie financière et tendance revenus/dépenses.", "Projected cash, risk, runway and revenue/expense trend."),
      metric: money.format(predictedCash30),
      signal: `${riskIndex.toFixed(1)}% risque`,
      icon: BrainCircuit,
      tone: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
    },
    {
      id: "revenue",
      title: L("Revenus & parents", "Revenue & parents"),
      description: L("Encaissements, dettes, réductions, classes et parents sensibles.", "Collections, debts, discounts, classes and sensitive parent accounts."),
      metric: money.format(revenueOverview.collectedRevenue),
      signal: L(`${revenueOverview.overdueParents} parent(s) en retard`, `${revenueOverview.overdueParents} overdue parents`),
      icon: WalletCards,
      tone: "border-brand-300/20 bg-brand-500/10 text-brand-100"
    },
    {
      id: "expenses",
      title: L("Dépenses", "Expenses"),
      description: L("Charges, pièces récentes, départements consommateurs et contrôles.", "Charges, recent documents, consuming departments and controls."),
      metric: money.format(expenseOverview.expenses.totalExpenses),
      signal: L(`${expenseOverview.expenses.pendingExpenses} en attente`, `${expenseOverview.expenses.pendingExpenses} pending`),
      icon: ClipboardList,
      tone: "border-red-400/20 bg-red-500/10 text-red-200"
    },
    {
      id: "budgets",
      title: L("Budgets", "Budgets"),
      description: L("Utilisation par enveloppe, seuils critiques et dépassements.", "Envelope usage, critical thresholds and overruns."),
      metric: String(expenseOverview.budgets.length),
      signal: L(`${expenseOverview.budgetAlerts.length} alerte(s)`, `${expenseOverview.budgetAlerts.length} alert(s)`),
      icon: Target,
      tone: "border-amber-300/20 bg-amber-500/10 text-amber-100"
    },
    {
      id: "payroll",
      title: L("Paie et passifs", "Payroll & liabilities"),
      description: L("Masse salariale, obligations RH, fournisseurs et dette structurelle.", "Payroll mass, HR obligations, suppliers and structural debt."),
      metric: money.format(expenseOverview.payroll.totalPayroll),
      signal: money.format(totalInstitutionalLiabilities),
      icon: Scale,
      tone: "border-violet-300/20 bg-violet-500/10 text-violet-100"
    }
  ];

  return (
    <div className="edupay-finance-erp space-y-6 pb-10 animate-fadeInUp">
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_35%),linear-gradient(160deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] px-6 py-6 shadow-2xl">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(125,232,255,0.07))]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">{L("Tableau financier EduPay 2026-2027", "EduPay Financial overview 2026-2027")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">{L("Pilotage unifié des revenus, des dépenses, de la paie et de la trésorerie", "Unified control of revenue, expenses, payroll and cash")}</h1>
            <p className="mt-3 max-w-3xl text-sm text-ink-dim">
              {L(
                "EduPay devient un écosystème financier scolaire complet : encaissements, dettes des parents, dépenses institutionnelles, budgétisation, workflow d'approbation, paie et intelligence de trésorerie, tout en conservant le cadre de facturation parentale.",
                "EduPay becomes a complete school finance ecosystem: collections, parent debts, institutional expenses, budgeting, approval workflow, payroll and cash-flow intelligence while preserving parent billing logic."
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-200">{L("Continuité complète de la facturation parentale", "Full continuity of parent billing")}</span>
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-200">{L("Double moteur : revenus et dépenses", "Dual revenue + expense engine")}</span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-200">{L("Workflow d'approbation hiérarchique", "Hierarchical approval workflow")}</span>
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

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="glass min-w-0 border border-white/10 p-4 shadow-lg sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Indice scientifique</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">Sante financiere de l'ecole</h2>
              <p className="mt-2 text-sm text-ink-dim">
                Score composite sur revenus, dettes, cash, passifs, alertes et comportement parent.
              </p>
            </div>
            <Activity className={`h-7 w-7 shrink-0 ${healthTone}`} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[150px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center">
              <p className={`font-display text-4xl font-bold ${healthTone}`}>{healthScore.toFixed(1)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-dim">sur 100</p>
              <p className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white">{healthLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScienceIndicator label="Marge operationnelle" value={formatPercent(operatingMargin)} detail="Profit/perte rapporte aux encaissements." tone={operatingMargin >= 0 ? "text-emerald-300" : "text-red-300"} />
              <ScienceIndicator label="Couverture liquidite" value={formatPercent(liquidityCoverage)} detail="Cash disponible face aux passifs connus." tone={liquidityCoverage >= 100 ? "text-emerald-300" : "text-amber-300"} />
              <ScienceIndicator label="Risque global" value={formatPercent(riskIndex)} detail="Inverse du score de sante financiere." tone={riskIndex <= 30 ? "text-emerald-300" : riskIndex <= 55 ? "text-amber-300" : "text-red-300"} />
              <ScienceIndicator label="Cash 30 jours" value={money.format(predictedCash30)} detail="Projection: cash + revenus prevus - charges prevues." tone={predictedCash30 >= 0 ? "text-emerald-300" : "text-red-300"} />
            </div>
          </div>
        </div>

        <div className="glass min-w-0 border border-white/10 p-4 shadow-lg sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">Modules de pilotage</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">Ouvrir une analyse ciblee</h2>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              Dashboard principal
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {erpModules.map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveModule(module.id)}
                  className="group min-w-0 rounded-xl border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-brand-300/30 hover:bg-white/[0.07]"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${module.tone}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-bold text-white">{module.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-dim">{module.description}</span>
                    </span>
                  </span>
                  <span className="mt-4 flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-bold text-white">{module.metric}</span>
                      <span className="block text-xs text-ink-dim">{module.signal}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-brand-200 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="hidden grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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

      <section className="hidden grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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

      <section className="hidden grid gap-6 xl:grid-cols-[1fr_1fr]">
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

      <section className="hidden grid gap-6 xl:grid-cols-[1fr_1fr]">
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

      <section className="hidden card glass border border-brand-500/10 shadow-lg">
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

      {activeModule && activeModuleMeta && (
        <FinanceErpDialog title={activeModuleMeta.title} subtitle={activeModuleMeta.subtitle} onClose={() => setActiveModule(null)}>
          {activeModule === "health" && (
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Diagnostic global</p>
                <p className={`mt-3 font-display text-5xl font-bold ${healthTone}`}>{healthScore.toFixed(1)}</p>
                <p className="mt-2 text-lg font-semibold text-white">{healthLabel}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-dim">
                  L'indice combine la performance de recouvrement, l'exposition aux dettes, la pression budgetaire, les alertes,
                  la liquidite et le comportement de paiement des parents. Il donne une lecture rapide de la capacite de l'ecole
                  a financer ses operations sans tension excessive.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ScienceIndicator label="Collection efficiency" value={formatPercent(revenueOverview.financialHealthIndicators.collectionEfficiency)} detail="Capacite a transformer le revenu attendu en cash reel." tone="text-emerald-300" />
                <ScienceIndicator label="Debt exposure" value={formatPercent(revenueOverview.financialHealthIndicators.debtExposure)} detail="Poids des dettes parentales dans le revenu attendu." tone="text-red-300" />
                <ScienceIndicator label="Reduction load" value={formatPercent(revenueOverview.financialHealthIndicators.reductionLoad)} detail="Impact des reductions sur le revenu net." tone="text-cyan-300" />
                <ScienceIndicator label="Alert pressure" value={formatPercent(revenueOverview.financialHealthIndicators.alertPressure)} detail="Densite des alertes ouvertes dans le portefeuille parents." tone="text-amber-300" />
                <ScienceIndicator label="Average behavior score" value={formatPercent(revenueOverview.financialHealthIndicators.averageBehaviorScore)} detail="Qualite moyenne de paiement des familles suivies." tone="text-brand-100" />
                <ScienceIndicator label="Spend coverage" value={formatPercent(spendCoverage)} detail="Part des encaissements deja consommee par les depenses." tone={spendCoverage <= 70 ? "text-emerald-300" : "text-amber-300"} />
              </div>
            </div>
          )}

          {activeModule === "forecast" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ScienceIndicator label="Revenus prevus" value={money.format(forecastRevenue)} detail="Moyenne mobile des derniers mois disponibles." tone="text-emerald-300" />
                <ScienceIndicator label="Charges prevues" value={money.format(forecastExpenses)} detail="Projection des sorties recurrentes." tone="text-red-300" />
                <ScienceIndicator label="Cash projete J+30" value={money.format(predictedCash30)} detail="Tresorerie si la tendance continue." tone={predictedCash30 >= 0 ? "text-emerald-300" : "text-red-300"} />
                <ScienceIndicator label="Runway" value={`${runwayMonths.toFixed(1)} mois`} detail="Mois couverts par le cash actuel." tone={runwayMonths >= 2 ? "text-emerald-300" : "text-amber-300"} />
              </div>
              <div className="h-80 rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceChart}>
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(125,232,255,0.18)", borderRadius: 12 }} formatter={(value: number) => money.format(Number(value))} />
                    <Bar dataKey="revenue" radius={[8, 8, 0, 0]} fill="#22c55e" />
                    <Bar dataKey="expenses" radius={[8, 8, 0, 0]} fill="#f97316" />
                    <Bar dataKey="profitLoss" radius={[8, 8, 0, 0]} fill="#38bdf8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeModule === "revenue" && (
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                {revenueOverview.parentDebtAnalytics.slice(0, 8).map((row) => (
                  <div key={row.parentId} className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.parentName}</p>
                        <p className="text-xs text-ink-dim">{row.overdueInstallments} echeance(s) en retard · score {formatPercent(row.paymentBehaviorScore)}</p>
                      </div>
                      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-200">{money.format(row.totalDebt)}</span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                      <span className="text-emerald-300">Paye: {money.format(row.totalPaid)}</span>
                      <span className="text-amber-300">Historique: {money.format(row.carriedOverDebt)}</span>
                      <span className="text-cyan-300">Dette: {money.format(row.totalDebt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {revenueOverview.classAnalytics.slice(0, 8).map((row) => (
                  <div key={row.className} className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.className}</p>
                        <p className="text-xs text-ink-dim">{row.students} eleves · attendu {money.format(row.expected)}</p>
                      </div>
                      <p className="font-mono text-sm font-bold text-emerald-300">{formatPercent(row.collectionRate)}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: barWidth(row.collectionRate) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeModule === "expenses" && (
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="h-80 rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={expenseOverview.categorySpending.slice(0, 8)}>
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis dataKey="categoryName" stroke="#94a3b8" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={76} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(125,232,255,0.18)", borderRadius: 12 }} formatter={(value: number) => money.format(Number(value))} />
                    <Area type="monotone" dataKey="total" stroke="#38bdf8" fill="rgba(56,189,248,0.34)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {expenseOverview.recentExpenses.slice(0, 8).map((expense) => (
                  <div key={expense.id} className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{expense.title}</p>
                        <p className="text-xs text-ink-dim">{expense.department} · {expense.categoryName}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${expenseStatusTone[expense.status] ?? expenseStatusTone.PENDING}`}>{expense.status}</span>
                    </div>
                    <p className="mt-3 font-mono text-sm font-bold text-white">{money.format(expense.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeModule === "budgets" && (
            <div className="space-y-3">
              {expenseOverview.budgets.map((budget) => (
                <div key={budget.id} className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{budget.name}</p>
                      <p className="text-xs text-ink-dim">{budget.department} · {budget.periodName} · {budget.categoryName ?? "Global"}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${budgetStatusTone[budget.status] ?? budgetStatusTone.ACTIVE}`}>{budget.status}</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
                    <span className="text-ink-dim">Prevu: <b className="text-white">{money.format(budget.plannedAmount)}</b></span>
                    <span className="text-ink-dim">Consomme: <b className="text-amber-200">{money.format(budget.consumedAmount)}</b></span>
                    <span className="text-ink-dim">Reste: <b className="text-emerald-300">{money.format(budget.remainingAmount)}</b></span>
                    <span className="text-ink-dim">Utilisation: <b className="text-cyan-200">{formatPercent(budget.utilization)}</b></span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${budget.utilization >= 100 ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-brand-500 to-cyan-400"}`} style={{ width: barWidth(budget.utilization) }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeModule === "payroll" && (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <ScienceIndicator label="Profils salaries" value={String(expenseOverview.payroll.activeProfiles)} detail="Employes actifs dans le perimetre RH financier." />
                <ScienceIndicator label="Masse salariale" value={money.format(expenseOverview.payroll.totalPayroll)} detail="Total net traite dans les runs de paie." tone="text-brand-100" />
                <ScienceIndicator label="Passif salarial" value={money.format(expenseOverview.payroll.salaryLiability)} detail="Obligation RH restant a couvrir." tone="text-amber-300" />
                <ScienceIndicator label="Passifs institutionnels" value={money.format(totalInstitutionalLiabilities)} detail="Fournisseurs, paie et obligations cumulees." tone="text-red-300" />
              </div>
              <div className="space-y-3">
                {expenseOverview.recentPayrollRuns.slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{run.title}</p>
                        <p className="text-xs text-ink-dim">{run.department ?? "RH"} · {run.periodName ?? "Periode non definie"}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${payrollStatusTone[run.status] ?? payrollStatusTone.DRAFT}`}>{run.status}</span>
                    </div>
                    <p className="mt-3 font-mono text-sm font-bold text-white">{money.format(run.totalNet)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </FinanceErpDialog>
      )}
    </div>
  );
}
