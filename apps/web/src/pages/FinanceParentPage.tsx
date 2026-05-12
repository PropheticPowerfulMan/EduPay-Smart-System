import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  CheckCircle2,
  FileClock,
  FileText,
  HandCoins,
  ReceiptText,
  ShieldCheck,
  WalletCards
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
    carriedOverFromYearId?: string | null;
    dueDate?: string | null;
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
    students: Array<{ id: string; fullName: string }>;
  }>;
  historicalReceipts: Array<{
    id: string;
    receiptNumber: string;
    transactionNumber: string;
    createdAt: string;
  }>;
};

type ParentLight = {
  photoUrl?: string;
};

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
  if (severity === "HIGH") return "border-red-500/25 bg-red-500/10 text-red-100";
  if (severity === "MEDIUM") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
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

export function FinanceParentPage() {
  const { lang } = useI18n();
  const setPhotoUrl = useAuthStore((state) => state.setPhotoUrl);
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [photoUrl, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    let active = true;
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
        if (active) setLoading(false);
      });

    return () => {
      active = false;
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
          <p className="text-sm font-semibold text-ink-dim">Chargement de votre profil financier KCS...</p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-amber-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Espace parent financier</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Profil financier indisponible</h1>
          <p className="mt-3 text-sm text-ink-dim">{loadError ?? "Le moteur financier ne repond pas pour le moment."}</p>
        </div>
      </div>
    );
  }

  const activeAgreement = snapshot.agreements[0] ?? null;

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
              <p className="mt-3 text-sm text-cyan-100">Plan actif: {snapshot.profile.activeTuitionPlan}</p>
              {activeAgreement && (
                <p className="mt-1 text-sm text-amber-200">Accord special actif: {activeAgreement.title}</p>
              )}
              {photoError && <p className="mt-2 text-xs text-red-300">{photoError}</p>}
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-200 hover:bg-brand-500/20">
                <Camera className="h-4 w-4" />
                {photoSaving ? "Mise a jour photo..." : "Mettre a jour la photo"}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void updatePhoto(event.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Behavior score</p>
              <p className="mt-2 font-display text-3xl font-bold text-white">{snapshot.profile.paymentBehaviorScore.toFixed(0)}%</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Academic year</p>
              <p className="mt-2 font-display text-3xl font-bold text-white">{snapshot.academicYear.name}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Total paid" value={money.format(snapshot.profile.totalPaid)} detail="Encaissements valides" icon={CheckCircle2} tone="text-emerald-300" />
        <MetricCard label="Total debt" value={money.format(snapshot.profile.totalDebt)} detail="Dette active + reports" icon={WalletCards} tone="text-red-300" />
        <MetricCard label="Reductions" value={money.format(snapshot.profile.totalReduction)} detail={`${snapshot.reductions.length} avantage(s) tracke(s)`} icon={HandCoins} tone="text-cyan-300" />
        <MetricCard label="Carry-over" value={money.format(snapshot.profile.carriedOverDebt)} detail="Dettes des annees precedentes" icon={FileClock} tone="text-amber-300" />
        <MetricCard label="Completion" value={`${snapshot.profile.completionRate.toFixed(1)}%`} detail={`${snapshot.profile.childrenLinkedToAccount} enfant(s) lies`} icon={ShieldCheck} tone="text-brand-200" />
        <MetricCard label="Overdue" value={String(snapshot.profile.overdueInstallments)} detail={`Pending ${money.format(snapshot.profile.pendingPaymentsTotal)}`} icon={AlertTriangle} tone="text-orange-300" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}