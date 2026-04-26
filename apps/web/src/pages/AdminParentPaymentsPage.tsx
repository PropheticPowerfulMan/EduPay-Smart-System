import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  BrainCircuit,
  CheckCircle2,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
  UserRound,
  WalletCards
} from "lucide-react";
import { api } from "../services/api";
import { useI18n } from "../i18n";

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
};

type Payment = {
  id: string;
  transactionNumber?: string;
  parentId?: string;
  parentFullName?: string;
  reason?: string;
  method?: string;
  amount: number;
  status: "COMPLETED" | "PENDING" | "FAILED" | string;
  createdAt?: string | Date;
  date?: string;
};

const LOCAL_PAYMENT_KEY = "edupay_payments_v2";
const SCHOOL_MONTHS = 10;

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeName(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function parsePaymentDate(payment: Payment) {
  const raw = payment.createdAt ?? payment.date;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function loadLocalPayments(): Payment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PAYMENT_KEY) ?? "[]") as Payment[];
    return raw.map((payment) => ({
      ...payment,
      id: payment.id ?? payment.transactionNumber ?? `local-${Math.random()}`,
      amount: asNumber(payment.amount),
      status: payment.status ?? "COMPLETED"
    }));
  } catch {
    return [];
  }
}

function formatCurrency(value: number) {
  return `$ ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}

function methodLabel(method: string | undefined, fallback: string) {
  return method ? method.replace(/_/g, " ") : fallback;
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "COMPLETED") return t("statusSettled");
  if (status === "PENDING") return t("pendingLabel");
  if (status === "FAILED") return t("statusFailed");
  return status;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function buildMonthlySeries(payments: Payment[], expectedMonthly: number, locale: string) {
  const now = new Date();
  return Array.from({ length: 8 }, (_v, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (7 - index), 1);
    const key = monthKey(date);
    const rows = payments.filter((payment) => monthKey(parsePaymentDate(payment)) === key);
    const paid = rows.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + payment.amount, 0);
    const pending = rows.filter((payment) => payment.status === "PENDING").reduce((sum, payment) => sum + payment.amount, 0);
    const failed = rows.filter((payment) => payment.status === "FAILED").reduce((sum, payment) => sum + payment.amount, 0);
    return {
      month: date.toLocaleDateString(locale, { month: "short" }).replace(".", ""),
      paid,
      pending,
      failed,
      expected: expectedMonthly,
      count: rows.length
    };
  });
}

function linearForecast(values: number[]) {
  if (values.length < 2) return values[0] ?? 0;
  const n = values.length;
  const sumX = values.reduce((sum, _value, index) => sum + index, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
  const sumXX = values.reduce((sum, _value, index) => sum + index * index, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, intercept + slope * n);
}

export function AdminParentPaymentsPage() {
  const { t, lang } = useI18n();
  const [parents, setParents] = useState<Parent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Parent[]>("/api/parents").catch(() => []),
      api<Payment[]>("/api/payments").catch(() => [])
    ]).then(([parentsResult, paymentsResult]) => {
      if (!active) return;
      const apiPayments = paymentsResult.map((payment) => ({
        ...payment,
        amount: asNumber(payment.amount),
        status: payment.status ?? "COMPLETED"
      }));
      const known = new Set(apiPayments.map((payment) => payment.id || payment.transactionNumber));
      const local = loadLocalPayments().filter((payment) => !known.has(payment.id) && !known.has(payment.transactionNumber));
      setParents(parentsResult);
      setPayments([...apiPayments, ...local]);
      setSelectedId((current) => current || parentsResult[0]?.id || "");
    });
    return () => { active = false; };
  }, []);

  const parentAnalyses = useMemo(() => {
    return parents.map((parent) => {
      const parentName = normalizeName(parent.fullName);
      const expected = parent.students.reduce((sum, student) => sum + asNumber(student.annualFee), 0);
      const rows = payments
        .filter((payment) => payment.parentId === parent.id || normalizeName(payment.parentFullName) === parentName)
        .sort((a, b) => parsePaymentDate(b).getTime() - parsePaymentDate(a).getTime());
      const completed = rows.filter((payment) => payment.status === "COMPLETED");
      const pending = rows.filter((payment) => payment.status === "PENDING");
      const failed = rows.filter((payment) => payment.status === "FAILED");
      const paid = completed.reduce((sum, payment) => sum + payment.amount, 0);
      const pendingAmount = pending.reduce((sum, payment) => sum + payment.amount, 0);
      const failedAmount = failed.reduce((sum, payment) => sum + payment.amount, 0);
      const debt = Math.max(expected - paid, 0);
      const coverage = expected > 0 ? clamp((paid / expected) * 100) : 0;
      const expectedMonthly = expected / SCHOOL_MONTHS;
      const monthsCovered = expectedMonthly > 0 ? paid / expectedMonthly : 0;
      const lateMonths = Math.max(SCHOOL_MONTHS - monthsCovered, 0);
      const monthly = buildMonthlySeries(rows, expectedMonthly, lang === "fr" ? "fr-FR" : "en-US");
      const forecast = linearForecast(monthly.map((point) => point.paid));
      const current = monthly.at(-1)?.paid ?? 0;
      const previous = monthly.at(-2)?.paid ?? 0;
      const trend = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
      const lastPayment = completed[0] ? parsePaymentDate(completed[0]) : null;
      const daysSincePayment = lastPayment ? Math.floor((Date.now() - lastPayment.getTime()) / 86_400_000) : null;
      const incidents = pending.length + failed.length;
      const risk = clamp(
        (debt / Math.max(expected, 1)) * 54 +
        lateMonths * 2.8 +
        incidents * 5 +
        Math.max(-trend, 0) * 0.18 +
        (daysSincePayment === null ? 14 : Math.min(daysSincePayment / 5, 14))
      );
      const aiLabel = risk >= 72 ? t("riskCritical") : risk >= 48 ? t("riskWatch") : risk >= 25 ? t("riskFragile") : t("riskHealthy");
      const recommendedAction = risk >= 72
        ? t("actionCritical")
        : risk >= 48
          ? t("actionWatch")
          : debt > 0
            ? t("actionDebt")
            : t("actionOk");
      const studentRows = parent.students.map((student) => {
        const share = expected > 0 ? asNumber(student.annualFee) / expected : 0;
        const allocatedPaid = paid * share;
        const studentDebt = Math.max(asNumber(student.annualFee) - allocatedPaid, 0);
        return {
          ...student,
          allocatedPaid,
          debt: studentDebt,
          coverage: asNumber(student.annualFee) > 0 ? clamp((allocatedPaid / asNumber(student.annualFee)) * 100) : 0
        };
      });
      return {
        parent,
        rows,
        expected,
        paid,
        pendingAmount,
        failedAmount,
        debt,
        coverage,
        expectedMonthly,
        lateMonths,
        monthly,
        forecast,
        trend,
        daysSincePayment,
        incidents,
        risk,
        aiLabel,
        recommendedAction,
        studentRows
      };
    }).sort((a, b) => b.risk - a.risk);
  }, [lang, parents, payments, t]);

  const filteredParents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parentAnalyses;
    return parentAnalyses.filter(({ parent }) =>
      parent.fullName.toLowerCase().includes(q) ||
      parent.id.toLowerCase().includes(q) ||
      (parent.phone ?? "").toLowerCase().includes(q) ||
      (parent.email ?? "").toLowerCase().includes(q)
    );
  }, [parentAnalyses, search]);

  const selected = parentAnalyses.find((row) => row.parent.id === selectedId) ?? parentAnalyses[0];
  const global = useMemo(() => {
    const expected = parentAnalyses.reduce((sum, row) => sum + row.expected, 0);
    const paid = parentAnalyses.reduce((sum, row) => sum + row.paid, 0);
    const debt = parentAnalyses.reduce((sum, row) => sum + row.debt, 0);
    const critical = parentAnalyses.filter((row) => row.risk >= 72).length;
    const watch = parentAnalyses.filter((row) => row.risk >= 48 && row.risk < 72).length;
    return {
      expected,
      paid,
      debt,
      critical,
      watch,
      coverage: expected > 0 ? clamp((paid / expected) * 100) : 0
    };
  }, [parentAnalyses]);

  return (
    <div className="min-w-0 space-y-6 overflow-hidden pb-10">
      <div className="animate-fadeInDown">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">{t("adminParentEyebrow")}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">{t("adminParentTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          {t("adminParentSubtitle")}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: t("globalExpected"), value: formatCurrency(global.expected), icon: Target, color: "text-brand-300" },
          { label: t("collected"), value: formatCurrency(global.paid), icon: CheckCircle2, color: "text-emerald-300" },
          { label: t("remainingToPay"), value: formatCurrency(global.debt), icon: WalletCards, color: "text-red-300" },
          { label: t("coverage"), value: `${global.coverage.toFixed(1)}%`, icon: TrendingUp, color: "text-cyan-300" },
          { label: t("criticalParents"), value: String(global.critical), icon: ShieldAlert, color: "text-amber-300" }
        ].map((item) => (
          <div key={item.label} className="card glass min-w-0 overflow-hidden border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-ink-dim">{item.label}</p>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <p className={`mt-3 truncate font-display text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="card glass min-w-0 overflow-hidden border border-brand-500/10 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchParentPlaceholder")}
              className="w-full !pl-10"
            />
          </div>

          <div className="mt-4 max-h-[680px] space-y-2 overflow-y-auto pr-1">
            {filteredParents.map((row) => (
              <button
                key={row.parent.id}
                type="button"
                onClick={() => setSelectedId(row.parent.id)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  selected?.parent.id === row.parent.id
                    ? "border-brand-400 bg-brand-500/15"
                    : "border-slate-700/60 bg-slate-900/25 hover:border-slate-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{row.parent.fullName}</p>
                    <p className="mt-1 text-xs text-ink-dim">{row.parent.id}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                    row.risk >= 72 ? "bg-red-500/15 text-red-300" : row.risk >= 48 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
                  }`}>
                    {row.risk.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${row.coverage}%` }} />
                </div>
                <div className="mt-2 flex min-w-0 justify-between gap-3 text-xs text-ink-dim">
                  <span className="shrink-0">{row.coverage.toFixed(1)}% {t("covered")}</span>
                  <span className="min-w-0 truncate text-right">{formatCurrency(row.debt)} {t("remains")}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div className="min-w-0 space-y-6">
            <div className="card glass min-w-0 overflow-hidden border border-cyan-500/10 shadow-lg">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-200">
                      <UserRound className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-2xl font-bold text-white">{selected.parent.fullName}</h2>
                      <p className="truncate text-sm text-ink-dim">{selected.parent.phone || t("phoneMissing")} - {selected.parent.email || t("emailMissing")}</p>
                    </div>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm text-ink-dim">{selected.recommendedAction}</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="h-6 w-6 text-cyan-300" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">{t("aiRisk")}</p>
                      <p className="font-mono text-2xl font-black text-white">{selected.risk.toFixed(0)}%</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-cyan-200">{selected.aiLabel}</p>
                </div>
              </div>

              <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  [t("expectedLabel"), formatCurrency(selected.expected), "text-brand-300"],
                  [t("paidLabel"), formatCurrency(selected.paid), "text-emerald-300"],
                  [t("pendingLabel"), formatCurrency(selected.pendingAmount), "text-amber-300"],
                  [t("debtLabel"), formatCurrency(selected.debt), "text-red-300"]
                ].map(([label, value, color]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/30 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{label}</p>
                    <p className={`mt-2 truncate font-mono text-lg font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="card glass min-w-0 overflow-hidden border border-brand-500/10 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-white">{t("monthlyEvolution")}</h3>
                    <p className="mt-1 text-sm text-ink-dim">{t("monthlyEvolutionHelp")}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1 text-xs font-semibold text-cyan-200">
                    {t("forecast")} : {formatCurrency(selected.forecast)}
                  </span>
                </div>
                <div className="mt-5 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selected.monthly}>
                      <defs>
                        <linearGradient id="adminParentPaid" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.38} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" opacity={0.35} />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#fff" }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Area type="monotone" dataKey="paid" name={t("paidLabel")} stroke="#22c55e" fill="url(#adminParentPaid)" strokeWidth={3} />
                      <Line type="monotone" dataKey="expected" name="Objectif" stroke="#38bdf8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card glass min-w-0 overflow-hidden border border-amber-500/10 shadow-lg">
                <h3 className="font-display text-xl font-bold text-white">{t("aiReading")}</h3>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                    <p className="text-xs text-ink-dim">{t("lateMonthsEquivalent")}</p>
                    <p className="mt-1 font-mono text-xl font-bold text-amber-300">{selected.lateMonths.toFixed(1)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                    <p className="text-xs text-ink-dim">{t("lastPayment")}</p>
                    <p className="mt-1 font-mono text-xl font-bold text-white">
                      {selected.daysSincePayment === null ? t("noPayment") : `${selected.daysSincePayment} j`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                    <p className="text-xs text-ink-dim">{t("incidents")}</p>
                    <p className="mt-1 font-mono text-xl font-bold text-red-300">{selected.incidents}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="card glass min-w-0 overflow-hidden border border-emerald-500/10 shadow-lg">
                <h3 className="font-display text-xl font-bold text-white">{t("childCoverage")}</h3>
                <div className="mt-5 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selected.studentRows}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="fullName" stroke="#94a3b8" fontSize={11} tickFormatter={(value) => String(value).split(" ")[0]} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${Math.round(Number(v))}%`} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#fff" }}
                        formatter={(value: number, name) => name === "coverage" ? `${value.toFixed(1)}%` : formatCurrency(value)}
                      />
                      <Bar dataKey="coverage" name={t("coverage")} fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {selected.studentRows.map((student) => (
                    <div key={student.id} className="min-w-0 rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{student.fullName}</p>
                          <p className="truncate text-xs text-ink-dim">{student.className || student.classId || t("classMissing")}</p>
                        </div>
                        <p className="shrink-0 font-mono text-sm font-bold text-brand-300">{student.coverage.toFixed(1)}%</p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${student.coverage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card glass min-w-0 overflow-hidden border border-white/10 shadow-lg">
                <h3 className="font-display text-xl font-bold text-white">{t("detailedHistory")}</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {["Date", "Transaction", "Motif", "Mode", "Montant", "Statut"].map((heading) => (
                          <th key={heading} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-dim">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selected.rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-ink-dim">{t("noPaymentForParent")}</td>
                        </tr>
                      ) : selected.rows.map((payment) => (
                        <tr key={payment.id} className="hover:bg-slate-800/30">
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-dim">
                            {parsePaymentDate(payment).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-brand-300">{payment.transactionNumber || payment.id}</td>
                          <td className="max-w-[180px] truncate px-3 py-3 text-ink-dim" title={payment.reason}>{payment.reason || "-"}</td>
                          <td className="px-3 py-3 text-xs text-ink-dim">{methodLabel(payment.method, t("notProvided"))}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-white">{formatCurrency(payment.amount)}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(payment.status)}`}>
                              {statusLabel(payment.status, t)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card glass border border-white/10 py-16 text-center text-ink-dim">
            {t("noParentForAnalysis")}
          </div>
        )}
      </div>
    </div>
  );
}
