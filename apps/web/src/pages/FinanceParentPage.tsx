import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  BrainCircuit,
  CalendarClock,
  Camera,
  CheckCircle2,
  FileClock,
  FileText,
  Gauge,
  HandCoins,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X
} from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";

type FinanceSnapshot = {
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  parent: {
    id: string;
    fullName: string;
    phone: string;
    email: string;
    preferredLanguage: string;
    photoUrl?: string;
  };
  profile: {
    activeTuitionPlan: string;
    totalPaid: number;
    totalDebt: number;
    totalReduction: number;
    carriedOverDebt: number;
    overdueInstallments: number;
    pendingPaymentsTotal: number;
    failedPaymentsTotal: number;
    paymentBehaviorScore: number;
    lastPaymentAt: string | null;
    childrenLinkedToAccount: number;
    expectedNetRevenue: number;
    completionRate: number;
  };
  students: Array<{
    id: string;
    fullName: string;
    className?: string | null;
    gradeGroup: string;
    paymentOptionType: string;
    paymentOptionLabel: string;
    expectedTotal: number;
    reductionTotal: number;
    originalAmount: number;
    planName: string;
    agreementId: string | null;
    paid: number;
    balance: number;
    overdueInstallments: number;
    completionRate: number;
    installments: Array<{
      id: string;
      label: string;
      dueDate: string;
      amountDue: number;
      amountPaid: number;
      balance: number;
      status: string;
      isOverdue: boolean;
    }>;
  }>;
  reductions: Array<{
    id: string;
    title: string;
    amount: number;
    percentage: number | null;
    scope: string;
    gradeGroup: string | null;
    paymentOptionType: string | null;
    effectiveDate: string;
    studentName?: string | null;
  }>;
  debts: Array<{
    id: string;
    title: string;
    reason?: string | null;
    originalAmount: number;
    amountRemaining: number;
    status: string;
    academicYearId?: string;
    academicYearName?: string | null;
    carriedOverFromYearId?: string | null;
    carriedOverFromYearName?: string | null;
    dueDate?: string | null;
    settledAt?: string | null;
    createdAt: string;
  }>;
  agreements: Array<{
    id: string;
    title: string;
    status: string;
    customTotal: number;
    reductionAmount: number;
    balanceDue: number;
    notes?: string | null;
    privateNotes?: string | null;
    createdAt: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
    status: string;
    createdAt: string;
  }>;
  paymentHistory: Array<{
    id: string;
    transactionNumber: string;
    amount: number;
    reason: string;
    method: string;
    status: string;
    createdAt: string;
    receiptNumber?: string | null;
    allocationTrace?: AllocationTrace | null;
    students: Array<{ id: string; fullName: string }>;
  }>;
  historicalReceipts: Array<{
    id: string;
    receiptNumber: string;
    transactionNumber: string;
    allocationTrace?: AllocationTrace | null;
    createdAt: string;
  }>;
  notificationHistory?: Array<{
    id: string;
    type: string;
    channel: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
};

type AllocationTrace = {
  mode?: string;
  traceSource: string;
  totalReceived: number;
  allocatedTotal: number;
  advanceBalance: number;
  perChild: Array<{
    studentId: string | null;
    studentName: string;
    allocated: number;
    remaining: number;
    lines: Array<{
      allocationId: string;
      installmentId: string;
      label: string;
      dueDate: string;
      amountDue: number;
      allocated: number;
      outstandingAfter: number;
      status: string;
    }>;
  }>;
};

type ParentLight = {
  photoUrl?: string;
};

type ParentFinanceModule = "students" | "obligations" | "forecast" | "debts" | "alerts" | "reductions" | "agreements" | "payments" | "notifications";

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
        if (!ctx) {
          reject(new Error("Image non lisible."));
          return;
        }
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

function statusTone(status: string) {
  if (status === "PAID" || status === "COMPLETED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIALLY_PAID" || status === "PENDING") return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  if (status === "OVERDUE" || status === "FAILED") return "border-red-500/25 bg-red-500/10 text-red-200";
  return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
}

function severityTone(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") return "border-red-500/25 bg-red-500/10 text-red-100";
  if (severity === "MEDIUM") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
}

function channelTone(channel: string) {
  if (channel === "EMAIL") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (channel === "SMS") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  if (channel === "DASHBOARD") return "border-brand-500/25 bg-brand-500/10 text-brand-100";
  return "border-slate-500/25 bg-slate-500/10 text-slate-200";
}

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
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
    <div className="card glass min-w-0 overflow-hidden border border-white/10 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-dim">{label}</p>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
      <p className={`mt-3 break-words font-display text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-2 text-xs text-ink-dim">{detail}</p>
    </div>
  );
}

function ParentInsightCard({
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
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-dim">{label}</p>
      <p className={`mt-2 break-words font-display text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-dim">{detail}</p>
    </div>
  );
}

