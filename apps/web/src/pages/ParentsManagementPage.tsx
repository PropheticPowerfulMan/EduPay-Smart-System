import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { SearchField } from "../components/SearchField";
import { api } from "../services/api";

/* ─── Types ─────────────────────────────────────────────────────── */
type Student = {
  id: string;
  displayId?: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
  paymentOptionType?: string;
  paymentOptionLabel?: string;
  tuitionPlanName?: string;
};

type Parent = {
  id: string;
  displayId?: string;
  nom: string;
  postnom: string;
  prenom: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  students: Student[];
  createdAt: string;
};

type ParentCredentials = {
  parentId: string;
  parentName: string;
  email: string;
  accessCode?: string;
  temporaryPassword: string;
  notificationStatus?: {
    email?: string;
    sms?: string;
  };
};

type ParentFinanceDebt = {
  id: string;
  title: string;
  reason?: string | null;
  originalAmount: number;
  amountRemaining: number;
  status: string;
  academicYearId: string;
  academicYearName?: string | null;
  carriedOverFromYearId?: string | null;
  carriedOverFromYearName?: string | null;
  dueDate?: string | null;
  settledAt?: string | null;
  createdAt: string;
};

type ParentFinanceStudent = {
  id: string;
  fullName: string;
  className?: string | null;
  paid: number;
  balance: number;
  expectedTotal: number;
  overdueInstallments: number;
  completionRate: number;
};

