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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  Camera,
  CheckCircle2,
  Gauge,
  Lightbulb,
  ShieldCheck,
  Target,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";

type Payment = { amount: number; status: string; createdAt: string; reason?: string };
type Student = { id: string; fullName: string; className?: string; classId?: string; annualFee: number; payments: Payment[] };
type ParentData = { fullName: string; phone: string; email: string; photoUrl?: string; students: Student[] };

type MonthRow = {
  monthName: string;
  expected: number;
  paid: number;
  status: "PAID" | "PARTIAL" | "NOT_PAID";
};

type Insight = {
  title: string;
  body: string;
  tone: "good" | "warn" | "danger" | "info";
};

const SCHOOL_MONTHS = 10;
const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct"];
const pieColors = ["#22c55e", "#f59e0b", "#ef4444"];

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function statusMeta(status: MonthRow["status"], t: (key: string) => string) {
  if (status === "PAID") return { label: t("statusPaid"), color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  if (status === "PARTIAL") return { label: t("statusPartial"), color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" };
  return { label: t("statusNotPaid"), color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" };
}

function parsePaymentDate(payment: Payment) {
  const date = payment.createdAt ? new Date(payment.createdAt) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date, lang: string) {
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short" }).replace(".", "");
}

function buildMonthlyTrend(payments: Array<Payment & { studentName: string }>, expectedPerMonth: number, lang: string) {
  const now = new Date();
  return Array.from({ length: 6 }, (_v, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = monthKey(date);
    const paid = payments
      .filter((p) => p.status === "COMPLETED" && monthKey(parsePaymentDate(p)) === key)
      .reduce((sum, p) => sum + asNumber(p.amount), 0);
    return {
      month: monthLabel(date, lang),
      payé: paid,
      attendu: expectedPerMonth,
      écart: Math.max(expectedPerMonth - paid, 0)
    };
  });
}

function linearForecast(values: number[]) {
  if (values.length < 2) return values[0] ?? 0;
  const n = values.length;
  const sumX = values.reduce((sum, _v, i) => sum + i, 0);
  const sumY = values.reduce((sum, v) => sum + v, 0);
  const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
  const sumXX = values.reduce((sum, _v, i) => sum + i * i, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, intercept + slope * n);
}

function insightToneClasses(tone: Insight["tone"]) {
  if (tone === "good") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  if (tone === "warn") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-red-500/25 bg-red-500/10 text-red-100";
  return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
}

function imageFileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Veuillez choisir une image valide."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 360;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Image non lisible."));
        const minSide = Math.min(image.width, image.height);
        ctx.drawImage(image, (image.width - minSide) / 2, (image.height - minSide) / 2, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = () => reject(new Error("Image non lisible."));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Image non lisible."));
    reader.readAsDataURL(file);
  });
}

