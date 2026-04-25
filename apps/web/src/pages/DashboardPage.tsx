import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Gauge,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
  Zap
} from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type Overview = {
  totalRevenue: number;
  monthlyRevenue: number;
  paymentSuccessRate: number;
  outstandingDebt: number;
};

type Student = {
  id: string;
  fullName: string;
  classId?: string;
  className?: string;
  annualFee: number;
};

type Parent = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students: Student[];
  createdAt?: string;
};

type Payment = {
  id: string;
  transactionNumber?: string;
  parentId?: string;
  parentFullName?: string;
  reason?: string;
  amount: number;
  method?: string;
  status: "COMPLETED" | "PENDING" | "FAILED" | string;
  createdAt?: string | Date;
  date?: string;
};

type MonthlyPoint = {
  label: string;
  revenue: number;
  expected: number;
  pending: number;
  failed: number;
  count: number;
};

const LOCAL_PAYMENT_KEY = "edupay_payments_v2";
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function parseDate(payment: Payment) {
  const raw = payment.createdAt ?? payment.date;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("fr-FR", { month: "short" });
}

function loadLocalPayments(): Payment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PAYMENT_KEY) ?? "[]") as Payment[];
    return raw.map((p) => ({
      ...p,
      id: p.id ?? p.transactionNumber ?? `local-${Math.random()}`,
      amount: asNumber(p.amount),
      status: p.status ?? "COMPLETED"
    }));
  } catch {
    return [];
  }
}

function linearForecast(points: MonthlyPoint[]) {
  const values = points.map((p) => p.revenue);
  if (values.length < 2) return values[0] ?? 0;

  const n = values.length;
  const sumX = values.reduce((s, _v, i) => s + i, 0);
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const sumXX = values.reduce((s, _v, i) => s + i * i, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, intercept + slope * n);
}

function buildMonthlySeries(payments: Payment[], parents: Parent[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_v, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return { key: monthKey(d), label: monthLabel(d), date: d };
  });

  const expectedMonthly = parents.reduce(
    (sum, p) => sum + p.students.reduce((s, st) => s + asNumber(st.annualFee), 0),
    0
  ) / 10;

  return months.map(({ key, label }) => {
    const monthPayments = payments.filter((p) => monthKey(parseDate(p)) === key);
    return {
      label,
      revenue: monthPayments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0),
      expected: expectedMonthly,
      pending: monthPayments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0),
      failed: monthPayments.filter((p) => p.status === "FAILED").reduce((s, p) => s + p.amount, 0),
      count: monthPayments.length
    };
  });
}