function AllocationTraceBlock({ trace, money, lang }: { trace?: AllocationTrace | null; money: Intl.NumberFormat; lang: string }) {
  if (!trace) return null;
  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-black uppercase tracking-[0.16em] text-emerald-100">Repartition tracee {trace.mode ? `(${trace.mode})` : ""}</p>
        <p className="font-mono font-bold text-emerald-200">{money.format(trace.allocatedTotal)} applique / {money.format(trace.totalReceived)} recu</p>
      </div>
      {trace.advanceBalance > 0 && <p className="mt-1 text-xs text-emerald-100">Avance conservee: {money.format(trace.advanceBalance)}</p>}
      <div className="mt-3 grid gap-2">
        {trace.perChild.map((child) => (
          <div key={`${child.studentId ?? child.studentName}-${child.allocated}`} className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <p className="font-semibold text-white">{child.studentName}</p>
              <p className="font-mono text-emerald-200">{money.format(child.allocated)} applique · reste {money.format(child.remaining)}</p>
            </div>
            <div className="mt-2 space-y-1 text-xs text-ink-dim">
              {child.lines.map((line) => (
                <p key={line.allocationId}>
                  {line.label} ({new Date(line.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}): {money.format(line.allocated)} applique, solde {money.format(line.outstandingAfter)} · {line.status}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParentFinanceDialog({
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
    <div className="edupay-parent-tracking-dialog fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-5">
      <button aria-label="Fermer" className="absolute inset-0 bg-slate-950/78 backdrop-blur-md" onClick={onClose} />
      <section className="edupay-parent-tracking-modal relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/95 shadow-2xl">
        <header className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Suivi parent</p>
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

export function FinanceParentPage() {
  const { lang } = useI18n();
  const setPhotoUrl = useAuthStore((state) => state.setPhotoUrl);
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [photoUrl, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [activeModule, setActiveModule] = useState<ParentFinanceModule | null>(null);

  useEffect(() => {
    let active = true;
    const loadParentFinance = (showLoader: boolean) => {
      if (showLoader) setLoading(true);
      Promise.all([
        api<FinanceSnapshot>("/api/finance/me/profile"),
        api<ParentLight>("/api/parents/me").catch(() => ({ photoUrl: "" }))
      ])
        .then(([financeData, parentLight]) => {
        if (!active) return;
        setSnapshot({
          ...financeData,
          parent: {
            ...financeData.parent,
            photoUrl: parentLight.photoUrl || financeData.parent.photoUrl || ""
          }
        });
        setPhotoPreview(parentLight.photoUrl || financeData.parent.photoUrl || null);
        setPhotoUrl(parentLight.photoUrl || financeData.parent.photoUrl || null);
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Impossible de charger le profil financier parent.");
      })
      .finally(() => {
        if (active && showLoader) setLoading(false);
      });
    };

    loadParentFinance(true);
    const timer = window.setInterval(() => loadParentFinance(false), 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [setPhotoUrl]);

  const money = useMemo(
    () => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    [lang]
  );

  const moneyInstallment = useMemo(
    () => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }),
    [lang]
  );
  const L = (fr: string, en: string) => lang === "fr" ? fr : en;

  const updatePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      const nextPhotoUrl = await imageFileToAvatar(file);
      const result = await api<{ photoUrl: string }>("/api/parents/me/photo", {
        method: "PUT",
        body: JSON.stringify({ photoUrl: nextPhotoUrl })
      });
      setPhotoPreview(result.photoUrl || null);
      setPhotoUrl(result.photoUrl || null);
      setSnapshot((current) => current ? {
        ...current,
        parent: {
          ...current.parent,
          photoUrl: result.photoUrl
        }
      } : current);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Impossible de mettre a jour la photo.");
    } finally {
      setPhotoSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">{L("Chargement de votre profil financier KCS...", "Loading your KCS financial profile...")}</p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-amber-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{L("Espace parent financier", "Parent finance area")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">{L("Profil financier indisponible", "Financial profile unavailable")}</h1>
          <p className="mt-3 text-sm text-ink-dim">{loadError ?? "Le moteur financier ne repond pas pour le moment."}</p>
        </div>
      </div>
    );
  }

  const activeAgreement = snapshot.agreements[0] ?? null;
  const previousYearDebts = snapshot.debts.filter((debt) =>
    Boolean(debt.carriedOverFromYearId || debt.carriedOverFromYearName) ||
    Boolean(debt.academicYearId && debt.academicYearId !== snapshot.academicYear.id)
  );
  const activeDebtTotal = snapshot.debts.reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0);
  const previousDebtTotal = previousYearDebts.reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0);
  const openInstallments = snapshot.students.flatMap((student) =>
    student.installments
      .filter((installment) => installment.balance > 0)
      .map((installment) => ({ ...installment, studentName: student.fullName, className: student.className ?? "", planName: student.planName }))
  ).sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime());
  const nextInstallment = openInstallments.find((installment) => daysUntil(installment.dueDate) >= 0) ?? openInstallments[0] ?? null;
  const overdueBalance = openInstallments.filter((installment) => installment.isOverdue).reduce((sum, installment) => sum + installment.balance, 0);
  const next30DaysBalance = openInstallments
    .filter((installment) => {
      const delay = daysUntil(installment.dueDate);
      return delay >= 0 && delay <= 30;
    })
    .reduce((sum, installment) => sum + installment.balance, 0);
  const completedPayments = snapshot.paymentHistory.filter((payment) => payment.status === "COMPLETED");
  const latestPayment = completedPayments[0] ?? null;
  const averagePayment = completedPayments.length
    ? completedPayments.reduce((sum, payment) => sum + payment.amount, 0) / completedPayments.length
    : 0;
  const projectedRemainingAfter30Days = Math.max(snapshot.profile.totalDebt - Math.max(averagePayment, next30DaysBalance), 0);
  const obligationHealthScore = Math.max(0, Math.min(100,
    snapshot.profile.completionRate * 0.45 +
    snapshot.profile.paymentBehaviorScore * 0.35 +
    Math.max(0, 100 - snapshot.profile.overdueInstallments * 12) * 0.12 +
    Math.max(0, 100 - (snapshot.profile.expectedNetRevenue > 0 ? (snapshot.profile.carriedOverDebt / snapshot.profile.expectedNetRevenue) * 100 : 0)) * 0.08
  ));
  const obligationHealthTone = obligationHealthScore >= 80 ? "text-emerald-300" : obligationHealthScore >= 58 ? "text-amber-300" : "text-red-300";
  const obligationHealthLabel = obligationHealthScore >= 80 ? L("Stable", "Stable") : obligationHealthScore >= 58 ? L("À surveiller", "Watch") : L("Critique", "Critical");
  const notificationHistory = snapshot.notificationHistory ?? [];
  const moduleCards: Array<{
    id: ParentFinanceModule;
    title: string;
    subtitle: string;
    count: number;
    metric: string;
    icon: typeof WalletCards;
    tone: string;
  }> = [
    { id: "students", title: L("Enfants et échéanciers", "Children & schedules"), subtitle: L("Plans, tranches, soldes et progression par enfant.", "Plans, installments, balances and progress per child."), count: snapshot.students.length, metric: L(`${snapshot.profile.completionRate.toFixed(1)} % couvert`, `${snapshot.profile.completionRate.toFixed(1)}% covered`), icon: CalendarClock, tone: "border-brand-300/20 bg-brand-500/10 text-brand-100" },
    { id: "obligations", title: L("Obligations globales", "Global obligations"), subtitle: L("Tout ce qui reste à payer envers l'école, consolidé par urgence.", "Everything still owed to the school, grouped by urgency."), count: openInstallments.length + snapshot.debts.length, metric: money.format(snapshot.profile.totalDebt), icon: Gauge, tone: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" },
    { id: "forecast", title: L("Prévisions", "Forecasts"), subtitle: L("Projection à 30 jours, score de santé et risque de retard.", "30-day projection, health score and late-payment risk."), count: openInstallments.length, metric: money.format(projectedRemainingAfter30Days), icon: BrainCircuit, tone: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100" },
    { id: "debts", title: L("Dettes historiques", "Historical debts"), subtitle: L("Années antérieures, reports, origine, échéance et solde restant.", "Previous years, carry-overs, source, due date and remaining balance."), count: snapshot.debts.length, metric: money.format(previousDebtTotal), icon: FileClock, tone: "border-red-300/20 bg-red-500/10 text-red-100" },
    { id: "alerts", title: L("Alertes", "Alerts"), subtitle: L("Retards et anomalies détectés par le moteur financier.", "Late payments and anomalies detected by the finance engine."), count: snapshot.alerts.length, metric: L(`${snapshot.profile.overdueInstallments} retard(s)`, `${snapshot.profile.overdueInstallments} late item(s)`), icon: AlertTriangle, tone: "border-amber-300/20 bg-amber-500/10 text-amber-100" },
    { id: "reductions", title: L("Réductions", "Discounts"), subtitle: L("Remises officielles, réductions manuelles et contexte.", "Official discounts, manual reductions and context."), count: snapshot.reductions.length, metric: money.format(snapshot.profile.totalReduction), icon: HandCoins, tone: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100" },
    { id: "agreements", title: L("Accords", "Agreements"), subtitle: L("Accords spéciaux, montants personnalisés et statut.", "Special agreements, custom amounts and status."), count: snapshot.agreements.length, metric: activeAgreement ? money.format(activeAgreement.balanceDue) : L("Aucun", "None"), icon: ShieldCheck, tone: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" },
    { id: "payments", title: L("Paiements et reçus", "Payments & receipts"), subtitle: L("Historique des encaissements et reçus archivés.", "Payment history and archived receipts."), count: snapshot.paymentHistory.length + snapshot.historicalReceipts.length, metric: money.format(snapshot.profile.totalPaid), icon: ReceiptText, tone: "border-violet-300/20 bg-violet-500/10 text-violet-100" },
    { id: "notifications", title: L("Messages reçus", "Received messages"), subtitle: L("SMS, e-mails, confirmations et alertes envoyés par EduPay.", "SMS, emails, confirmations and alerts sent by EduPay."), count: notificationHistory.length, metric: L(`${notificationHistory.filter((log) => log.channel === "SMS" || log.channel === "EMAIL").length} directs`, `${notificationHistory.filter((log) => log.channel === "SMS" || log.channel === "EMAIL").length} direct`), icon: BellRing, tone: "border-orange-300/20 bg-orange-500/10 text-orange-100" }
  ];
  const selectedModule = moduleCards.find((module) => module.id === activeModule) ?? null;

  return (
    <div className="space-y-8 pb-10 animate-fadeInUp">
      <section className="glass rounded-2xl border border-brand-500/20 px-4 py-6 shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-br from-brand-500 to-accent">
              {photoUrl ? (
                <img src={photoUrl} alt={snapshot.parent.fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-black text-white">
                  {snapshot.parent.fullName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">KCS parent financial profile</p>
              <h1 className="mt-2 break-words font-display text-3xl font-bold text-white">{snapshot.parent.fullName}</h1>
              <p className="mt-2 break-words text-sm text-ink-dim">{snapshot.parent.phone} · {snapshot.parent.email}</p>
              <p className="mt-3 text-sm text-cyan-100">{L("Plan actif", "Active plan")} : {snapshot.profile.activeTuitionPlan}</p>
              {activeAgreement && (
                <p className="mt-1 text-sm text-amber-200">{L("Accord spécial actif", "Active special agreement")} : {activeAgreement.title}</p>
              )}
              {photoError && <p className="mt-2 text-xs text-red-300">{photoError}</p>}
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-200 hover:bg-brand-500/20">
                <Camera className="h-4 w-4" />
                {photoSaving ? L("Mise a jour photo...", "Updating photo...") : L("Mettre a jour la photo", "Update photo")}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void updatePhoto(event.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{L("Score comportemental", "Behavior score")}</p>
              <p className="mt-2 font-display text-3xl font-bold text-white">{snapshot.profile.paymentBehaviorScore.toFixed(0)}%</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{L("Annee academique", "Academic year")}</p>
              <p className="mt-2 font-display text-3xl font-bold text-white">{snapshot.academicYear.name}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label={L("Total payé", "Total paid")} value={money.format(snapshot.profile.totalPaid)} detail={L("Encaissements validés", "Validated collections")} icon={CheckCircle2} tone="text-emerald-300" />
        <MetricCard label={L("Dette totale", "Total debt")} value={money.format(snapshot.profile.totalDebt)} detail={L("Dette active + reports", "Active debt + carry-overs")} icon={WalletCards} tone="text-red-300" />
        <MetricCard label={L("Réductions", "Discounts")} value={money.format(snapshot.profile.totalReduction)} detail={L(`${snapshot.reductions.length} avantage(s) suivi(s)`, `${snapshot.reductions.length} tracked benefit(s)`)} icon={HandCoins} tone="text-cyan-300" />
        <MetricCard label={L("Reports", "Carry-over")} value={money.format(snapshot.profile.carriedOverDebt)} detail={L("Dettes des années précédentes", "Debts from previous years")} icon={FileClock} tone="text-amber-300" />
        <MetricCard label={L("Couverture", "Completion")} value={`${snapshot.profile.completionRate.toFixed(1)} %`} detail={L(`${snapshot.profile.childrenLinkedToAccount} enfant(s) lié(s)`, `${snapshot.profile.childrenLinkedToAccount} linked child/children`)} icon={ShieldCheck} tone="text-brand-200" />
        <MetricCard label={L("En retard", "Overdue")} value={String(snapshot.profile.overdueInstallments)} detail={L(`En attente : ${money.format(snapshot.profile.pendingPaymentsTotal)}`, `Pending ${money.format(snapshot.profile.pendingPaymentsTotal)}`)} icon={AlertTriangle} tone="text-orange-300" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="glass min-w-0 border border-white/10 p-4 shadow-lg sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">{L("Temps reel financier", "Real-time finance")}</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">{L("Evolution globale du foyer", "Household financial progress")}</h2>
              <p className="mt-2 text-sm text-ink-dim">{L("Mise a jour automatique toutes les 30 secondes lorsque le portail parent reste ouvert.", "Automatically refreshes every 30 seconds while the parent portal stays open.")}</p>
            </div>
            <Activity className={`h-7 w-7 shrink-0 ${obligationHealthTone}`} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[150px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center">
              <p className={`font-display text-4xl font-bold ${obligationHealthTone}`}>{obligationHealthScore.toFixed(0)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-dim">{L("score foyer", "household score")}</p>
              <p className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white">{obligationHealthLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ParentInsightCard label={L("Prochaine echeance", "Next due item")} value={nextInstallment ? money.format(nextInstallment.balance) : L("Aucune", "None")} detail={nextInstallment ? `${nextInstallment.studentName} - ${nextInstallment.label} - ${new Date(nextInstallment.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}` : L("Toutes les echeances visibles sont couvertes.", "All visible installments are covered.")} tone={nextInstallment?.isOverdue ? "text-red-300" : "text-cyan-300"} />
              <ParentInsightCard label={L("Dans 30 jours", "Next 30 days")} value={money.format(next30DaysBalance)} detail={L("Somme des obligations dues dans les 30 prochains jours.", "Total obligations due within the next 30 days.")} tone="text-amber-300" />
              <ParentInsightCard label={L("Retard actuel", "Current overdue")} value={money.format(overdueBalance)} detail={L(`${snapshot.profile.overdueInstallments} echeance(s) signalee(s) en retard.`, `${snapshot.profile.overdueInstallments} installment(s) flagged as late.`)} tone={overdueBalance > 0 ? "text-red-300" : "text-emerald-300"} />
              <ParentInsightCard label={L("Paiement moyen", "Average payment")} value={money.format(averagePayment)} detail={latestPayment ? L(`Dernier paiement: ${new Date(latestPayment.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}`, `Last payment: ${new Date(latestPayment.createdAt).toLocaleDateString("en-US")}`) : L("Aucun paiement complet recent.", "No recent completed payment.")} tone="text-emerald-300" />
            </div>
          </div>
        </div>

        <div className="glass min-w-0 border border-white/10 p-4 shadow-lg sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">{L("Obligations envers l'ecole", "Obligations to the school")}</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">{L("Lecture immediate", "Immediate overview")}</h2>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">{L("Email + SMS + tableau de bord", "Email + SMS + dashboard")}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ParentInsightCard label={L("Net attendu", "Expected net")} value={money.format(snapshot.profile.expectedNetRevenue)} detail={L("Total annuel apres reductions.", "Annual total after discounts.")} />
            <ParentInsightCard label={L("Deja couvert", "Already covered")} value={money.format(snapshot.profile.totalPaid)} detail={L(`${snapshot.profile.completionRate.toFixed(1)}% de progression.`, `${snapshot.profile.completionRate.toFixed(1)}% progress.`)} tone="text-emerald-300" />
            <ParentInsightCard label={L("Reste a couvrir", "Remaining")} value={money.format(snapshot.profile.totalDebt)} detail={L("Solde actif et reports historiques.", "Active balance and historical carry-overs.")} tone="text-red-300" />
            <ParentInsightCard label={L("Projection solde", "Projected balance")} value={money.format(projectedRemainingAfter30Days)} detail={L("Dette estimee apres le prochain cycle.", "Estimated debt after the next cycle.")} tone={projectedRemainingAfter30Days <= snapshot.profile.totalDebt * 0.5 ? "text-emerald-300" : "text-amber-300"} />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, snapshot.profile.completionRate))}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-dim">{L("Progression consolidee de tous les enfants pris en charge.", "Consolidated progress for all covered children.")}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {moduleCards.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => setActiveModule(module.id)}
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
                  <span className="mt-2 block text-sm text-ink-dim">{module.subtitle}</span>
                  <span className="mt-4 flex min-w-0 items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-brand-100">
                    <span>{module.metric}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 normal-case tracking-normal text-white group-hover:border-brand-300/30">Ouvrir</span>
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {selectedModule && (
        <ParentFinanceDialog title={selectedModule.title} subtitle={selectedModule.subtitle} onClose={() => setActiveModule(null)}>
          {activeModule === "students" && (
            <div className="space-y-5">
              {snapshot.students.map((student) => {
                const nextDue = student.installments.find((installment) => installment.balance > 0) ?? null;
                return (
                  <article key={student.id} className="rounded-2xl border border-brand-500/10 bg-slate-950/40 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-300">{student.className ?? "Classe non renseignee"}</p>
                        <h3 className="mt-1 font-display text-2xl font-bold text-white">{student.fullName}</h3>
                        <p className="mt-2 text-sm text-ink-dim">{student.planName}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">{student.paymentOptionLabel}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{student.gradeGroup}</span>
                          {student.agreementId && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-200">Owner agreement</span>}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
                        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"><p className="text-xs text-ink-dim">Expected</p><p className="mt-2 font-mono text-lg font-bold text-white">{money.format(student.expectedTotal)}</p></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"><p className="text-xs text-ink-dim">Balance</p><p className="mt-2 font-mono text-lg font-bold text-red-300">{money.format(student.balance)}</p></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"><p className="text-xs text-ink-dim">Reduction</p><p className="mt-2 font-mono text-lg font-bold text-cyan-300">{money.format(student.reductionTotal)}</p></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"><p className="text-xs text-ink-dim">Next due</p><p className="mt-2 text-sm font-semibold text-white">{nextDue ? new Date(nextDue.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : "Fully covered"}</p></div>
                      </div>
                    </div>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, student.completionRate))}%` }} />
                    </div>
                    <div className="edupay-scrollbar mt-5 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead><tr className="border-b border-slate-700/50 text-left text-ink-dim"><th className="px-3 py-3">Installment</th><th className="px-3 py-3">Due date</th><th className="px-3 py-3">Amount due</th><th className="px-3 py-3">Paid</th><th className="px-3 py-3">Balance</th><th className="px-3 py-3">Status</th></tr></thead>
                        <tbody>
                          {student.installments.map((installment) => (
                            <tr key={installment.id} className="border-b border-slate-700/25">
                              <td className="px-3 py-3 font-medium text-white">{installment.label}</td>
                              <td className="px-3 py-3 text-ink-dim">{new Date(installment.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</td>
                              <td className="px-3 py-3 font-mono text-white">{moneyInstallment.format(installment.amountDue)}</td>
                              <td className="px-3 py-3 font-mono text-emerald-300">{moneyInstallment.format(installment.amountPaid)}</td>
                              <td className="px-3 py-3 font-mono text-red-300">{moneyInstallment.format(installment.balance)}</td>
                              <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(installment.status)}`}>{installment.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeModule === "obligations" && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <ParentInsightCard label="Reste total" value={money.format(snapshot.profile.totalDebt)} detail="Toutes obligations ouvertes envers l'ecole." tone="text-red-300" />
                <ParentInsightCard label="Retard" value={money.format(overdueBalance)} detail="Echeances deja depassees." tone={overdueBalance > 0 ? "text-red-300" : "text-emerald-300"} />
                <ParentInsightCard label="30 prochains jours" value={money.format(next30DaysBalance)} detail="Pression de paiement immediate." tone="text-amber-300" />
                <ParentInsightCard label="Reports historiques" value={money.format(previousDebtTotal)} detail="Dettes issues des annees precedentes." tone="text-orange-300" />
              </div>
              <div className="space-y-3">
                {openInstallments.length === 0 && <p className="text-sm text-ink-dim">Aucune obligation ouverte dans les echeanciers actuels.</p>}
                {openInstallments.map((installment) => {
                  const delay = daysUntil(installment.dueDate);
                  return (
                    <article key={installment.id} className={`rounded-2xl border p-4 ${installment.isOverdue ? "border-red-500/25 bg-red-500/10" : delay <= 30 ? "border-amber-500/25 bg-amber-500/10" : "border-white/10 bg-slate-950/40"}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-white">{installment.studentName} - {installment.label}</p>
                          <p className="mt-1 text-sm text-ink-dim">{installment.planName} · {installment.className || "Classe non renseignee"}</p>
                        </div>
                        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(installment.status)}`}>{installment.status}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
                        <div><p className="text-ink-dim">Echeance</p><p className="font-semibold text-white">{new Date(installment.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p></div>
                        <div><p className="text-ink-dim">Jours</p><p className={delay < 0 ? "font-semibold text-red-300" : "font-semibold text-cyan-300"}>{delay < 0 ? `${Math.abs(delay)} jour(s) de retard` : `${delay} jour(s) restants`}</p></div>
                        <div><p className="text-ink-dim">Montant attendu</p><p className="font-mono font-semibold text-white">{moneyInstallment.format(installment.amountDue)}</p></div>
                        <div><p className="text-ink-dim">Solde</p><p className="font-mono font-semibold text-red-300">{moneyInstallment.format(installment.balance)}</p></div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {activeModule === "forecast" && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ParentInsightCard label="Score foyer" value={`${obligationHealthScore.toFixed(0)}/100`} detail={obligationHealthLabel} tone={obligationHealthTone} />
                <ParentInsightCard label="Cash requis 30j" value={money.format(next30DaysBalance)} detail="Montant a preparer sur les prochaines echeances." tone="text-amber-300" />
                <ParentInsightCard label="Solde projete" value={money.format(projectedRemainingAfter30Days)} detail="Projection apres un cycle de paiement moyen." tone={projectedRemainingAfter30Days <= snapshot.profile.totalDebt * 0.5 ? "text-emerald-300" : "text-red-300"} />
                <ParentInsightCard label="Paiement moyen" value={money.format(averagePayment)} detail={`${completedPayments.length} paiement(s) complet(s) analyses.`} tone="text-emerald-300" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <h3 className="font-display text-xl font-bold text-white">Lecture predictive</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Scenario favorable</p>
                    <p className="mt-2 font-mono text-lg font-bold text-emerald-300">{money.format(Math.max(snapshot.profile.totalDebt - Math.max(averagePayment * 1.5, next30DaysBalance), 0))}</p>
                    <p className="mt-1 text-xs text-ink-dim">Si le prochain paiement depasse la moyenne recente.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Scenario courant</p>
                    <p className="mt-2 font-mono text-lg font-bold text-amber-300">{money.format(projectedRemainingAfter30Days)}</p>
                    <p className="mt-1 text-xs text-ink-dim">Si le comportement recent reste stable.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Scenario risque</p>
                    <p className="mt-2 font-mono text-lg font-bold text-red-300">{money.format(snapshot.profile.totalDebt + next30DaysBalance)}</p>
                    <p className="mt-1 text-xs text-ink-dim">Si aucune echeance proche n'est regularisee.</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {snapshot.students.map((student) => (
                  <div key={student.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="font-semibold text-white">{student.fullName}</p><p className="text-xs text-ink-dim">{student.planName}</p></div>
                      <p className="font-mono text-sm font-bold text-cyan-300">{student.completionRate.toFixed(1)}%</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, student.completionRate))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeModule === "debts" && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Dette totale suivie" value={money.format(activeDebtTotal)} detail={`${snapshot.debts.length} ligne(s) de dette`} icon={WalletCards} tone="text-red-300" />
                <MetricCard label="Annees anterieures" value={money.format(previousDebtTotal)} detail={`${previousYearDebts.length} report(s) historique(s)`} icon={FileClock} tone="text-amber-300" />
                <MetricCard label="Annee active" value={snapshot.academicYear.name} detail="Periode de reference actuelle" icon={CalendarClock} tone="text-cyan-300" />
              </div>
              {snapshot.debts.length === 0 && <p className="text-sm text-ink-dim">Aucune dette enregistree.</p>}
              {snapshot.debts.map((debt) => {
                const isHistorical = previousYearDebts.some((entry) => entry.id === debt.id);
                return (
                  <article key={debt.id} className={`rounded-2xl border p-4 ${isHistorical ? "border-amber-500/25 bg-amber-500/10" : "border-white/10 bg-slate-950/40"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{debt.title}</p>
                        <p className="mt-1 text-sm text-ink-dim">{debt.reason || "Dette suivie par le moteur financier."}</p>
                        {isHistorical && <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Dette d'annee anterieure / report historique</p>}
                      </div>
                      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(debt.status)}`}>{debt.status}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Montant initial</p><p className="mt-1 font-mono font-bold text-white">{money.format(debt.originalAmount)}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Solde restant</p><p className="mt-1 font-mono font-bold text-red-300">{money.format(debt.amountRemaining)}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Annee dette</p><p className="mt-1 font-semibold text-white">{debt.academicYearName || debt.academicYearId || snapshot.academicYear.name}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Origine report</p><p className="mt-1 font-semibold text-white">{debt.carriedOverFromYearName || debt.carriedOverFromYearId || "Non reportee"}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Echeance</p><p className="mt-1 font-semibold text-white">{debt.dueDate ? new Date(debt.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : "Non definie"}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Creee le</p><p className="mt-1 font-semibold text-white">{new Date(debt.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">Reglee le</p><p className="mt-1 font-semibold text-white">{debt.settledAt ? new Date(debt.settledAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : "Non reglee"}</p></div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">ID dette</p><p className="mt-1 break-all font-mono text-xs font-semibold text-cyan-200">{debt.id}</p></div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeModule === "alerts" && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <ParentInsightCard label="Alertes actives" value={String(snapshot.alerts.length)} detail="Issues du moteur financier EduPay." tone="text-amber-300" />
                <ParentInsightCard label="SMS / Email" value={String(notificationHistory.filter((log) => log.channel === "SMS" || log.channel === "EMAIL").length)} detail="Messages directs deja traces." tone="text-cyan-300" />
                <ParentInsightCard label="Retard detecte" value={money.format(overdueBalance)} detail="Montant actuellement en retard." tone={overdueBalance > 0 ? "text-red-300" : "text-emerald-300"} />
              </div>
              {snapshot.alerts.length === 0 && <p className="text-sm text-ink-dim">Aucune alerte active.</p>}
              {snapshot.alerts.map((alert) => (
                <div key={alert.id} className={`rounded-2xl border p-4 ${severityTone(alert.severity)}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{alert.title}</p><p className="mt-1 text-sm opacity-90">{alert.message}</p></div><span className="text-xs font-bold uppercase tracking-[0.16em]">{alert.severity}</span></div>
                  <p className="mt-3 text-xs opacity-80">{new Date(alert.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                </div>
              ))}
            </div>
          )}

          {activeModule === "reductions" && (
            <div className="space-y-3">
              {snapshot.reductions.length === 0 && <p className="text-sm text-ink-dim">Aucune reduction appliquee.</p>}
              {snapshot.reductions.map((reduction) => (
                <div key={reduction.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{reduction.title}</p><p className="mt-1 text-xs text-ink-dim">{reduction.studentName || "Compte parent"} - {reduction.scope}</p></div><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">{money.format(reduction.amount)}</span></div>
                  <p className="mt-2 text-xs text-ink-dim">{new Date(reduction.effectiveDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                </div>
              ))}
            </div>
          )}

          {activeModule === "agreements" && (
            <div className="space-y-3">
              {snapshot.agreements.length === 0 && <p className="text-sm text-ink-dim">Aucun accord special actif.</p>}
              {snapshot.agreements.map((agreement) => (
                <div key={agreement.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{agreement.title}</p><p className="mt-1 text-sm text-ink-dim">{agreement.notes || "Accord personnalise valide par l'administration."}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(agreement.status)}`}>{agreement.status}</span></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm"><div><p className="text-ink-dim">Custom total</p><p className="font-mono font-semibold text-white">{money.format(agreement.customTotal)}</p></div><div><p className="text-ink-dim">Reduction</p><p className="font-mono font-semibold text-cyan-300">{money.format(agreement.reductionAmount)}</p></div><div><p className="text-ink-dim">Balance due</p><p className="font-mono font-semibold text-red-300">{money.format(agreement.balanceDue)}</p></div></div>
                </div>
              ))}
            </div>
          )}

          {activeModule === "payments" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="space-y-3">
                <h3 className="font-display text-xl font-bold text-white">Payment history</h3>
                {snapshot.paymentHistory.length === 0 && <p className="text-sm text-ink-dim">Aucun paiement historique disponible.</p>}
                {snapshot.paymentHistory.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-white">{payment.reason}</p><p className="mt-1 text-xs text-ink-dim">{payment.transactionNumber} - {new Date(payment.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p></div><div className="text-right"><p className="font-mono text-lg font-bold text-emerald-300">{money.format(payment.amount)}</p><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(payment.status)}`}>{payment.status}</span></div></div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{payment.method}</span>{payment.receiptNumber && <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">{payment.receiptNumber}</span>}{payment.students.map((student) => <span key={student.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{student.fullName}</span>)}</div>
                    <AllocationTraceBlock trace={payment.allocationTrace} money={moneyInstallment} lang={lang} />
                  </div>
                ))}
              </section>
              <section className="space-y-3">
                <h3 className="font-display text-xl font-bold text-white">Historical receipts</h3>
                {snapshot.historicalReceipts.length === 0 && <p className="text-sm text-ink-dim">Aucun recu archive.</p>}
                {snapshot.historicalReceipts.map((receipt) => (
                  <div key={receipt.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white">{receipt.receiptNumber}</p><p className="text-xs text-ink-dim">{receipt.transactionNumber}</p></div><p className="text-xs text-ink-dim">{new Date(receipt.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p></div><AllocationTraceBlock trace={receipt.allocationTrace} money={moneyInstallment} lang={lang} /></div>
                ))}
              </section>
            </div>
          )}

          {activeModule === "notifications" && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <ParentInsightCard label="Total messages" value={String(notificationHistory.length)} detail="Historique recent conserve par EduPay." />
                <ParentInsightCard label="Emails" value={String(notificationHistory.filter((log) => log.channel === "EMAIL").length)} detail="Confirmations et rappels envoyes par mail." tone="text-cyan-300" />
                <ParentInsightCard label="SMS" value={String(notificationHistory.filter((log) => log.channel === "SMS").length)} detail="Rappels courts sur telephone." tone="text-emerald-300" />
                <ParentInsightCard label="Dashboard" value={String(notificationHistory.filter((log) => log.channel === "DASHBOARD").length)} detail="Messages visibles dans le systeme." tone="text-brand-100" />
              </div>
              {notificationHistory.length === 0 && <p className="text-sm text-ink-dim">Aucun message n'a encore ete trace pour ce compte.</p>}
              <div className="space-y-3">
                {notificationHistory.map((log) => (
                  <article key={log.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{log.type}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">{log.content}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${channelTone(log.channel)}`}>{log.channel}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-ink-dim">{log.status}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-ink-dim">{new Date(log.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </ParentFinanceDialog>
      )}

      <section className="hidden grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          {snapshot.students.map((student) => {
            const nextDue = student.installments.find((installment) => installment.balance > 0) ?? null;
            return (
              <article key={student.id} className="card glass border border-brand-500/10 shadow-lg">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-300">{student.className ?? "Classe non renseignee"}</p>
                    <h2 className="mt-1 font-display text-2xl font-bold text-white">{student.fullName}</h2>
                    <p className="mt-2 text-sm text-ink-dim">{student.planName}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">{student.paymentOptionLabel}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{student.gradeGroup}</span>
                      {student.agreementId && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-200">Owner agreement</span>}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-xs text-ink-dim">Expected</p>
                      <p className="mt-2 font-mono text-lg font-bold text-white">{money.format(student.expectedTotal)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-xs text-ink-dim">Balance</p>
                      <p className="mt-2 font-mono text-lg font-bold text-red-300">{money.format(student.balance)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-xs text-ink-dim">Reduction</p>
                      <p className="mt-2 font-mono text-lg font-bold text-cyan-300">{money.format(student.reductionTotal)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <p className="text-xs text-ink-dim">Next due</p>
                      <p className="mt-2 text-sm font-semibold text-white">{nextDue ? new Date(nextDue.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : "Fully covered"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-dim">Progression financiere</span>
                    <span className="font-semibold text-brand-300">{student.completionRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, student.completionRate))}%` }} />
                  </div>
                </div>

                <div className="edupay-scrollbar mt-6 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-left text-ink-dim">
                        <th className="px-3 py-3 font-semibold">Installment</th>
                        <th className="px-3 py-3 font-semibold">Due date</th>
                        <th className="px-3 py-3 font-semibold">Amount due</th>
                        <th className="px-3 py-3 font-semibold">Paid</th>
                        <th className="px-3 py-3 font-semibold">Balance</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.installments.map((installment) => (
                        <tr key={installment.id} className="border-b border-slate-700/25">
                          <td className="px-3 py-3 font-medium text-white">{installment.label}</td>
                          <td className="px-3 py-3 text-ink-dim">{new Date(installment.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</td>
                          <td className="px-3 py-3 font-mono text-white">{moneyInstallment.format(installment.amountDue)}</td>
                          <td className="px-3 py-3 font-mono text-emerald-300">{moneyInstallment.format(installment.amountPaid)}</td>
                          <td className="px-3 py-3 font-mono text-red-300">{moneyInstallment.format(installment.balance)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(installment.status)}`}>
                              {installment.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>

        <div className="space-y-6">
          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Financial alerts</h2>
                <p className="mt-1 text-sm text-ink-dim">Retards, accumulations de dette et anomalies detectees automatiquement.</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.alerts.length === 0 && <p className="text-sm text-ink-dim">Aucune alerte active.</p>}
              {snapshot.alerts.map((alert) => (
                <div key={alert.id} className={`rounded-2xl border p-4 ${severityTone(alert.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{alert.title}</p>
                      <p className="mt-1 text-sm opacity-90">{alert.message}</p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">{alert.severity}</span>
                  </div>
                  <p className="mt-3 text-xs opacity-80">{new Date(alert.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Debt history</h2>
                <p className="mt-1 text-sm text-ink-dim">Dette active, reports d'annees precedentes et soldes restants.</p>
              </div>
              <FileText className="h-6 w-6 text-red-300" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.debts.length === 0 && <p className="text-sm text-ink-dim">Aucune dette enregistree.</p>}
              {snapshot.debts.map((debt) => (
                <div key={debt.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{debt.title}</p>
                      <p className="mt-1 text-sm text-ink-dim">{debt.reason || "Dette suivie par le moteur financier."}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(debt.status)}`}>{debt.status}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="text-ink-dim">Remaining</p>
                      <p className="font-mono font-bold text-red-300">{money.format(debt.amountRemaining)}</p>
                    </div>
                    <div>
                      <p className="text-ink-dim">Origin</p>
                      <p className="font-semibold text-white">{debt.carriedOverFromYearId ? `Carry-over ${debt.carriedOverFromYearId}` : snapshot.academicYear.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="hidden grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Reductions received</h2>
                <p className="mt-1 text-sm text-ink-dim">Toutes les reductions sont tracees separement du plan de base.</p>
              </div>
              <HandCoins className="h-6 w-6 text-cyan-300" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.reductions.length === 0 && <p className="text-sm text-ink-dim">Aucune reduction appliquee.</p>}
              {snapshot.reductions.map((reduction) => (
                <div key={reduction.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{reduction.title}</p>
                      <p className="mt-1 text-xs text-ink-dim">{reduction.studentName || "Compte parent"} · {reduction.scope}</p>
                    </div>
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                      {money.format(reduction.amount)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink-dim">{new Date(reduction.effectiveDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Agreements</h2>
                <p className="mt-1 text-sm text-ink-dim">Accords speciaux du proprietaire, notes et statut d'approbation.</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-amber-300" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.agreements.length === 0 && <p className="text-sm text-ink-dim">Aucun accord special actif.</p>}
              {snapshot.agreements.map((agreement) => (
                <div key={agreement.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{agreement.title}</p>
                      <p className="mt-1 text-sm text-ink-dim">{agreement.notes || "Accord personnalise valide par l'administration."}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(agreement.status)}`}>{agreement.status}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="text-ink-dim">Custom total</p>
                      <p className="font-mono font-semibold text-white">{money.format(agreement.customTotal)}</p>
                    </div>
                    <div>
                      <p className="text-ink-dim">Reduction</p>
                      <p className="font-mono font-semibold text-cyan-300">{money.format(agreement.reductionAmount)}</p>
                    </div>
                    <div>
                      <p className="text-ink-dim">Balance due</p>
                      <p className="font-mono font-semibold text-red-300">{money.format(agreement.balanceDue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Payment history</h2>
                <p className="mt-1 text-sm text-ink-dim">Historique des paiements, recus et enfants associes.</p>
              </div>
              <ReceiptText className="h-6 w-6 text-emerald-300" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.paymentHistory.length === 0 && <p className="text-sm text-ink-dim">Aucun paiement historique disponible.</p>}
              {snapshot.paymentHistory.map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{payment.reason}</p>
                      <p className="mt-1 text-xs text-ink-dim">{payment.transactionNumber} · {new Date(payment.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-bold text-emerald-300">{money.format(payment.amount)}</p>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(payment.status)}`}>{payment.status}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{payment.method}</span>
                    {payment.receiptNumber && <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">{payment.receiptNumber}</span>}
                    {payment.students.map((student) => (
                      <span key={student.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ink-dim">{student.fullName}</span>
                    ))}
                  </div>
                  <AllocationTraceBlock trace={payment.allocationTrace} money={moneyInstallment} lang={lang} />
                </div>
              ))}
            </div>
          </div>

          <div className="card glass border border-white/10 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Historical receipts</h2>
                <p className="mt-1 text-sm text-ink-dim">Archive des recus financiers sur le long terme.</p>
              </div>
              <CalendarClock className="h-6 w-6 text-brand-200" />
            </div>
            <div className="mt-5 space-y-3">
              {snapshot.historicalReceipts.length === 0 && <p className="text-sm text-ink-dim">Aucun recu archive.</p>}
              {snapshot.historicalReceipts.map((receipt) => (
                <div key={receipt.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{receipt.receiptNumber}</p>
                      <p className="text-xs text-ink-dim">{receipt.transactionNumber}</p>
                    </div>
                    <p className="text-xs text-ink-dim">{new Date(receipt.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                  </div>
                  <AllocationTraceBlock trace={receipt.allocationTrace} money={moneyInstallment} lang={lang} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