export function ParentTrackingPage() {
  const { t, lang } = useI18n();
  const setPhotoUrl = useAuthStore((s) => s.setPhotoUrl);
  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    let active = true;
    api<ParentData>("/api/parents/me")
      .then((parentData) => {
        if (!active) return;
        setData(parentData);
        setPhotoUrl(parentData.photoUrl || null);
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Impossible de charger l'espace parent.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }),
    [lang]
  );
  const formatMoney = (value: number) => moneyFormatter.format(value);

  const updatePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      const photoUrl = await imageFileToAvatar(file);
      const result = await api<{ photoUrl: string }>("/api/parents/me/photo", {
        method: "PUT",
        body: JSON.stringify({ photoUrl })
      });
      setData((current) => current ? { ...current, photoUrl: result.photoUrl } : current);
      setPhotoUrl(result.photoUrl || null);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : t("profilePhotoFailed"));
    } finally {
      setPhotoSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!data) return null;

    const allPayments = data.students.flatMap((student) =>
      student.payments.map((payment) => ({ ...payment, studentName: student.fullName }))
    );
    const completedPayments = allPayments.filter((p) => p.status === "COMPLETED");
    const pendingPayments = allPayments.filter((p) => p.status === "PENDING");
    const failedPayments = allPayments.filter((p) => p.status === "FAILED");

    const totalExpected = data.students.reduce((sum, student) => sum + asNumber(student.annualFee), 0);
    const totalPaid = completedPayments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
    const pendingAmount = pendingPayments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
    const failedAmount = failedPayments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
    const totalDebt = Math.max(totalExpected - totalPaid, 0);
    const completionRate = totalExpected > 0 ? clamp((totalPaid / totalExpected) * 100) : 0;
    const expectedPerMonth = totalExpected / SCHOOL_MONTHS;
    const coveredMonths = expectedPerMonth > 0 ? totalPaid / expectedPerMonth : 0;
    const unpaidMonthEquivalent = Math.max(SCHOOL_MONTHS - coveredMonths, 0);
    const nextInstallment = totalDebt > 0 ? Math.min(expectedPerMonth, totalDebt) : 0;
    const monthlyTrend = buildMonthlyTrend(allPayments, expectedPerMonth, lang);
    const forecastNextMonth = linearForecast(monthlyTrend.map((p) => p.payé));
    const currentMonthPaid = monthlyTrend.at(-1)?.payé ?? 0;
    const previousMonthPaid = monthlyTrend.at(-2)?.payé ?? 0;
    const trendRate = previousMonthPaid > 0
      ? ((currentMonthPaid - previousMonthPaid) / previousMonthPaid) * 100
      : currentMonthPaid > 0 ? 100 : 0;

    const paymentTimeline = completedPayments
      .sort((a, b) => parsePaymentDate(b).getTime() - parsePaymentDate(a).getTime())
      .slice(0, 6);

    const studentsMetrics = data.students.map((student) => {
      const annualFee = asNumber(student.annualFee);
      const monthlyExpected = annualFee / SCHOOL_MONTHS;
      const completed = student.payments.filter((p) => p.status === "COMPLETED");
      const paid = completed.reduce((sum, p) => sum + asNumber(p.amount), 0);
      const debt = Math.max(annualFee - paid, 0);
      const progress = annualFee > 0 ? clamp((paid / annualFee) * 100) : 0;
      const lastPayment = completed
        .map((p) => parsePaymentDate(p))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const daysSincePayment = lastPayment
        ? Math.max(0, Math.floor((Date.now() - lastPayment.getTime()) / 86_400_000))
        : null;

      const monthRows: MonthRow[] = monthNames.map((monthName, monthIndex) => {
        const expected = monthlyExpected;
        const paidForMonth = Math.min(Math.max(paid - monthIndex * monthlyExpected, 0), monthlyExpected);
        const status: MonthRow["status"] = paidForMonth >= expected ? "PAID" : paidForMonth > 0 ? "PARTIAL" : "NOT_PAID";
        return { monthName, expected, paid: paidForMonth, status };
      });

      const missingMonths = monthRows.filter((row) => row.status !== "PAID").length;
      const risk = clamp(
        (debt / Math.max(annualFee, 1)) * 55 +
        missingMonths * 3.5 +
        (daysSincePayment === null ? 18 : Math.min(daysSincePayment / 4, 18))
      );

      return {
        ...student,
        annualFee,
        paid,
        debt,
        progress,
        monthlyExpected,
        missingMonths,
        monthRows,
        daysSincePayment,
        risk
      };
    });

    const worstStudent = [...studentsMetrics].sort((a, b) => b.risk - a.risk)[0];
    const bestStudent = [...studentsMetrics].sort((a, b) => b.progress - a.progress)[0];
    const paymentVelocity = monthlyTrend.reduce((sum, row) => sum + row.payé, 0) / Math.max(monthlyTrend.length, 1);
    const monthsToClearDebt = paymentVelocity > 0 ? totalDebt / paymentVelocity : totalDebt > 0 ? Infinity : 0;
    const debtRatio = totalExpected > 0 ? totalDebt / totalExpected : 0;
    const incidentRatio = allPayments.length > 0 ? (pendingPayments.length + failedPayments.length) / allPayments.length : 0;
    const aiScore = clamp(100 - debtRatio * 52 - incidentRatio * 16 - Math.max(-trendRate, 0) * 0.2 - unpaidMonthEquivalent * 2.1);
    const riskLevel = aiScore >= 82 ? "Situation saine" : aiScore >= 62 ? "À surveiller" : aiScore >= 42 ? "Risque élevé" : "Risque critique";
    const recommendedMonthly = totalDebt > 0
      ? Math.max(nextInstallment, totalDebt / Math.max(1, Math.ceil(Math.min(monthsToClearDebt, SCHOOL_MONTHS))))
      : 0;

    const insights: Insight[] = [];
    if (completionRate >= 90) {
      insights.push({
        tone: "good",
        title: "Excellent niveau de couverture",
        body: "Le dossier financier est presque totalement réglé. Conservez ce rythme pour éviter les pénalités de fin d'année."
      });
    } else if (completionRate >= 60) {
      insights.push({
        tone: "warn",
        title: "Règlement partiel à stabiliser",
        body: `Il reste ${formatMoney(totalDebt)} à couvrir. Un paiement régulier de ${formatMoney(recommendedMonthly)} aiderait à terminer sans pression.`
      });
    } else {
      insights.push({
        tone: "danger",
        title: "Priorité au plan de rattrapage",
        body: `Le taux de couverture est de ${completionRate.toFixed(1)} %. L'IA recommande de prioriser les mensualités fixes.`
      });
    }

    if (worstStudent && worstStudent.debt > 0) {
      insights.push({
        tone: worstStudent.risk >= 65 ? "danger" : "info",
        title: `Attention sur ${worstStudent.fullName}`,
        body: `Dette restante : ${formatMoney(worstStudent.debt)}. Score de risque estimé : ${worstStudent.risk.toFixed(0)} %.`
      });
    }

    if (trendRate < -15) {
      insights.push({
        tone: "warn",
        title: "Baisse du rythme de paiement",
        body: `Le mois courant est en recul de ${Math.abs(trendRate).toFixed(1)} % par rapport au mois précédent.`
      });
    } else if (trendRate > 10) {
      insights.push({
        tone: "good",
        title: "Rythme de paiement en amélioration",
        body: `Les paiements progressent de ${trendRate.toFixed(1)} % par rapport au mois précédent.`
      });
    }

    if (pendingAmount > 0) {
      insights.push({
        tone: "info",
        title: "Paiements en attente",
        body: `${formatMoney(pendingAmount)} sont encore en attente de validation. Vérifiez leur confirmation avec l'école.`
      });
    }

    const allocationData = studentsMetrics.map((student) => ({
      name: student.fullName.split(" ")[0],
      payé: student.paid,
      reste: student.debt,
      couverture: student.progress
    }));

    const statusDistribution = [
      { name: "Réglé", value: totalPaid },
      { name: "En attente", value: pendingAmount },
      { name: "Reste", value: totalDebt }
    ].filter((item) => item.value > 0);

    return {
      totalExpected,
      totalPaid,
      pendingAmount,
      failedAmount,
      totalDebt,
      completionRate,
      expectedPerMonth,
      coveredMonths,
      unpaidMonthEquivalent,
      nextInstallment,
      forecastNextMonth,
      trendRate,
      paymentTimeline,
      studentsMetrics,
      monthlyTrend,
      aiScore,
      riskLevel,
      recommendedMonthly,
      monthsToClearDebt,
      insights,
      allocationData,
      statusDistribution,
      bestStudent,
      worstStudent
    };
  }, [data, lang, moneyFormatter]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-r from-brand-500 to-accent" />
        </div>
      </div>
    );
  }

  if (!data || !summary) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl border border-amber-500/25 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Espace parent</p>
          <h1 className="mt-3 font-display text-2xl font-bold text-white">Données indisponibles</h1>
          <p className="mt-3 text-sm text-ink-dim">
            {loadError ?? "Le backend ne repond pas pour le moment. Reessayez dans quelques instants."}
          </p>
        </div>
      </div>
    );
  }

  const aiTone = summary.aiScore >= 82
    ? "from-emerald-500 to-cyan-500"
    : summary.aiScore >= 62
      ? "from-amber-500 to-cyan-500"
      : "from-red-500 to-amber-500";

  return (
    <div className="w-full max-w-full min-w-0 space-y-8 overflow-x-hidden pb-8 animate-fadeInUp">
      <div className="glass max-w-full overflow-hidden rounded-2xl border border-brand-500/20 px-4 py-6 shadow-xl animate-fadeInDown sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">Espace parent intelligent</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">{t("parentTracking")}</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-dim">{t("parentFinancialDeepSubtitle")}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <div className="flex items-center gap-3">
              <BrainCircuit className="h-6 w-6 text-cyan-300" />
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Score IA</p>
                <p className="font-mono text-2xl font-black text-white">{summary.aiScore.toFixed(0)}/100</p>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-cyan-200">{summary.riskLevel}</p>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="card glass min-w-0 overflow-hidden border border-brand-500/10 shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-brand-500 to-accent">
                {data.photoUrl ? (
                  <img src={data.photoUrl} alt={data.fullName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                    {data.fullName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-ink-dim">{t("parentName")}</p>
                <p className="break-words font-display text-2xl font-bold text-white">{data.fullName}</p>
                <p className="mt-2 break-words text-sm text-ink-dim">{data.phone} · {data.email}</p>
                {!data.photoUrl && <p className="mt-2 text-xs text-amber-200">{t("parentPhotoMissing")}</p>}
                {photoError && <p className="mt-2 text-xs text-danger">{photoError}</p>}
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-200 hover:bg-brand-500/20">
                  <Camera className="h-4 w-4" />
                  {photoSaving ? t("pmSaving") : t("parentPhotoAction")}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => void updatePhoto(event.target.files?.[0])} />
                </label>
              </div>
            </div>
            <div className="hidden">
              <p className="text-sm text-ink-dim">{t("parentName")}</p>
              <p className="break-words font-display text-2xl font-bold text-white">{data.fullName}</p>
              <p className="mt-2 break-words text-sm text-ink-dim">{data.phone} · {data.email}</p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
              {[
                { label: "Enfants", value: String(data.students.length), icon: Target, color: "text-brand-300" },
                { label: "Mois couverts", value: summary.coveredMonths.toFixed(1), icon: CalendarClock, color: "text-cyan-300" },
                { label: "Risque max", value: `${(summary.worstStudent?.risk ?? 0).toFixed(0)}%`, icon: AlertTriangle, color: "text-amber-300" },
                { label: "Meilleur suivi", value: `${(summary.bestStudent?.progress ?? 0).toFixed(0)}%`, icon: CheckCircle2, color: "text-emerald-300" }
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/30 p-3">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <p className="mt-2 text-xs text-ink-dim">{item.label}</p>
                  <p className={`break-words font-mono text-lg font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card glass min-w-0 overflow-hidden border border-cyan-500/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Diagnostic IA</h2>
              <p className="mt-1 text-sm text-ink-dim">Synthèse automatique de votre situation de paiement.</p>
            </div>
            <Gauge className="h-7 w-7 text-cyan-300" />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${aiTone} transition-all duration-700`}
              style={{ width: `${summary.aiScore}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-dim">Prochain mois prévu</p>
              <p className="font-mono text-sm font-bold text-cyan-200">{formatMoney(summary.forecastNextMonth)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-dim">Tendance</p>
              <p className={`font-mono text-sm font-bold ${summary.trendRate >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {summary.trendRate >= 0 ? "+" : ""}{summary.trendRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-dim">Mensualité conseillée</p>
              <p className="font-mono text-sm font-bold text-amber-200">{formatMoney(summary.recommendedMonthly)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("expectedTotal"), value: formatMoney(summary.totalExpected), icon: WalletCards, color: "text-brand-300", border: "border-brand-500/10" },
          { label: t("paidTotal"), value: formatMoney(summary.totalPaid), icon: CheckCircle2, color: "text-emerald-300", border: "border-emerald-500/10" },
          { label: t("debtTotal"), value: formatMoney(summary.totalDebt), icon: AlertTriangle, color: "text-red-300", border: "border-red-500/10" },
          { label: t("parentCompletionRate"), value: `${summary.completionRate.toFixed(1)}%`, icon: TrendingUp, color: "text-cyan-300", border: "border-cyan-500/10" }
        ].map((card) => (
          <div key={card.label} className={`card glass min-w-0 overflow-hidden shadow-lg ${card.border}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-dim">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className={`mt-3 break-words font-display text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="card glass min-w-0 overflow-hidden border border-brand-500/10 shadow-lg xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Évolution mensuelle</h2>
              <p className="mt-1 text-sm text-ink-dim">Comparaison entre les paiements reçus et l'objectif mensuel.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1 text-xs font-semibold text-cyan-200">
              Objectif : {formatMoney(summary.expectedPerMonth)} / mois
            </div>
          </div>
          <div className="mt-5 h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.monthlyTrend}>
                <defs>
                  <linearGradient id="parentPaid" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#fff" }}
                  formatter={(value: number) => formatMoney(value)}
                />
                <Area type="monotone" dataKey="payé" stroke="#22c55e" fill="url(#parentPaid)" strokeWidth={3} />
                <Line type="monotone" dataKey="attendu" stroke="#38bdf8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass min-w-0 overflow-hidden border border-emerald-500/10 shadow-lg">
          <h2 className="font-display text-xl font-bold text-white">Répartition financière</h2>
          <p className="mt-1 text-sm text-ink-dim">Vue rapide entre payé, attente et reste à payer.</p>
          <div className="mt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary.statusDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {summary.statusDistribution.map((_entry, index) => (
                    <Cell key={index} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#fff" }}
                  formatter={(value: number) => formatMoney(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {summary.statusDistribution.map((item, index) => (
              <div key={item.name} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink-dim">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[index % pieColors.length] }} />
                  {item.name}
                </span>
                <span className="shrink-0 font-mono font-bold text-white">{formatMoney(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="card glass min-w-0 overflow-hidden border border-cyan-500/10 shadow-lg">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-6 w-6 text-amber-300" />
            <div>
              <h2 className="font-display text-xl font-bold text-white">Recommandations IA</h2>
              <p className="text-sm text-ink-dim">Actions prioritaires générées à partir de vos paiements.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {summary.insights.map((insight) => (
              <div key={insight.title} className={`rounded-xl border p-4 ${insightToneClasses(insight.tone)}`}>
                <p className="font-bold">{insight.title}</p>
                <p className="mt-1 text-sm opacity-90">{insight.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card glass min-w-0 overflow-hidden border border-brand-500/10 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Plan de paiement conseillé</h2>
              <p className="mt-1 text-sm text-ink-dim">Simulation automatique pour ramener le dossier à zéro.</p>
            </div>
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
          </div>
          <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{t("nextInstallment")}</p>
              <p className="mt-2 break-words font-mono text-lg font-bold text-amber-300">{formatMoney(summary.nextInstallment)}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Mensualité IA</p>
              <p className="mt-2 break-words font-mono text-lg font-bold text-cyan-300">{formatMoney(summary.recommendedMonthly)}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/30 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Délai estimé</p>
              <p className="mt-2 font-mono text-lg font-bold text-white">
                {Number.isFinite(summary.monthsToClearDebt) ? `${Math.ceil(summary.monthsToClearDebt)} mois` : "À définir"}
              </p>
            </div>
          </div>
          <div className="mt-5 h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.allocationData}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" opacity={0.35} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#fff" }}
                  formatter={(value: number) => formatMoney(value)}
                />
                <Bar dataKey="payé" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reste" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid w-full min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="card glass w-full min-w-0 max-w-full overflow-hidden border border-emerald-500/10 shadow-lg">
          <h2 className="font-display text-xl font-bold text-white mb-4">{t("recentPayments")}</h2>
          <div className="min-w-0 space-y-3">
            {summary.paymentTimeline.length === 0 && (
              <p className="text-sm text-ink-dim">{t("noPaymentsYet")}</p>
            )}
            {summary.paymentTimeline.map((payment, index) => (
              <div key={`${payment.studentName}-${index}`} className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0 overflow-hidden">
                    <p className="truncate text-sm font-semibold text-white">{payment.studentName}</p>
                    <p className="mt-1 text-xs text-ink-dim">
                      {parsePaymentDate(payment).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                    </p>
                  </div>
                  <p className="max-w-[45vw] truncate text-right text-sm font-bold text-emerald-300 sm:max-w-none">{formatMoney(payment.amount)}</p>
                </div>
                {payment.reason && <p className="mt-2 break-words text-xs text-ink-dim">{payment.reason}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full min-w-0 max-w-full space-y-6 overflow-hidden">
          {summary.studentsMetrics.map((student, index) => (
            <div key={student.id} className="card glass w-full min-w-0 max-w-full overflow-hidden border border-brand-500/10 shadow-lg animate-fadeInUp" style={{ animationDelay: `${index * 0.08}s` }}>
              <div className="min-w-0 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-300">
                      {student.className || student.classId || "Classe non renseignée"}
                    </p>
                    <h3 className="mt-1 break-words font-display text-xl font-bold text-white">{student.fullName}</h3>
                    <p className="mt-1 text-sm text-ink-dim">
                      {t("annualFees")}: <span className="font-semibold text-brand-300">{formatMoney(student.annualFee)}</span>
                    </p>
                  </div>
                  <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/40 px-3 py-1.5">
                    <span className="text-xs text-ink-dim">{t("remainingDebt")}</span>
                    <span className="break-all text-sm font-bold text-rose-300">{formatMoney(student.debt)}</span>
                  </div>
                </div>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                    <p className="text-xs text-ink-dim">{t("paidTotal")}</p>
                    <p className="mt-1 break-words text-lg font-bold text-emerald-300">{formatMoney(student.paid)}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                    <p className="text-xs text-ink-dim">{t("monthlyInstallment")}</p>
                    <p className="mt-1 break-words text-lg font-bold text-cyan-300">{formatMoney(student.monthlyExpected)}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                    <p className="text-xs text-ink-dim">{t("unpaidMonths")}</p>
                    <p className="mt-1 text-lg font-bold text-amber-300">{student.missingMonths}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-700/50 bg-slate-900/25 p-3">
                    <p className="text-xs text-ink-dim">Risque IA</p>
                    <p className={`mt-1 text-lg font-bold ${student.risk >= 65 ? "text-red-300" : student.risk >= 35 ? "text-amber-300" : "text-emerald-300"}`}>
                      {student.risk.toFixed(0)}%
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-ink-dim">{t("financialProgress")}</p>
                    <p className="font-semibold text-brand-300">{student.progress.toFixed(1)}%</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-700/50">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all duration-500"
                      style={{ width: `${student.progress}%` }}
                    />
                  </div>
                </div>

                <div className="edupay-scrollbar -mx-2 max-w-[calc(100%+1rem)] overflow-x-auto px-2">
                  <table className="w-full min-w-[430px] text-sm sm:min-w-[520px]">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-2 py-3 text-left font-semibold text-ink-dim">{t("month")}</th>
                        <th className="px-2 py-3 text-left font-semibold text-ink-dim">{t("expected")}</th>
                        <th className="px-2 py-3 text-left font-semibold text-ink-dim">{t("paid")}</th>
                        <th className="px-2 py-3 text-left font-semibold text-ink-dim">{t("status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.monthRows.map((row) => {
                        const status = statusMeta(row.status, t);
                        return (
                          <tr key={row.monthName} className="border-b border-slate-700/30 transition-colors hover:bg-slate-800/30">
                            <td className="px-2 py-3 font-medium text-white">{row.monthName}</td>
                            <td className="px-2 py-3 text-ink-dim">{formatMoney(row.expected)}</td>
                            <td className="px-2 py-3 font-semibold text-white">{formatMoney(row.paid)}</td>
                            <td className={`px-2 py-3 font-semibold ${status.color}`}>
                              <span className={`inline-block rounded-full border px-2 py-1 ${status.bg}`}>
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
    </div>
  );
}