function buildClassExposure(parents: Parent[], payments: Payment[]) {
  const completed = payments.filter((p) => p.status === "COMPLETED");
  const paidByParent = new Map<string, number>();

  for (const payment of completed) {
    const keys = [payment.parentId, payment.parentFullName?.toLowerCase()].filter(Boolean) as string[];
    for (const key of keys) paidByParent.set(key, (paidByParent.get(key) ?? 0) + payment.amount);
  }

  const byClass = new Map<string, { expected: number; paid: number; students: number }>();
  for (const parent of parents) {
    const parentPaid = (paidByParent.get(parent.id) ?? 0) + (paidByParent.get(parent.fullName.toLowerCase()) ?? 0);
    const parentExpected = parent.students.reduce((s, st) => s + asNumber(st.annualFee), 0);
    for (const student of parent.students) {
      const className = student.className || student.classId || "Classe inconnue";
      const row = byClass.get(className) ?? { expected: 0, paid: 0, students: 0 };
      const studentExpected = asNumber(student.annualFee);
      row.expected += studentExpected;
      row.paid += parentExpected > 0 ? parentPaid * (studentExpected / parentExpected) : 0;
      row.students += 1;
      byClass.set(className, row);
    }
  }

  return Array.from(byClass.entries())
    .map(([name, row]) => ({
      name,
      students: row.students,
      expected: row.expected,
      paid: row.paid,
      gap: Math.max(row.expected - row.paid, 0),
      coverage: row.expected > 0 ? clamp((row.paid / row.expected) * 100) : 0
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 6);
}

function computeDashboard(overview: Overview, payments: Payment[], parents: Parent[]) {
  const completed = payments.filter((p) => p.status === "COMPLETED");
  const pending = payments.filter((p) => p.status === "PENDING");
  const failed = payments.filter((p) => p.status === "FAILED");
  const revenue = completed.reduce((s, p) => s + p.amount, 0) || overview.totalRevenue;
  const pendingAmount = pending.reduce((s, p) => s + p.amount, 0);
  const failedAmount = failed.reduce((s, p) => s + p.amount, 0);
  const expectedAnnual = parents.reduce((sum, p) => sum + p.students.reduce((s, st) => s + asNumber(st.annualFee), 0), 0);
  const debt = Math.max(expectedAnnual - revenue, overview.outstandingDebt, 0);
  const monthly = buildMonthlySeries(payments, parents);
  const forecast = linearForecast(monthly);
  const current = monthly.at(-1)?.revenue || overview.monthlyRevenue || 0;
  const previous = monthly.at(-2)?.revenue || 0;
  const trend = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  const successRate = payments.length ? (completed.length / payments.length) * 100 : overview.paymentSuccessRate;

  const average = completed.length ? completed.reduce((s, p) => s + p.amount, 0) / completed.length : 0;
  const variance = completed.length
    ? completed.reduce((s, p) => s + Math.pow(p.amount - average, 2), 0) / completed.length
    : 0;
  const deviation = Math.sqrt(variance);
  const anomalies = payments.filter((p) =>
    p.amount <= 0 ||
    (deviation > 0 && p.amount > average + deviation * 2.2) ||
    (!p.parentId && !p.parentFullName) ||
    p.status === "FAILED"
  );

  const dataCompleteness = payments.length
    ? clamp(100 - (payments.filter((p) => !p.parentId && !p.parentFullName).length / payments.length) * 100)
    : parents.length ? 62 : 35;

  const riskScore = clamp(
    (debt / Math.max(expectedAnnual, revenue, 1)) * 45 +
    (100 - successRate) * 0.32 +
    Math.max(-trend, 0) * 0.25 +
    anomalies.length * 4 +
    (100 - dataCompleteness) * 0.18
  );

  const classExposure = buildClassExposure(parents, payments);
  const highRiskParents = parents
    .map((parent) => {
      const expected = parent.students.reduce((s, st) => s + asNumber(st.annualFee), 0);
      const paid = completed
        .filter((p) => p.parentId === parent.id || p.parentFullName?.toLowerCase() === parent.fullName.toLowerCase())
        .reduce((s, p) => s + p.amount, 0);
      const gap = Math.max(expected - paid, 0);
      return {
        id: parent.id,
        name: parent.fullName,
        phone: parent.phone,
        expected,
        paid,
        gap,
        risk: expected > 0 ? clamp((gap / expected) * 100) : 0
      };
    })
    .filter((p) => p.gap > 0)
    .sort((a, b) => b.risk - a.risk || b.gap - a.gap)
    .slice(0, 5);

  const cashTarget = monthly.reduce((s, p) => s + p.expected, 0) / Math.max(monthly.length, 1);
  const runwayMonths = debt > 0 ? clamp(revenue / Math.max(debt / 10, 1), 0, 24) : 24;

  return {
    revenue,
    current,
    forecast,
    trend,
    successRate,
    pendingAmount,
    failedAmount,
    debt,
    expectedAnnual,
    anomalies,
    dataCompleteness,
    riskScore,
    monthly,
    classExposure,
    highRiskParents,
    cashTarget,
    runwayMonths
  };
}

function severity(score: number) {
  if (score >= 70) return { label: "Critique", color: "text-red-300", bg: "bg-red-500/12", border: "border-red-500/35" };
  if (score >= 45) return { label: "Sous surveillance", color: "text-amber-300", bg: "bg-amber-500/12", border: "border-amber-500/35" };
  return { label: "Controle", color: "text-emerald-300", bg: "bg-emerald-500/12", border: "border-emerald-500/35" };
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  icon: Icon
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  icon: typeof Activity;
}) {
  return (
    <div className="card glass border border-brand-500/10 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-dim">{label}</p>
          <p className="font-display text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-ink-dim">{detail}</p>
        </div>
        <div className={`rounded-2xl border p-3 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [overviewResult, paymentsResult, parentsResult] = await Promise.all([
        api<Overview>("/api/analytics/overview").catch(() => null),
        api<Payment[]>("/api/payments").catch(() => []),
        api<Parent[]>("/api/parents").catch(() => [])
      ]);

      if (cancelled) return;

      const localPayments = loadLocalPayments();
      const apiPayments = paymentsResult.map((p) => ({ ...p, amount: asNumber(p.amount), status: p.status ?? "COMPLETED" }));
      const knownIds = new Set(apiPayments.map((p) => p.id || p.transactionNumber));
      const mergedLocal = localPayments.filter((p) => !knownIds.has(p.id) && !knownIds.has(p.transactionNumber));

      setOverview(overviewResult);
      setPayments([...apiPayments, ...mergedLocal]);
      setParents(parentsResult);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const analysis = useMemo(() => computeDashboard(
    overview ?? { totalRevenue: 0, monthlyRevenue: 0, paymentSuccessRate: 0, outstandingDebt: 0 },
    payments,
    parents
  ), [overview, payments, parents]);

  const risk = severity(analysis.riskScore);
  const recoveryPotential = analysis.debt * 0.38 + analysis.pendingAmount * 0.72;
  const chartStatus = [
    { name: "Regles", value: analysis.successRate, color: "#10b981" },
    { name: "Risque", value: 100 - analysis.successRate, color: "#f43f5e" }
  ];
  const radar = [
    { axis: "Encaissement", value: clamp(analysis.successRate) },
    { axis: "Donnees", value: analysis.dataCompleteness },
    { axis: "Tendance", value: clamp(50 + analysis.trend) },
    { axis: "Dette", value: clamp(100 - analysis.riskScore) },
    { axis: "Projection", value: analysis.cashTarget > 0 ? clamp((analysis.forecast / analysis.cashTarget) * 100) : 50 }
  ];
  const decisions = [
    {
      title: "Relance prioritaire",
      impact: USD.format(recoveryPotential),
      detail: `${analysis.highRiskParents.length} familles a traiter en premier selon dette et couverture.`,
      tone: "border-red-500/35 bg-red-500/10 text-red-200"
    },
    {
      title: "Tresorerie previsionnelle",
      impact: USD.format(analysis.forecast),
      detail: `${analysis.trend >= 0 ? "Progression" : "Baisse"} estimee a ${Math.abs(analysis.trend).toFixed(1)}% vs mois precedent.`,
      tone: "border-cyan-500/35 bg-cyan-500/10 text-cyan-200"
    },
    {
      title: "Audit technique",
      impact: `${analysis.anomalies.length}`,
      detail: "Transactions incompletes, echouees ou statistiquement atypiques detectees.",
      tone: "border-amber-500/35 bg-amber-500/10 text-amber-200"
    }
  ];

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">{t("dashboardLoading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 animate-fadeInUp">
      <section className="glass border border-brand-300/15 px-6 py-5 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">Centre de decision intelligent</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">{t("dashboardTitle")} administrateur</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-dim">
              Analyse predictive des paiements, exposition par classe, anomalies operationnelles et actions recommandees pour orienter les decisions futures.
            </p>
          </div>
          <div className={`rounded-2xl border px-5 py-4 ${risk.bg} ${risk.border}`}>
            <div className="flex items-center gap-3">
              <Gauge className={`h-7 w-7 ${risk.color}`} />
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Score de risque global</p>
                <p className={`font-display text-3xl font-bold ${risk.color}`}>{analysis.riskScore.toFixed(0)}%</p>
                <p className="text-xs text-ink-dim">{risk.label}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Encaissements"
          value={USD.format(analysis.revenue)}
          detail={`${analysis.successRate.toFixed(1)}% de paiements regles`}
          tone="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          icon={WalletCards}
        />
        <MetricCard
          label="Projection prochain mois"
          value={USD.format(analysis.forecast)}
          detail={analysis.trend >= 0 ? `Tendance +${analysis.trend.toFixed(1)}%` : `Tendance ${analysis.trend.toFixed(1)}%`}
          tone="border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
          icon={TrendingUp}
        />
        <MetricCard
          label="Dette exposee"
          value={USD.format(analysis.debt)}
          detail={`Potentiel recuperable: ${USD.format(recoveryPotential)}`}
          tone="border-red-500/30 bg-red-500/10 text-red-300"
          icon={ShieldAlert}
        />
        <MetricCard
          label="Qualite des donnees"
          value={`${analysis.dataCompleteness.toFixed(0)}%`}
          detail={`${analysis.anomalies.length} anomalie(s) a auditer`}
          tone="border-amber-500/30 bg-amber-500/10 text-amber-300"
          icon={BrainCircuit}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Trajectoire de tresorerie</h2>
              <p className="mt-1 text-xs text-ink-dim">Revenus reels, objectif theorique et incidents de paiement sur 6 mois.</p>
            </div>
            <div className="rounded-xl border border-brand-300/20 bg-white/[0.04] px-3 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Cible mensuelle</p>
              <p className="font-mono text-sm font-bold text-brand-200">{USD.format(analysis.cashTarget)}</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analysis.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${Number(v) / 1000}k`} />
                <Tooltip contentStyle={{ background: "#0b1a24", border: "1px solid rgba(20,184,222,.25)", borderRadius: 8 }} formatter={(v) => USD.format(Number(v))} />
                <Area type="monotone" dataKey="expected" name="Objectif" stroke="#64748b" fill="rgba(100,116,139,.12)" />
                <Area type="monotone" dataKey="revenue" name="Encaisse" stroke="#14b8de" fill="rgba(20,184,222,.22)" />
                <Line type="monotone" dataKey="pending" name="En attente" stroke="#f59e0b" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass border border-brand-500/10 shadow-lg">
          <h2 className="font-display text-xl font-bold text-white">Matrice de sante financiere</h2>
          <p className="mt-1 text-xs text-ink-dim">Lecture multi-axes pour detecter les fragilites systemiques.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar}>
                <PolarGrid stroke="rgba(148,163,184,.18)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#14b8de" fill="#14b8de" fillOpacity={0.28} />
                <Tooltip contentStyle={{ background: "#0b1a24", border: "1px solid rgba(20,184,222,.25)", borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {decisions.map((item) => (
          <div key={item.title} className={`rounded-2xl border p-5 ${item.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 font-mono text-2xl font-bold">{item.impact}</p>
              </div>
              <Zap className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm text-ink-dim">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Classes a exposition elevee</h2>
              <p className="mt-1 text-xs text-ink-dim">Priorisation par ecart attendu vs regle.</p>
            </div>
            <Target className="h-5 w-5 text-brand-300" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.classExposure}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.12)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${Number(v) / 1000}k`} />
                <Tooltip contentStyle={{ background: "#0b1a24", border: "1px solid rgba(20,184,222,.25)", borderRadius: 8 }} formatter={(v) => USD.format(Number(v))} />
                <Bar dataKey="gap" name="Dette" radius={[8, 8, 0, 0]} fill="#f43f5e" />
                <Bar dataKey="paid" name="Regle" radius={[8, 8, 0, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Statut des flux</h2>
              <p className="mt-1 text-xs text-ink-dim">Repartition operationnelle et tendance court terme.</p>
            </div>
            {analysis.trend >= 0 ? <ArrowUpRight className="h-5 w-5 text-emerald-300" /> : <ArrowDownRight className="h-5 w-5 text-red-300" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartStatus} dataKey="value" innerRadius={58} outerRadius={88} paddingAngle={3}>
                    {chartStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0b1a24", border: "1px solid rgba(20,184,222,.25)", borderRadius: 8 }} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-ink-dim">En attente</p>
                <p className="font-mono text-xl font-bold text-amber-300">{USD.format(analysis.pendingAmount)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-ink-dim">Echoues</p>
                <p className="font-mono text-xl font-bold text-red-300">{USD.format(analysis.failedAmount)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-ink-dim">Couverture temporelle</p>
                <p className="font-mono text-xl font-bold text-cyan-300">{analysis.runwayMonths.toFixed(1)} mois</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Familles critiques</h2>
              <p className="mt-1 text-xs text-ink-dim">Liste courte pour action commerciale ou sociale immediate.</p>
            </div>
            <CalendarClock className="h-5 w-5 text-amber-300" />
          </div>
          <div className="space-y-3">
            {analysis.highRiskParents.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                Aucun parent critique identifie avec les donnees actuelles.
              </div>
            ) : analysis.highRiskParents.map((parent) => (
              <div key={parent.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{parent.name}</p>
                    <p className="text-xs text-ink-dim">{parent.id}{parent.phone ? ` - ${parent.phone}` : ""}</p>
                  </div>
                  <p className="font-mono text-sm font-bold text-red-300">{parent.risk.toFixed(0)}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-red-400" style={{ width: `${parent.risk}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-dim">
                  <span>Paye {USD.format(parent.paid)}</span>
                  <span>Reste {USD.format(parent.gap)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card glass border border-brand-500/10 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Plan d'action technique</h2>
              <p className="mt-1 text-xs text-ink-dim">Recommandations generees par la logique predictive.</p>
            </div>
            <BrainCircuit className="h-5 w-5 text-brand-300" />
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />
                <div>
                  <p className="font-semibold text-white">Automatiser la relance segmentee</p>
                  <p className="mt-1 text-sm text-ink-dim">Priorite aux familles avec risque superieur a 60%, puis message adapte selon montant, anciennete et historique.</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
              <div className="flex gap-3">
                <Activity className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-300" />
                <div>
                  <p className="font-semibold text-white">Surveiller les ruptures de tendance</p>
                  <p className="mt-1 text-sm text-ink-dim">Si le revenu previsionnel reste sous {USD.format(analysis.cashTarget)} deux mois de suite, reduire les depenses non essentielles.</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" />
                <div>
                  <p className="font-semibold text-white">Renforcer la qualite des donnees</p>
                  <p className="mt-1 text-sm text-ink-dim">Rattacher chaque paiement a un parent et a une classe pour fiabiliser les projections et l'audit.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
