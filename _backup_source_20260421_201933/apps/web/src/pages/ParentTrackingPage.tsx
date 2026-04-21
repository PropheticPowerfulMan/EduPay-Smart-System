import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type Payment = { amount: number; status: string; createdAt: string };
type Student = { id: string; fullName: string; annualFee: number; payments: Payment[] };
type ParentData = { fullName: string; phone: string; email: string; students: Student[] };

type MonthRow = {
  monthName: string;
  expected: number;
  paid: number;
  status: "PAID" | "PARTIAL" | "NOT_PAID";
};

const months = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct"];
const SCHOOL_MONTHS = 10;

function statusMeta(status: MonthRow["status"], t: (key: string) => string) {
  if (status === "PAID") return { label: t("statusPaid"), color: "text-emerald-400" };
  if (status === "PARTIAL") return { label: t("statusPartial"), color: "text-amber-400" };
  return { label: t("statusNotPaid"), color: "text-red-400" };
}

export function ParentTrackingPage() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<ParentData | null>(null);

  useEffect(() => {
    api<ParentData>("/api/parents/me").then(setData).catch(() => undefined);
  }, []);

  const formatMoney = (value: number) => `${new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(Math.round(value))} FC`;

  const summary = useMemo(() => {
    if (!data) return null;

    const totalExpected = data.students.reduce((s, st) => s + st.annualFee, 0);
    const totalPaid = data.students.reduce((s, st) => s + st.payments.reduce((ps, p) => ps + (p.status === "COMPLETED" ? p.amount : 0), 0), 0);
    const totalDebt = Math.max(totalExpected - totalPaid, 0);
    const completionRate = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

    const expectedPerMonth = totalExpected / SCHOOL_MONTHS;
    const coveredMonths = expectedPerMonth > 0 ? totalPaid / expectedPerMonth : 0;
    const obligationsMonthsLate = Math.max(SCHOOL_MONTHS - coveredMonths, 0);
    const nextInstallment = totalDebt > 0 ? Math.min(expectedPerMonth, totalDebt) : 0;

    const paymentTimeline = data.students
      .flatMap((st) => st.payments.map((p) => ({ ...p, studentName: st.fullName })))
      .filter((p) => p.status === "COMPLETED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    const studentsMetrics = data.students.map((st) => {
      const monthlyExpected = st.annualFee / SCHOOL_MONTHS;
      const paid = st.payments.reduce((s, p) => s + (p.status === "COMPLETED" ? p.amount : 0), 0);
      const debt = Math.max(st.annualFee - paid, 0);
      const progress = st.annualFee > 0 ? Math.min((paid / st.annualFee) * 100, 100) : 0;

      const monthRows: MonthRow[] = months.map((m, monthIdx) => {
        const expected = monthlyExpected;
        const paidForMonth = Math.min(Math.max(paid - monthIdx * monthlyExpected, 0), monthlyExpected);
        const status: MonthRow["status"] = paidForMonth >= expected ? "PAID" : paidForMonth > 0 ? "PARTIAL" : "NOT_PAID";
        return { monthName: m, expected, paid: paidForMonth, status };
      });

      const missingMonths = monthRows.filter((r) => r.status !== "PAID").length;

      return {
        ...st,
        paid,
        debt,
        progress,
        monthlyExpected,
        missingMonths,
        monthRows
      };
    });

    return {
      totalExpected,
      totalPaid,
      totalDebt,
      completionRate,
      expectedPerMonth,
      obligationsMonthsLate,
      nextInstallment,
      paymentTimeline,
      studentsMetrics
    };
  }, [data]);

  if (!data || !summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse">
          <div className="h-12 w-12 bg-gradient-to-r from-brand-500 to-accent rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("parentTracking")}</h1>
        <p className="text-ink-dim mt-2">{t("parentFinancialDeepSubtitle")}</p>
      </div>

      <div className="card animate-fadeInUp">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-ink-dim mb-1">{t("parentName")}</p>
            <p className="font-display text-2xl font-bold text-white">{data.fullName}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-ink-dim mb-1">{t("parentPhone")}</p>
              <p className="font-semibold text-white">{data.phone}</p>
            </div>
            <div>
              <p className="text-sm text-ink-dim mb-1">{t("email")}</p>
              <p className="font-semibold text-white">{data.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="card">
          <p className="text-ink-dim text-sm mb-2">{t("expectedTotal")}</p>
          <p className="font-display text-2xl font-bold text-brand-300">{formatMoney(summary.totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-ink-dim text-sm mb-2">{t("paidTotal")}</p>
          <p className="font-display text-2xl font-bold text-emerald-400">{formatMoney(summary.totalPaid)}</p>
        </div>
        <div className="card">
          <p className="text-ink-dim text-sm mb-2">{t("debtTotal")}</p>
          <p className="font-display text-2xl font-bold text-red-400">{formatMoney(summary.totalDebt)}</p>
        </div>
        <div className="card">
          <p className="text-ink-dim text-sm mb-2">{t("parentCompletionRate")}</p>
          <p className="font-display text-2xl font-bold text-cyan-300">{summary.completionRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="font-display text-xl font-bold text-white mb-5">{t("financialObligations")}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
              <p className="text-xs text-ink-dim uppercase tracking-[0.1em]">{t("monthlyInstallment")}</p>
              <p className="mt-2 text-lg font-bold text-white">{formatMoney(summary.expectedPerMonth)}</p>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
              <p className="text-xs text-ink-dim uppercase tracking-[0.1em]">{t("nextInstallment")}</p>
              <p className="mt-2 text-lg font-bold text-amber-300">{formatMoney(summary.nextInstallment)}</p>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
              <p className="text-xs text-ink-dim uppercase tracking-[0.1em]">{t("estimatedLateMonths")}</p>
              <p className="mt-2 text-lg font-bold text-rose-300">{summary.obligationsMonthsLate.toFixed(1)}</p>
            </div>
          </div>
          <div className="mt-5 h-2 rounded-full bg-slate-700/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-700"
              style={{ width: `${Math.min(summary.completionRate, 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-ink-dim">{t("financialHealthHint")}</p>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-bold text-white mb-4">{t("recentPayments")}</h2>
          <div className="space-y-3">
            {summary.paymentTimeline.length === 0 && (
              <p className="text-sm text-ink-dim">{t("noPaymentsYet")}</p>
            )}
            {summary.paymentTimeline.map((payment, idx) => (
              <div key={`${payment.studentName}-${idx}`} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                <p className="text-sm font-semibold text-white">{payment.studentName}</p>
                <p className="text-xs text-ink-dim mt-1">{new Date(payment.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                <p className="text-sm text-emerald-300 font-bold mt-1">{formatMoney(payment.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {summary.studentsMetrics.map((student, idx) => (
          <div key={student.id} className="card animate-fadeInUp" style={{ animationDelay: `${idx * 0.1}s` }}>
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">{student.fullName}</h3>
                  <p className="text-sm text-ink-dim mt-1">
                    {t("annualFees")}: <span className="text-brand-300 font-semibold">{formatMoney(student.annualFee)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/40 px-3 py-1.5">
                  <span className="text-xs text-ink-dim">{t("remainingDebt")}</span>
                  <span className="text-sm font-bold text-rose-300">{formatMoney(student.debt)}</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                  <p className="text-xs text-ink-dim">{t("paidTotal")}</p>
                  <p className="text-lg font-bold text-emerald-300 mt-1">{formatMoney(student.paid)}</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                  <p className="text-xs text-ink-dim">{t("monthlyInstallment")}</p>
                  <p className="text-lg font-bold text-cyan-300 mt-1">{formatMoney(student.monthlyExpected)}</p>
                </div>
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                  <p className="text-xs text-ink-dim">{t("unpaidMonths")}</p>
                  <p className="text-lg font-bold text-amber-300 mt-1">{student.missingMonths}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <p className="text-ink-dim">{t("financialProgress")}</p>
                  <p className="font-semibold text-brand-300">{student.progress.toFixed(1)}%</p>
                </div>
                <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all duration-500"
                    style={{ width: `${Math.min(student.progress, 100)}%` }}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-3 px-2 text-ink-dim font-semibold">{t("month")}</th>
                      <th className="text-left py-3 px-2 text-ink-dim font-semibold">{t("expected")}</th>
                      <th className="text-left py-3 px-2 text-ink-dim font-semibold">{t("paid")}</th>
                      <th className="text-left py-3 px-2 text-ink-dim font-semibold">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.monthRows.map((row) => {
                      const status = statusMeta(row.status, t);
                      return (
                        <tr key={row.monthName} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-2 text-white font-medium">{row.monthName}</td>
                          <td className="py-3 px-2 text-ink-dim">{formatMoney(row.expected)}</td>
                          <td className="py-3 px-2 text-white font-semibold">{formatMoney(row.paid)}</td>
                          <td className={`py-3 px-2 font-semibold ${status.color}`}>
                            <span className="inline-block px-2 py-1 rounded-full bg-slate-800/50 border border-current/30">
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