type ParentFinanceSnapshot = {
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  profile: {
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
  students: ParentFinanceStudent[];
  debts: ParentFinanceDebt[];
};

type SchoolClass = { id: string; name: string };

type TuitionPlan = {
  id: string;
  name: string;
  paymentOptionType: string;
  gradeGroup: string;
  discountRate?: number;
  originalAmount?: number;
  finalAmount: number;
  reductionAmount?: number;
  scheduleJson?: string | PlanScheduleItem[];
};

type PlanScheduleItem = {
  label: string;
  amount: number;
  dueDate?: string;
  windowLabel?: string;
};

type FinanceCatalog = {
  academicYear?: { name?: string };
  plans: TuitionPlan[];
};

type StudentFormState = {
  fullName: string;
  classId: string;
  annualFee: string;
  paymentOptionType: string;
};

type FormState = {
  nom: string;
  postnom: string;
  prenom: string;
  phone: string;
  email: string;
  photoUrl: string;
  defaultPaymentOptionType: string;
  notifyEmail: boolean;
  notifySms: boolean;
  students: StudentFormState[];
};

const TUITION_OPTION_ORDER = [
  "FULL_PRESEPTEMBER",
  "TWO_INSTALLMENTS",
  "THREE_INSTALLMENTS",
  "STANDARD_MONTHLY",
  "SPECIAL_OWNER_AGREEMENT"
];

const PAYMENT_OPTION_LABELS: Record<string, string> = {
  FULL_PRESEPTEMBER: "Paiement complet avant septembre",
  TWO_INSTALLMENTS: "Paiement en 2 tranches",
  THREE_INSTALLMENTS: "Paiement en 3 tranches",
  STANDARD_MONTHLY: "Paiement mensuel standard",
  SPECIAL_OWNER_AGREEMENT: "Accord spécial propriétaire"
};

const GRADE_GROUP_LABELS: Record<string, string> = {
  K: "Maternelle K3 à K5",
  GRADE_1_5: "Grades 1 à 5",
  GRADE_6_8: "Grades 6 à 8",
  GRADE_9_12: "Grades 9 à 12",
  CUSTOM: "Plan personnalisé"
};

const EMPTY_FORM: FormState = {
  nom: "",
  postnom: "",
  prenom: "",
  phone: "",
  email: "",
  photoUrl: "",
  defaultPaymentOptionType: "STANDARD_MONTHLY",
  notifyEmail: true,
  notifySms: true,
  students: []
};

const EMPTY_STUDENT: StudentFormState = { fullName: "", classId: "", annualFee: "", paymentOptionType: "STANDARD_MONTHLY" };

const SCHOOL_SECTIONS: SchoolClass[] = [
  ...Array.from({ length: 3 }, (_v, index) => {
    const name = `K${index + 3}`;
    return { id: `section-${name.toLowerCase()}`, name };
  }),
  ...Array.from({ length: 12 }, (_v, index) => {
    const grade = index + 1;
    return { id: `section-grade-${grade}`, name: `Grade ${grade}` };
  })
];

/* ─── Icons ──────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l8-8 3 3-2 2-2-2-2 2 2 2-2 2" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" /><path d="m22 6-10 7L2 6" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.6a2 2 0 0 1-.45 2.11L8 9.72a16 16 0 0 0 6.29 6.29l1.29-1.29a2 2 0 0 1 2.11-.45c.83.3 1.7.51 2.6.63A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {text}
    </span>
  );
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function getDebtStatusLabel(status: string) {
  switch (status) {
    case "OPEN":
      return "Ouverte";
    case "PARTIALLY_PAID":
      return "Partiellement payée";
    case "OVERDUE":
      return "En retard";
    case "CLEARED":
      return "Réglée";
    case "WRITTEN_OFF":
      return "Radiée";
    default:
      return status;
  }
}

function getDebtStatusTone(status: string) {
  switch (status) {
    case "CLEARED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "PARTIALLY_PAID":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "OVERDUE":
    case "OPEN":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    default:
      return "border-slate-600/60 bg-slate-900/40 text-ink-dim";
  }
}

function getDebtReferenceYear(debt: ParentFinanceDebt) {
  return debt.carriedOverFromYearName
    || debt.carriedOverFromYearId
    || debt.academicYearName
    || debt.academicYearId
    || "Année non renseignée";
}

function resolveGradeGroup(className?: string) {
  const normalized = (className || "").trim().toLowerCase();
  if (!normalized) return "CUSTOM";
  if (/^k\d?/.test(normalized) || normalized.includes("kindergarten")) return "K";
  const gradeMatch = normalized.match(/grade\s*(\d{1,2})/i);
  const grade = gradeMatch ? Number(gradeMatch[1]) : Number.NaN;
  if (!Number.isNaN(grade)) {
    if (grade <= 5) return "GRADE_1_5";
    if (grade <= 8) return "GRADE_6_8";
    return "GRADE_9_12";
  }
  return "CUSTOM";
}

function getPaymentOptionLabel(option: string) {
  return PAYMENT_OPTION_LABELS[option] || option;
}

function formatAmountInput(amount?: number) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function buildAcademicDueDate(month: number, day: number) {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year = month >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString();
}

function splitOwnerAgreementTotal(total: number) {
  const safeTotal = Number.isFinite(total) ? Math.max(total, 0) : 0;
  const first = Math.round((safeTotal * 0.4) * 100) / 100;
  const second = Math.round((safeTotal * 0.3) * 100) / 100;
  const third = Math.round((safeTotal - first - second) * 100) / 100;
  return [first, second, third];
}

function buildSpecialOwnerAgreementPlan(student: StudentFormState, className: string, officialPlans: TuitionPlan[]): TuitionPlan | null {
  const gradeGroup = resolveGradeGroup(className);
  const parsedAmount = Number.parseFloat(student.annualFee);
  const fallbackAmount = officialPlans.find((plan) => plan.paymentOptionType === "STANDARD_MONTHLY")?.finalAmount
    ?? officialPlans[0]?.finalAmount
    ?? 0;
  const customTotal = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : fallbackAmount;
  if (customTotal <= 0) return null;

  const [initialAmount, midYearAmount, finalAmount] = splitOwnerAgreementTotal(customTotal);

  return {
    id: `special-owner-${gradeGroup}`,
    name: "Accord spécial propriétaire",
    paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
    gradeGroup,
    discountRate: 0,
    originalAmount: customTotal,
    finalAmount: customTotal,
    reductionAmount: 0,
    scheduleJson: [
      { label: "Engagement initial", amount: initialAmount, dueDate: buildAcademicDueDate(8, 31), windowLabel: "Avant septembre" },
      { label: "Régularisation mi-année", amount: midYearAmount, dueDate: buildAcademicDueDate(1, 31), windowLabel: "Avant fin janvier" },
      { label: "Solde final", amount: finalAmount, dueDate: buildAcademicDueDate(5, 31), windowLabel: "Avant fin mai" }
    ]
  };
}

function parsePlanSchedule(plan: TuitionPlan): PlanScheduleItem[] {
  if (!plan.scheduleJson) return [];
  if (Array.isArray(plan.scheduleJson)) return plan.scheduleJson;

  try {
    const parsed = JSON.parse(plan.scheduleJson) as PlanScheduleItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getScheduleCaption(row: PlanScheduleItem) {
  if (row.windowLabel?.trim()) return row.windowLabel;
  if (row.dueDate?.trim()) return row.dueDate;
  return row.label;
}

function CredentialsModal({ credentials, onClose }: { credentials: ParentCredentials; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyText = `Identifiant: ${credentials.email}\nCode d'accès: ${credentials.accessCode || "Non renseigné"}\nMot de passe temporaire: ${credentials.temporaryPassword}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(copyText).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md glass rounded-2xl p-8 space-y-5 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/20 text-brand-200">
            <KeyIcon />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">{t("parentAccessGenerated")}</p>
            <h3 className="font-display text-xl font-bold text-white">{credentials.parentName}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {t("parentAccessHelp")}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">{t("loginEmail")}</p>
            <p className="mt-1 font-mono text-sm font-bold text-white">{credentials.email}</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">Code d'accès</p>
            <p className="mt-1 font-mono text-sm font-bold text-cyan-300">{credentials.accessCode || "Non renseigné"}</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-dim">Mot de passe temporaire</p>
            <p className="mt-1 font-mono text-lg font-black text-emerald-300">{credentials.temporaryPassword}</p>
          </div>
          {credentials.notificationStatus && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-ink-dim">Email</p>
                <p className="mt-1 text-sm font-bold text-cyan-300">{credentials.notificationStatus.email || "SKIPPED"}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-ink-dim">SMS</p>
                <p className="mt-1 text-sm font-bold text-cyan-300">{credentials.notificationStatus.sms || "SKIPPED"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={copy} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 transition-all">
            {copied ? "Copié" : "Copier les accès"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Modal ───────────────────────────────────────────────── */
function AccessNotificationModal({
  parent,
  onClose,
  onConfirm,
  loading
}: {
  parent: Parent;
  onClose: () => void;
  onConfirm: (channels: { notifyEmail: boolean; notifySms: boolean }) => void;
  loading: boolean;
}) {
  const [notifyEmail, setNotifyEmail] = useState(Boolean(parent.email));
  const [notifySms, setNotifySms] = useState(Boolean(parent.phone));
  const disabled = loading || (!notifyEmail && !notifySms);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md glass rounded-2xl p-6 space-y-5 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim hover:text-white">
          <XIcon />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Notifications d'accès</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">{parent.fullName}</h2>
          <p className="mt-2 text-sm text-ink-dim">
            Regénérer un mot de passe temporaire et envoyer les accès au parent par les canaux activés.
          </p>
        </div>

        <div className="grid gap-3">
          <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-all ${notifyEmail ? "border-cyan-500/40 bg-cyan-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-cyan-300"><MailIcon /></span>
              <span>
                <span className="block text-sm font-bold text-white">Email</span>
                <span className="block truncate text-xs text-ink-dim">{parent.email || "Aucun email renseigné"}</span>
              </span>
            </span>
            <input type="checkbox" checked={notifyEmail} disabled={!parent.email} onChange={(e) => setNotifyEmail(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
          </label>

          <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-all ${notifySms ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-emerald-300"><PhoneIcon /></span>
              <span>
                <span className="block text-sm font-bold text-white">SMS</span>
                <span className="block truncate text-xs text-ink-dim">{parent.phone || "Aucun téléphone renseigné"}</span>
              </span>
            </span>
            <input type="checkbox" checked={notifySms} disabled={!parent.phone} onChange={(e) => setNotifySms(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-600 py-3 text-sm font-semibold text-ink-dim hover:text-white">
            Annuler
          </button>
          <button
            onClick={() => onConfirm({ notifyEmail, notifySms })}
            disabled={disabled}
            className="flex-1 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Envoi..." : "Envoyer les accès"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  parent,
  financeSnapshot,
  financeLoading,
  financeError,
  onClose,
  t
}: {
  parent: Parent;
  financeSnapshot: ParentFinanceSnapshot | null;
  financeLoading: boolean;
  financeError: string | null;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const debtHistory = useMemo(() => {
    if (!financeSnapshot) return [] as Array<{ year: string; amountRemaining: number; originalAmount: number; count: number }>;

    const grouped = new Map<string, { year: string; amountRemaining: number; originalAmount: number; count: number }>();
    for (const debt of financeSnapshot.debts) {
      const year = getDebtReferenceYear(debt);
      const current = grouped.get(year) || { year, amountRemaining: 0, originalAmount: 0, count: 0 };
      current.amountRemaining += debt.amountRemaining;
      current.originalAmount += debt.originalAmount;
      current.count += 1;
      grouped.set(year, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.year.localeCompare(left.year));
  }, [financeSnapshot]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-5xl glass rounded-2xl p-8 space-y-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300 mb-1">{t("pmParentId")}: {parent.displayId || parent.id}</p>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-brand-500 to-accent shrink-0">
                  {parent.photoUrl ? (
                    <img src={parent.photoUrl} alt={parent.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl font-black text-white">
                      {parent.fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">{parent.fullName}</h2>
                  <p className="text-xs text-ink-dim mt-1">{t("pmRegisteredOn")} {new Date(parent.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("pmPhone")}</p>
                <p className="text-sm font-semibold text-white mt-1">{parent.phone || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("email")}</p>
                <p className="text-sm font-semibold text-white mt-1 truncate">{parent.email || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("pmNom")}</p>
                <p className="text-sm font-semibold text-white mt-1">{parent.nom}</p>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("pmPostnom")}</p>
                <p className="text-sm font-semibold text-white mt-1">{parent.postnom}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-ink-dim uppercase tracking-[0.1em] mb-3">
                {t("pmChildren")} ({parent.students.length})
              </p>
              {parent.students.length === 0 ? (
                <p className="text-sm text-ink-dim italic">{t("pmNoChildren")}</p>
              ) : (
                <div className="space-y-2">
                  {parent.students.map((st) => (
                    <div key={st.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-700/50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{st.fullName}</p>
                        <p className="text-xs text-ink-dim">{st.className || st.classId}</p>
                        {(st.tuitionPlanName || st.paymentOptionLabel) && (
                          <p className="mt-1 text-xs text-cyan-300">{st.tuitionPlanName || st.paymentOptionLabel}</p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-emerald-300">
                        {formatMoney(st.annualFee)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-200">Historique précis des dettes</p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-white">Vision parent pluriannuelle</h3>
                  <p className="mt-2 text-sm text-red-100/80">
                    Cette rubrique retrace les soldes ouverts, partiellement payés ou reportés, y compris les années antérieures.
                  </p>
                </div>
                <span className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-red-200">
                  {financeSnapshot?.debts.length ?? 0} ligne(s)
                </span>
              </div>

              {financeLoading ? (
                <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-950/45 px-4 py-5 text-sm text-ink-dim">
                  Chargement du dossier financier parent...
                </div>
              ) : financeError ? (
                <div className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-5 text-sm text-danger">
                  {financeError}
                </div>
              ) : financeSnapshot ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Dette totale</p>
                      <p className="mt-2 text-xl font-black text-red-200">{formatMoney(financeSnapshot.profile.totalDebt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Dette reportée</p>
                      <p className="mt-2 text-xl font-black text-amber-200">{formatMoney(financeSnapshot.profile.carriedOverDebt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Paiements cumulés</p>
                      <p className="mt-2 text-xl font-black text-emerald-200">{formatMoney(financeSnapshot.profile.totalPaid)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Échéances en retard</p>
                      <p className="mt-2 text-xl font-black text-white">{financeSnapshot.profile.overdueInstallments}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">Synthèse par année concernée</p>
                        <p className="mt-1 text-xs text-ink-dim">Les dettes reportées sont rattachées à leur année d'origine pour éviter toute confusion.</p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">{financeSnapshot.academicYear.name}</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {debtHistory.length === 0 ? (
                        <p className="text-sm text-ink-dim">Aucune dette retracée pour ce parent, y compris sur les années précédentes.</p>
                      ) : debtHistory.map((row) => (
                        <div key={row.year} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">{row.year}</p>
                              <p className="mt-1 text-[11px] text-ink-dim">{row.count} dette(s) référencée(s)</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-red-200">{formatMoney(row.amountRemaining)}</p>
                              <p className="mt-1 text-[11px] text-ink-dim">Origine {formatMoney(row.originalAmount)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <p className="text-sm font-bold text-white">Détail ligne par ligne</p>
                    <div className="mt-4 space-y-3">
                      {financeSnapshot.debts.length === 0 ? (
                        <p className="text-sm text-ink-dim">Aucune ligne de dette enregistrée.</p>
                      ) : financeSnapshot.debts.map((debt) => (
                        <div key={debt.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-white">{debt.title}</p>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getDebtStatusTone(debt.status)}`}>
                                  {getDebtStatusLabel(debt.status)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-ink-dim">Année concernée : {getDebtReferenceYear(debt)}</p>
                              <p className="mt-1 text-xs text-ink-dim">Imputée sur : {debt.academicYearName || debt.academicYearId}</p>
                              {debt.carriedOverFromYearName || debt.carriedOverFromYearId ? (
                                <p className="mt-1 text-xs text-amber-200">Reportée depuis : {debt.carriedOverFromYearName || debt.carriedOverFromYearId}</p>
                              ) : null}
                              {debt.reason ? <p className="mt-2 text-sm text-ink-dim">{debt.reason}</p> : null}
                            </div>
                            <div className="grid min-w-[220px] grid-cols-2 gap-3 text-sm">
                              <div className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Montant initial</p>
                                <p className="mt-1 font-bold text-white">{formatMoney(debt.originalAmount)}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Reste à payer</p>
                                <p className="mt-1 font-bold text-red-200">{formatMoney(debt.amountRemaining)}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Échéance</p>
                                <p className="mt-1 font-bold text-white">{formatDateLabel(debt.dueDate)}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Créée le</p>
                                <p className="mt-1 font-bold text-white">{formatDateLabel(debt.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
                    <p className="text-sm font-bold text-white">État financier par enfant</p>
                    <div className="mt-4 space-y-3">
                      {financeSnapshot.students.length === 0 ? (
                        <p className="text-sm text-ink-dim">Aucun élève lié à ce parent.</p>
                      ) : financeSnapshot.students.map((student) => (
                        <div key={student.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-bold text-white">{student.fullName}</p>
                              <p className="mt-1 text-xs text-ink-dim">{student.className || "Classe non renseignée"}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm md:min-w-[320px]">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Payé</p>
                                <p className="mt-1 font-bold text-emerald-200">{formatMoney(student.paid)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Solde</p>
                                <p className="mt-1 font-bold text-red-200">{formatMoney(student.balance)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Attendu</p>
                                <p className="mt-1 font-bold text-white">{formatMoney(student.expectedTotal)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Complétion</p>
                                <p className="mt-1 font-bold text-white">{student.completionRate.toFixed(1)}%</p>
                              </div>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-ink-dim">{student.overdueInstallments} échéance(s) en retard pour cet élève.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-950/45 px-4 py-5 text-sm text-ink-dim">
                  Aucun dossier financier détaillé n'a pu être chargé pour ce parent.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────────────────── */
function DeleteModal({ parent, onConfirm, onClose, t }: {
  parent: Parent; onConfirm: () => void; onClose: () => void; t: (k: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm glass rounded-2xl p-8 space-y-6 animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-14 h-14 rounded-full bg-danger/20 flex items-center justify-center">
          <TrashIcon />
        </div>
        <div className="text-center">
          <h3 className="font-display text-xl font-bold text-white">{t("pmDeleteTitle")}</h3>
          <p className="text-sm text-ink-dim mt-2">{t("pmDeleteConfirm")} <span className="text-white font-semibold">{parent.fullName}</span> ?</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-slate-600 text-ink-dim hover:text-white hover:border-slate-500 transition-all font-semibold text-sm">
            {t("pmCancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-lg bg-danger/90 hover:bg-danger text-white font-semibold text-sm transition-all active:scale-95">
            {t("pmDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form Modal ─────────────────────────────────────────────────── */
function FormModal({ initial, classes, catalog, onSave, onClose, t }: {
  initial: Parent | null;
  classes: SchoolClass[];
  catalog: FinanceCatalog | null;
  onSave: (form: FormState, id?: string) => Promise<void>;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return EMPTY_FORM;
    return {
      nom: initial.nom,
      postnom: initial.postnom,
      prenom: initial.prenom,
      phone: initial.phone,
      email: initial.email,
      photoUrl: initial.photoUrl || "",
      defaultPaymentOptionType: initial.students[0]?.paymentOptionType || "STANDARD_MONTHLY",
      notifyEmail: true,
      notifySms: true,
      students: initial.students.map((s) => ({
        fullName: s.fullName,
        classId: s.classId,
        annualFee: String(s.annualFee),
        paymentOptionType: s.paymentOptionType || "STANDARD_MONTHLY"
      }))
    };
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getClassName = (classId: string) => classes.find((entry) => entry.id === classId)?.name || "";

  const getMatchingPlans = (classId: string, student?: StudentFormState) => {
    if (!catalog?.plans?.length) return [];
    const gradeGroup = resolveGradeGroup(getClassName(classId));
    const officialPlans = catalog.plans.filter((plan) => plan.gradeGroup === gradeGroup && PAYMENT_OPTION_LABELS[plan.paymentOptionType]);
    if (!student || !classId) return officialPlans;
    const specialPlan = buildSpecialOwnerAgreementPlan(student, getClassName(classId), officialPlans);
    return specialPlan ? [...officialPlans, specialPlan] : officialPlans;
  };

  const getPreferredOption = (classId: string, currentOptionType?: string, student?: StudentFormState) => {
    const matchingPlans = getMatchingPlans(classId, student);
    if (currentOptionType && matchingPlans.some((plan) => plan.paymentOptionType === currentOptionType)) {
      return currentOptionType;
    }
    return matchingPlans.find((plan) => plan.paymentOptionType === "STANDARD_MONTHLY")?.paymentOptionType
      || matchingPlans[0]?.paymentOptionType
      || currentOptionType
      || "STANDARD_MONTHLY";
  };

  const getSelectedPlan = (student: StudentFormState) => {
    const matchingPlans = getMatchingPlans(student.classId, student);
    return matchingPlans.find((plan) => plan.paymentOptionType === student.paymentOptionType) || null;
  };

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const setBool = (key: "notifyEmail" | "notifySms", value: boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const setStudent = (idx: number, key: string, value: string) => {
    setForm((f) => {
      const students = [...f.students];
      students[idx] = { ...students[idx], [key]: value };
      return { ...f, students };
    });
  };

  const updateStudentClass = (idx: number, classId: string) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      const nextStudent = { ...student, classId };
      const paymentOptionType = getPreferredOption(classId, student.paymentOptionType, nextStudent);
      const matchingPlan = getMatchingPlans(classId, nextStudent).find((plan) => plan.paymentOptionType === paymentOptionType);
      students[idx] = {
        ...student,
        classId,
        paymentOptionType,
        annualFee: matchingPlan ? formatAmountInput(matchingPlan.finalAmount) : student.annualFee
      };
      return { ...current, students };
    });
  };

  const updateStudentPlan = (idx: number, paymentOptionType: string) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      const matchingPlan = getMatchingPlans(student.classId, student).find((plan) => plan.paymentOptionType === paymentOptionType);
      students[idx] = {
        ...student,
        paymentOptionType,
        annualFee: matchingPlan ? formatAmountInput(matchingPlan.finalAmount) : student.annualFee
      };
      return { ...current, students };
    });
  };

  const updateFamilyTuitionPlan = (paymentOptionType: string) => {
    setForm((current) => {
      const students = current.students.map((student) => {
        if (!student.classId) {
          return { ...student, paymentOptionType };
        }

        const matchingPlan = getMatchingPlans(student.classId, { ...student, paymentOptionType }).find((plan) => plan.paymentOptionType === paymentOptionType);
        return {
          ...student,
          paymentOptionType,
          annualFee: matchingPlan ? formatAmountInput(matchingPlan.finalAmount) : student.annualFee
        };
      });

      return { ...current, defaultPaymentOptionType: paymentOptionType, students };
    });
  };

  const addStudent = () => setForm((f) => ({
    ...f,
    students: [...f.students, { ...EMPTY_STUDENT, paymentOptionType: f.defaultPaymentOptionType }]
  }));
  const removeStudent = (idx: number) => setForm((f) => ({ ...f, students: f.students.filter((_, i) => i !== idx) }));

  const handlePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((e) => ({ ...e, photoUrl: "Veuillez choisir une image valide." }));
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
        if (!ctx) return;
        const minSide = Math.min(image.width, image.height);
        const sx = (image.width - minSide) / 2;
        const sy = (image.height - minSide) / 2;
        ctx.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size);
        set("photoUrl", canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nom.trim()) e.nom = t("pmRequired");
    if (!form.prenom.trim()) e.prenom = t("pmRequired");
    if (!form.phone.trim()) e.phone = t("pmRequired");
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    await onSave(form, initial?.id);
    setSaving(false);
  };

  return (
    <div className="edupay-scrollbar fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="edupay-scrollbar relative my-4 max-h-[92vh] w-full max-w-2xl overflow-y-auto glass rounded-2xl p-4 space-y-5 animate-fadeInUp sm:p-8 sm:space-y-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-dim hover:text-white transition-colors">
          <XIcon />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold text-white">
            {initial ? t("pmEditParent") : t("pmAddParent")}
          </h2>
          {!initial && (
            <p className="text-xs text-ink-dim mt-1">{t("pmIdAutoGenerated")}</p>
          )}
        </div>

        {/* Parent fields */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
          <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-brand-500 to-accent shrink-0">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="Photo du parent" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                {(form.prenom || form.nom || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{t("parentPhoto")}</p>
            <p className="mt-1 text-xs text-ink-dim">{t("parentPhotoHelp")}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/30">
            <CameraIcon /> {t("choose")}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />
          </label>
          {form.photoUrl && (
            <button type="button" onClick={() => set("photoUrl", "")} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-ink-dim hover:text-white">
              Retirer
            </button>
          )}
          {errors.photoUrl && <p className="w-full text-xs text-danger">{errors.photoUrl}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmNom")} *</label>
            <input value={form.nom} onChange={(e) => set("nom", e.target.value)} className="w-full" placeholder={t("pmNom")} />
            {errors.nom && <p className="text-xs text-danger">{errors.nom}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPostnom")}</label>
            <input value={form.postnom} onChange={(e) => set("postnom", e.target.value)} className="w-full" placeholder={t("pmPostnom")} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPrenom")} *</label>
            <input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} className="w-full" placeholder={t("pmPrenom")} />
            {errors.prenom && <p className="text-xs text-danger">{errors.prenom}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("pmPhone")} *</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full" placeholder="+243 xxx xxx xxx" />
            {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">{t("email")}</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" className="w-full" placeholder="email@exemple.com" />
          </div>
        </div>

        {!initial && (
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-white">Notifications de création du compte</p>
              <p className="text-xs text-ink-dim">Choisissez les canaux utilisés pour envoyer les accès au parent.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${form.notifyEmail ? "border-cyan-500/40 bg-cyan-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white"><MailIcon /> Email</span>
                <input type="checkbox" checked={form.notifyEmail} onChange={(e) => setBool("notifyEmail", e.target.checked)} className="h-5 w-5 accent-cyan-400" />
              </label>
              <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${form.notifySms ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700/50 bg-slate-900/30"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white"><PhoneIcon /> SMS</span>
                <input type="checkbox" checked={form.notifySms} onChange={(e) => setBool("notifySms", e.target.checked)} className="h-5 w-5 accent-emerald-400" />
              </label>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-white">Plan de scolarité du parent</p>
            <p className="text-xs text-cyan-100/80">
              Choisissez l'un des 5 plans déjà définis. Ce choix sera appliqué automatiquement aux enfants ajoutés, avec le montant officiel ajusté selon leur classe.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TUITION_OPTION_ORDER.map((optionType) => {
              const selected = form.defaultPaymentOptionType === optionType;
              return (
                <button
                  key={optionType}
                  type="button"
                  onClick={() => updateFamilyTuitionPlan(optionType)}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    selected
                      ? "border-cyan-300 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(125,232,255,0.2)]"
                      : "border-white/10 bg-slate-950/40 hover:border-cyan-300/40 hover:bg-slate-900/70"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-white">{getPaymentOptionLabel(optionType)}</span>
                      <span className="mt-1 block text-[11px] text-ink-dim">
                        {optionType === "FULL_PRESEPTEMBER" && "Remise maximale pour paiement complet avant septembre."}
                        {optionType === "TWO_INSTALLMENTS" && "Deux grandes tranches avec réduction partielle."}
                        {optionType === "THREE_INSTALLMENTS" && "Trois tranches et remise légère."}
                        {optionType === "STANDARD_MONTHLY" && "Plan mensuel standard sans réduction."}
                        {optionType === "SPECIAL_OWNER_AGREEMENT" && "Accord spécial validé par la direction financière."}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${selected ? "bg-cyan-200 text-slate-950" : "bg-white/10 text-ink-dim"}`}>
                      {selected ? "Choisi" : "Choisir"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Children section */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-white uppercase tracking-[0.08em]">{t("pmChildren")}</p>
            <button type="button" onClick={addStudent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-300 hover:bg-brand-500/30 text-xs font-semibold transition-all active:scale-95">
              <PlusIcon /> {t("pmAddChild")}
            </button>
          </div>
          {form.students.length === 0 && (
            <p className="text-sm text-ink-dim italic">{t("pmNoChildrenForm")}</p>
          )}
          {form.students.map((st, idx) => (
            <div key={idx} className="space-y-4 rounded-2xl border border-slate-700/50 bg-slate-900/30 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">Élève {idx + 1}</p>
                  <p className="text-xs text-ink-dim">Choisissez une classe puis un plan officiel adapté. Le montant annuel est proposé automatiquement.</p>
                </div>
                <button type="button" onClick={() => removeStudent(idx)}
                  className="p-2 rounded-lg bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30 transition-all active:scale-95">
                  <TrashIcon />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">{t("pmChildName")}</label>
                  <input value={st.fullName} onChange={(e) => setStudent(idx, "fullName", e.target.value)} className="w-full" placeholder={t("pmChildNamePlaceholder")} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">{t("pmChildClass")}</label>
                  <select value={st.classId} onChange={(e) => updateStudentClass(idx, e.target.value)} className="w-full">
                    <option value="">{t("pmSelectClass")}</option>
                    <optgroup label="Maternelle">
                      {classes.filter((c) => c.name.toLowerCase().startsWith("k")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    <optgroup label="Grade 1 - Grade 12">
                      {classes.filter((c) => c.name.toLowerCase().startsWith("grade")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    {classes.some((c) => !c.name.toLowerCase().startsWith("k") && !c.name.toLowerCase().startsWith("grade")) && (
                      <optgroup label="Autres">
                        {classes
                          .filter((c) => !c.name.toLowerCase().startsWith("k") && !c.name.toLowerCase().startsWith("grade"))
                          .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">Plan de scolarité officiel</label>
                  <select value={st.paymentOptionType} onChange={(e) => updateStudentPlan(idx, e.target.value)} className="w-full">
                    {getMatchingPlans(st.classId, st).length > 0 ? getMatchingPlans(st.classId, st).map((plan) => (
                      <option key={`${plan.gradeGroup}-${plan.paymentOptionType}`} value={plan.paymentOptionType}>
                        {getPaymentOptionLabel(plan.paymentOptionType)} - {formatMoney(plan.finalAmount)}
                      </option>
                    )) : Object.entries(PAYMENT_OPTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-ink-dim">
                    {st.classId
                      ? `Segment : ${GRADE_GROUP_LABELS[resolveGradeGroup(getClassName(st.classId))] || "À définir"}`
                      : "Sélectionnez d'abord la classe de l'enfant pour filtrer les plans compatibles."}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">{t("pmAnnualFee")} (USD)</label>
                  <input type="number" value={st.annualFee} onChange={(e) => setStudent(idx, "annualFee", e.target.value)} className="w-full" placeholder="500" />
                  <p className="text-[11px] text-ink-dim">Montant pre-rempli depuis le plan choisi, modifiable si necessaire.</p>
                </div>
              </div>

              {(() => {
                const matchingPlans = getMatchingPlans(st.classId, st);
                if (!st.classId || matchingPlans.length === 0) return null;

                return (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">Choix détaillé du mode de paiement</p>
                        <p className="text-xs text-ink-dim">
                          {catalog?.academicYear?.name ? `Barème officiel ${catalog.academicYear.name}` : "Barème officiel EduPay"} pour {GRADE_GROUP_LABELS[resolveGradeGroup(getClassName(st.classId))] || "ce segment"}.
                        </p>
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">
                        {matchingPlans.length} plan(s) disponible(s)
                      </p>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {matchingPlans.map((plan) => {
                        const isActive = plan.paymentOptionType === st.paymentOptionType;
                        const schedule = parsePlanSchedule(plan);
                        return (
                          <button
                            key={`${idx}-${plan.paymentOptionType}`}
                            type="button"
                            onClick={() => updateStudentPlan(idx, plan.paymentOptionType)}
                            className={`rounded-2xl border p-4 text-left transition-all ${isActive ? "border-brand-300 bg-brand-500/12 shadow-[0_0_0_1px_rgba(125,232,255,0.2)]" : "border-slate-700/60 bg-slate-900/50 hover:border-brand-400/50 hover:bg-slate-900/70"}`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-black text-white">{getPaymentOptionLabel(plan.paymentOptionType)}</p>
                                <p className="mt-1 text-[11px] text-ink-dim">{plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? "Plan personnalisé validé par la direction financière, basé sur le montant annuel saisi." : plan.name}</p>
                              </div>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isActive ? "bg-brand-300 text-slate-950" : "bg-white/10 text-ink-dim"}`}>
                                {isActive ? "Choisi" : "Choisir"}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Montant initial</p>
                                <p className="mt-1 font-bold text-white">{formatMoney(Number(plan.originalAmount || plan.finalAmount))}</p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Réduction</p>
                                <p className="mt-1 font-bold text-emerald-300">{formatMoney(Number(plan.reductionAmount || 0))}</p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Remise</p>
                                <p className="mt-1 font-bold text-white">{Number(plan.discountRate || 0).toFixed(0)}%</p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Net à payer</p>
                                <p className="mt-1 font-black text-brand-200">{formatMoney(plan.finalAmount)}</p>
                              </div>
                            </div>

                            {schedule.length > 0 ? (
                              <div className="mt-4 space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-dim">Échéancier exact</p>
                                <div className="space-y-2">
                                  {schedule.map((row, scheduleIdx) => (
                                    <div key={`${plan.paymentOptionType}-${scheduleIdx}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
                                      <div>
                                        <p className="text-sm font-semibold text-white">{row.label}</p>
                                        <p className="text-[11px] text-ink-dim">{getScheduleCaption(row)}</p>
                                      </div>
                                      <p className="text-sm font-black text-cyan-200">{formatMoney(row.amount)}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const selectedPlan = getSelectedPlan(st);
                if (!selectedPlan) return null;
                const schedule = parsePlanSchedule(selectedPlan);
                return (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{selectedPlan.name}</p>
                        <p className="text-xs text-cyan-100/80">{getPaymentOptionLabel(selectedPlan.paymentOptionType)} pour {GRADE_GROUP_LABELS[selectedPlan.gradeGroup] || selectedPlan.gradeGroup}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-black text-cyan-200">{formatMoney(selectedPlan.finalAmount)}</p>
                        {Number(selectedPlan.reductionAmount || 0) > 0 && (
                          <p className="text-xs text-emerald-300">Réduction incluse : {formatMoney(Number(selectedPlan.reductionAmount || 0))}</p>
                        )}
                      </div>
                    </div>
                    {schedule.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {schedule.map((row, scheduleIdx) => (
                          <div key={`${selectedPlan.paymentOptionType}-summary-${scheduleIdx}`} className="rounded-xl border border-cyan-400/20 bg-slate-950/35 px-3 py-2">
                            <p className="text-xs font-semibold text-white">{row.label}</p>
                            <p className="mt-1 text-[11px] text-cyan-100/80">{getScheduleCaption(row)}</p>
                            <p className="mt-1 text-sm font-black text-cyan-200">{formatMoney(row.amount)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-slate-600 text-ink-dim hover:text-white font-semibold text-sm transition-all">
            {t("pmCancel")}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-50">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("pmSaving")}
              </span>
            ) : t("pmSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export function ParentsManagementPage() {
  const { t } = useI18n();
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [catalog, setCatalog] = useState<FinanceCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // modals
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Parent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Parent | null>(null);
  const [viewTarget, setViewTarget] = useState<Parent | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<Parent | null>(null);
  const [credentials, setCredentials] = useState<ParentCredentials | null>(null);
  const [sendingAccess, setSendingAccess] = useState(false);
  const [financeSnapshot, setFinanceSnapshot] = useState<ParentFinanceSnapshot | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setApiError(null);
    let nextApiError: string | null = null;
    const [parentsResult, classesResult, catalogResult] = await Promise.allSettled([
      api<Parent[]>("/api/parents"),
      api<SchoolClass[]>("/api/classes"),
      api<FinanceCatalog>("/api/finance/catalog")
    ]);

    if (parentsResult.status === "fulfilled") {
      setParents(parentsResult.value);
    } else {
      const message = parentsResult.reason instanceof Error ? parentsResult.reason.message : "Erreur API";
      nextApiError = message;
    }

    if (classesResult.status === "fulfilled") {
      setClasses(classesResult.value.length ? classesResult.value : SCHOOL_SECTIONS);
    } else {
      setClasses(SCHOOL_SECTIONS);
      if (!nextApiError) {
        nextApiError = classesResult.reason instanceof Error ? classesResult.reason.message : "Erreur API";
      }
    }

    if (catalogResult.status === "fulfilled") {
      setCatalog(catalogResult.value);
    } else {
      setCatalog(null);
    }

    setApiError(nextApiError);

    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!viewTarget) {
      setFinanceSnapshot(null);
      setFinanceLoading(false);
      setFinanceError(null);
      return;
    }

    let active = true;
    setFinanceLoading(true);
    setFinanceError(null);

    api<ParentFinanceSnapshot>(`/api/finance/parents/${viewTarget.id}/profile`)
      .then((snapshot) => {
        if (!active) return;
        setFinanceSnapshot(snapshot);
      })
      .catch((error) => {
        if (!active) return;
        setFinanceSnapshot(null);
        setFinanceError(error instanceof Error ? error.message : "Impossible de charger le dossier financier du parent.");
      })
      .finally(() => {
        if (active) setFinanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [viewTarget]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;

    return parents.filter((parent) => {
      const studentsHaystack = parent.students
        .flatMap((student) => [student.id, student.displayId, student.fullName, student.className, student.classId])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const haystack = [
        parent.fullName,
        parent.id,
        parent.displayId || "",
        parent.phone,
        parent.email,
        studentsHaystack,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [parents, search]);

  const handleSave = async (form: FormState, id?: string) => {
    const fullName = [form.nom, form.postnom, form.prenom].filter(Boolean).join(" ");
    const body = { ...form, fullName };
    try {
      setApiError(null);
      if (id) {
        await api(`/api/parents/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        const created = await api<Parent & { temporaryPassword?: string; accessCode?: string; notificationStatus?: ParentCredentials["notificationStatus"] }>("/api/parents", { method: "POST", body: JSON.stringify(body) });
        if (created.temporaryPassword) {
          setCredentials({
            parentId: created.id,
            parentName: created.fullName,
            email: created.email,
            accessCode: created.accessCode,
            temporaryPassword: created.temporaryPassword,
            notificationStatus: created.notificationStatus
          });
        }
      }
      setShowForm(false);
      setEditTarget(null);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setApiError(null);
      await api(`/api/parents/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    }
  };

  const handleResetPassword = async (parent: Parent, channels: { notifyEmail: boolean; notifySms: boolean }) => {
    try {
      setSendingAccess(true);
      setApiError(null);
      const result = await api<{ parentId: string; email: string; accessCode?: string; temporaryPassword: string; notificationStatus?: ParentCredentials["notificationStatus"] }>(`/api/parents/${parent.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify(channels)
      });
      setNotificationTarget(null);
      setCredentials({
        parentId: result.parentId,
        parentName: parent.fullName,
        email: result.email,
        accessCode: result.accessCode,
        temporaryPassword: result.temporaryPassword,
        notificationStatus: result.notificationStatus
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur API";
      setApiError(message);
    } finally {
      setSendingAccess(false);
    }
  };

  const openEdit = (p: Parent) => { setEditTarget(p); setShowForm(true); };

  const stats = useMemo(() => ({
    total: parents.length,
    totalStudents: parents.reduce((s, p) => s + p.students.length, 0)
  }), [parents]);

  return (
    <div className="edupay-parent-admin space-y-6 pb-8">
      {/* Modals */}
      {viewTarget && (
        <DetailModal
          parent={viewTarget}
          financeSnapshot={financeSnapshot}
          financeLoading={financeLoading}
          financeError={financeError}
          onClose={() => setViewTarget(null)}
          t={t}
        />
      )}
      {credentials && <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />}
      {deleteTarget && <DeleteModal parent={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} t={t} />}
      {notificationTarget && (
        <AccessNotificationModal
          parent={notificationTarget}
          loading={sendingAccess}
          onClose={() => setNotificationTarget(null)}
          onConfirm={(channels) => void handleResetPassword(notificationTarget, channels)}
        />
      )}
      {showForm && (
        <FormModal
          initial={editTarget}
          classes={classes}
          catalog={catalog}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          t={t}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-white">{t("pmTitle")}</h1>
          <p className="text-ink-dim mt-1">{t("pmSubtitle")}</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-all hover:shadow-brand-500/50 active:scale-95 sm:px-5"
        >
          <PlusIcon /> {t("pmAddParent")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fadeInUp">
        <div className="card">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmTotalParents")}</p>
          <p className="font-display text-3xl font-bold text-brand-300 mt-1">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmTotalStudents")}</p>
          <p className="font-display text-3xl font-bold text-cyan-300 mt-1">{stats.totalStudents}</p>
        </div>
        <div className="card col-span-2 md:col-span-1">
          <p className="text-ink-dim text-xs uppercase tracking-[0.1em]">{t("pmSearchResults")}</p>
          <p className="font-display text-3xl font-bold text-emerald-300 mt-1">{filtered.length}</p>
        </div>
      </div>

      {/* Search bar */}
      <SearchField value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pmSearchPlaceholder")} wrapperClassName="animate-fadeInUp" />

      {apiError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger animate-fadeInUp">
          {apiError}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3">👨‍👩‍👧</p>
            <p className="text-ink-dim">{search ? t("pmNoResults") : t("pmEmpty")}</p>
          </div>
        ) : (
          <div className="edupay-scrollbar overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmParentId")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmFullName")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em] hidden md:table-cell">{t("pmPhone")}</th>
                  <th className="text-left py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em] hidden lg:table-cell">{t("email")}</th>
                  <th className="text-center py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmChildren")}</th>
                  <th className="text-center py-4 px-5 text-xs font-bold text-ink-dim uppercase tracking-[0.1em]">{t("pmActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((parent, idx) => (
                  <tr
                    key={parent.id}
                    className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                    style={{ animationDelay: `${idx * 0.04}s` }}
                  >
                    <td className="py-4 px-5">
                      <span className="inline-block max-w-[150px] truncate rounded border border-brand-500/20 bg-brand-500/10 px-2 py-1 font-mono text-xs font-bold text-brand-300">
                        {parent.displayId || parent.id}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-accent shrink-0 flex items-center justify-center text-white text-xs font-bold border border-slate-700/60">
                          {parent.photoUrl ? (
                            <img src={parent.photoUrl} alt={parent.fullName} className="h-full w-full object-cover" />
                          ) : (
                            parent.fullName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-semibold text-white">{parent.fullName}</p>
                          <p className="text-xs text-ink-dim">{new Date(parent.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-ink-dim hidden md:table-cell">{parent.phone || "-"}</td>
                    <td className="py-4 px-5 text-ink-dim hidden lg:table-cell truncate max-w-[180px]">{parent.email || "-"}</td>
                    <td className="py-4 px-5 text-center">
                      <Badge
                        text={`${parent.students.length} ${parent.students.length === 1 ? t("pmChild") : t("pmChildrenCount")}`}
                        color={parent.students.length > 0 ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-slate-700/50 text-ink-dim"}
                      />
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setViewTarget(parent)}
                          className="p-2 rounded-lg bg-slate-700/50 text-ink-dim hover:text-white hover:bg-slate-600/50 transition-all active:scale-90" title={t("pmView")}>
                          <EyeIcon />
                        </button>
                        <button onClick={() => openEdit(parent)}
                          className="p-2 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-all active:scale-90" title={t("pmEdit")}>
                          <EditIcon />
                        </button>
                        <button onClick={() => setNotificationTarget(parent)}
                          className="p-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all active:scale-90" title="Envoyer les accès">
                          <KeyIcon />
                        </button>
                        <button onClick={() => setDeleteTarget(parent)}
                          className="p-2 rounded-lg bg-danger/20 text-danger hover:bg-danger/30 transition-all active:scale-90" title={t("pmDelete")}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
