import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  FileClock,
  HandCoins,
  Plus,
  ReceiptText,
  Save,
  Search,
  ShieldAlert,
  UserRound,
  WalletCards,
  X
} from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type Parent = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students: Array<{ id: string; fullName: string; className?: string; annualFee?: number }>;
};

type CatalogResponse = {
  plans: Array<{
    id: string;
    paymentOptionType: string;
    gradeGroup: string;
  }>;
};

type FinanceSnapshot = {
  parent: { id: string; fullName: string; phone: string; email: string };
  profile: {
    activeTuitionPlan: string;
    totalPaid: number;
    totalDebt: number;
    totalReduction: number;
    carriedOverDebt: number;
    overdueInstallments: number;
    paymentBehaviorScore: number;
    completionRate: number;
  };
  students: Array<{
    id: string;
    fullName: string;
    className?: string | null;
    gradeGroup: string;
    paymentOptionLabel: string;
    planName: string;
    paid: number;
    balance: number;
    completionRate: number;
    overdueInstallments: number;
  }>;
  reductions: Array<{ id: string; title: string; amount: number; studentName?: string | null }>;
  debts: Array<{
    id: string;
    title: string;
    reason?: string | null;
    originalAmount: number;
    amountRemaining: number;
    status: string;
    academicYearId?: string | null;
    academicYearName?: string | null;
    carriedOverFromYearId?: string | null;
    carriedOverFromYearName?: string | null;
    dueDate?: string | null;
    settledAt?: string | null;
    createdAt: string;
  }>;
  agreements: Array<{ id: string; title: string; status: string; balanceDue: number }>;
  alerts: Array<{ id: string; title: string; message: string; severity: string }>;
  paymentHistory?: Array<{
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
};

type AllocationTrace = {
  mode?: string;
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
      label: string;
      dueDate: string;
      allocated: number;
      outstandingAfter: number;
      status: string;
    }>;
  }>;
};

type AdminParentModule = "students" | "debts" | "alerts" | "reductions" | "agreements" | "payments";
type AdminParentAction = "assignment" | "agreement";

type AgreementInstallmentForm = {
  label: string;
  dueDate: string;
  amountDue: string;
  notes: string;
};

const pageCopy = {
  fr: {
    dialogEyebrow: "Suivi financier des parents",
    close: "Fermer",
    closeDialog: "Fermer la boite de dialogue",
    loadProfileError: "Impossible de charger le profil financier parent.",
    loadFinanceError: "Impossible de charger les donnees finance.",
    assignmentSuccess: "Plan officiel affecte avec succes.",
    assignmentError: "Impossible d'affecter le plan officiel.",
    agreementValidationError: "Completez le titre, le total et au moins une echeance valide pour l'accord special.",
    agreementSuccess: "Accord special enregistre avec succes.",
    agreementError: "Impossible de creer l'accord special.",
    loading: "Chargement du suivi parent financier...",
    emptyEyebrow: "Finance parent",
    emptyTitle: "Aucun parent disponible",
    emptyBody: "Ajoutez un parent pour activer le suivi financier detaille.",
    pageEyebrow: "Administration financiere",
    pageTitle: "Suivi financier detaille des parents",
    pageSubtitle: "Vue organisee par modules : plans actifs, reductions, dettes historiques, alertes, accords speciaux et paiements.",
    searchPlaceholder: "Rechercher un parent, telephone, email...",
    profileLoading: "Chargement du profil financier...",
    phoneMissing: "Telephone non renseigne",
    emailMissing: "Email non renseigne",
    activePlan: "Plan actif",
    officialCatalogLoaded: "{{count}} variantes officielles chargees dans le catalogue finance.",
    behaviorScore: "Score de comportement",
    completion: "Couverture {{rate}}%",
    paid: "Paye",
    debt: "Dette",
    reductions: "Reductions",
    carryOver: "Solde anterieur inclus",
    overdue: "Echeances en retard",
    paidHelp: "Montant deja encaisse sur le plan de scolarite.",
    debtHelp: "Reste a payer selon le plan actif et les ajustements.",
    reductionsHelp: "Remises et reductions appliquees au dossier.",
    carryOverHelp: "Dette d'une annee precedente ramenee dans le suivi actuel.",
    overdueHelp: "Echeances du plan de paiement qui ne sont pas encore soldees.",
    coveredMetric: "{{rate}} % couvert",
    lateMetric: "{{count}} retard(s)",
    none: "Aucun",
    studentsPlansTitle: "Enfants et plans",
    studentsPlansSubtitle: "Plans actifs, progression, soldes et echeances a suivre par enfant.",
    historicalDebtsTitle: "Dettes historiques",
    historicalDebtsSubtitle: "Synthese detaillee des dettes du parent : montants, annees, echeances, dates de creation, reglements et soldes.",
    alertsTitle: "Alertes",
    alertsSubtitle: "Alertes de retard, anomalies et pression de recouvrement.",
    reductionsTitle: "Reductions",
    reductionsSubtitle: "Remises officielles et avantages appliques au dossier.",
    agreementsTitle: "Accords speciaux",
    agreementsSubtitle: "Accords proprietaire/direction, statuts et soldes restants.",
    paymentsTitle: "Paiements",
    paymentsSubtitle: "Historique des paiements et recus lies au parent.",
    open: "Ouvrir",
    adminFileEyebrow: "Dossier administratif du parent",
    adminFileTitle: "Plans officiels et accords speciaux",
    adminFileSubtitle: "Les actions sensibles restent rattachees au parent selectionne et s'ouvrent dans une fenetre dediee.",
    plans: "Plans",
    agreements: "Accords",
    assignPlanTitle: "Affecter un plan officiel de scolarite",
    assignPlanSubtitle: "Affecter un plan KCS officiel au parent entier ou a un enfant precis.",
    openWindow: "Ouvrir la fenetre",
    createAgreementTitle: "Creer un accord direction",
    createAgreementSubtitle: "Creer un accord direction avec echeances, reductions et notes privees.",
    classMissing: "Classe non renseignee",
    balance: "Solde",
    coverage: "Couverture",
    totalTrackedDebt: "Solde total restant",
    originalDebtTotal: "Somme initiale des dettes",
    settledDebtTotal: "Montant deja regle",
    currentYearDebt: "Dette de l'annee courante",
    dateWindow: "Periode observee",
    noDebtDateWindow: "Aucune date de dette disponible",
    fromDateToDate: "De {{from}} a {{to}}",
    dueWindow: "Fenetre des echeances",
    debtSummaryHelp: "Cette synthese additionne toutes les lignes de dette rattachees au parent, puis separe ce qui vient du plan courant et ce qui vient des annees anterieures.",
    previousYears: "Annees anterieures",
    debtLines: "Lignes de dette",
    noDebtForParent: "Aucune dette enregistree pour ce parent.",
    generatedDebtReason: "Dette generee par le moteur financier EduPay.",
    historicalDebtFlag: "Dette d'annee anterieure / solde anterieur",
    initialAmount: "Montant initial",
    settledAmount: "Montant regle",
    remainingBalance: "Solde restant",
    debtYear: "Annee de la dette",
    carriedFrom: "Annee d'origine",
    dueDate: "Echeance",
    createdAt: "Creee le",
    settledAt: "Reglee le",
    debtAge: "Age de la dette",
    daysBeforeDue: "{{count}} jour(s) avant echeance",
    daysOverdue: "{{count}} jour(s) apres echeance",
    createdDaysAgo: "Creee il y a {{count}} jour(s)",
    createdToday: "Creee aujourd'hui",
    identifier: "Identifiant",
    notProvidedF: "Non renseignee",
    notProvidedM: "Non renseigne",
    notCarried: "Pas de solde anterieur",
    noDueDate: "Non definie",
    notSettled: "Non reglee",
    noActiveAlert: "Aucune alerte active.",
    noAlert: "Aucune alerte.",
    noActiveDebt: "Aucune dette active.",
    noReductionApplied: "Aucune reduction appliquee.",
    noReductionTracked: "Aucune reduction tracee.",
    parentAccount: "Compte parent",
    noAgreement: "Aucun accord special.",
    noHistoricalPayment: "Aucun paiement historique disponible.",
    noLinkedStudent: "Aucun eleve lie",
    selectedParent: "Parent selectionne",
    currentActivePlan: "Plan actif actuel",
    studentTarget: "Cible eleve",
    allParentStudents: "Tous les eleves du parent",
    paymentOption: "Option de paiement",
    notes: "Notes",
    assignmentNotesPlaceholder: "Notes d'affectation, justification, commentaire administratif...",
    assigning: "Affectation...",
    assignPlanButton: "Affecter le plan officiel",
    agreementSubtitleFor: "Accord special cree dans le dossier de {{name}}.",
    assignmentSubtitleFor: "Plan officiel rattache au dossier de {{name}}.",
    status: "Statut",
    title: "Titre",
    agreementTitlePlaceholder: "Titre de l'accord direction",
    customTotal: "Total personnalise",
    reductionAmount: "Montant de reduction",
    gradeGroup: "Groupe de niveau",
    installments: "Echeances",
    addInstallment: "Ajouter une echeance",
    label: "Libelle",
    amountDue: "Montant du",
    installmentNotesPlaceholder: "Notes internes pour cette echeance",
    remove: "Retirer",
    publicNotesPlaceholder: "Notes visibles pour le dossier financier",
    privateNotesPlaceholder: "Notes privees du proprietaire / direction",
    creating: "Creation...",
    saveAgreement: "Enregistrer l'accord special",
    studentsAssignedPlans: "Enfants et plans affectes",
    coverageText: "{{rate}}% couvert",
    overdueInstallments: "{{count}} echeance(s) en retard",
    alertsAndDebts: "Alertes et dettes",
    remaining: "Restant {{amount}}",
    carryOverFrom: "Solde anterieur depuis {{year}}",
    specialAgreements: "Accords speciaux",
    balanceDue: "Solde restant {{amount}}",
    selectParentPrompt: "Selectionnez un parent pour afficher son profil financier detaille.",
    optionFullPreSeptember: "Paiement complet avant septembre",
    optionTwoInstallments: "Paiement en deux tranches",
    optionThreeInstallments: "Paiement en trois tranches",
    optionStandardMonthly: "Paiement mensuel standard",
    gradeK: "Maternelle (K3-K5)",
    grade1to5: "Classes 1-5",
    grade6to8: "Classes 6-8",
    grade9to12: "Classes 9-12",
    gradeCustom: "Personnalise",
    statusDraft: "Brouillon",
    statusPendingApproval: "En attente d'approbation",
    statusApproved: "Approuve",
    statusRejected: "Rejete",
    statusOpen: "Ouverte",
    statusPartiallyPaid: "Partiellement payee",
    statusPaid: "Payee",
    statusHigh: "Elevee",
    statusMedium: "Moyenne",
    statusLow: "Faible",
    statusFailed: "Echoue",
    statusPending: "En attente",
    statusCompleted: "Termine"
  },
  en: {
    dialogEyebrow: "Parent financial tracking",
    close: "Close",
    closeDialog: "Close dialog",
    loadProfileError: "Unable to load the parent financial profile.",
    loadFinanceError: "Unable to load finance data.",
    assignmentSuccess: "Official plan assigned successfully.",
    assignmentError: "Unable to assign the official plan.",
    agreementValidationError: "Complete the title, total, and at least one valid installment for the special agreement.",
    agreementSuccess: "Special agreement saved successfully.",
    agreementError: "Unable to create the special agreement.",
    loading: "Loading parent financial tracking...",
    emptyEyebrow: "Parent finance",
    emptyTitle: "No parent available",
    emptyBody: "Add a parent to activate detailed financial tracking.",
    pageEyebrow: "Financial administration",
    pageTitle: "Detailed parent financial tracking",
    pageSubtitle: "Module-based view: active plans, reductions, historical debts, alerts, special agreements, and payments.",
    searchPlaceholder: "Search by parent, phone, email...",
    profileLoading: "Loading financial profile...",
    phoneMissing: "Phone not provided",
    emailMissing: "Email not provided",
    activePlan: "Active plan",
    officialCatalogLoaded: "{{count}} official variants loaded in the finance catalog.",
    behaviorScore: "Behavior score",
    completion: "Completion {{rate}}%",
    paid: "Paid",
    debt: "Debt",
    reductions: "Reductions",
    carryOver: "Previous balance included",
    overdue: "Overdue installments",
    paidHelp: "Amount already collected on the tuition plan.",
    debtHelp: "Remaining amount due under the active plan and adjustments.",
    reductionsHelp: "Discounts and reductions applied to the file.",
    carryOverHelp: "Debt from a previous year brought into the current tracking view.",
    overdueHelp: "Installments in the payment plan that are not settled yet.",
    coveredMetric: "{{rate}}% covered",
    lateMetric: "{{count}} overdue",
    none: "None",
    studentsPlansTitle: "Children and plans",
    studentsPlansSubtitle: "Active plans, progress, balances, and overdue items by child.",
    historicalDebtsTitle: "Historical debts",
    historicalDebtsSubtitle: "Detailed summary of the parent's debts: amounts, years, due dates, creation dates, settlements, and balances.",
    alertsTitle: "Alerts",
    alertsSubtitle: "Late-payment alerts, anomalies, and collection pressure.",
    reductionsTitle: "Reductions",
    reductionsSubtitle: "Official discounts and benefits applied to the file.",
    agreementsTitle: "Special agreements",
    agreementsSubtitle: "Owner/management agreements, statuses, and remaining balances.",
    paymentsTitle: "Payments",
    paymentsSubtitle: "Payment history and receipts linked to the parent.",
    open: "Open",
    adminFileEyebrow: "Parent administrative file",
    adminFileTitle: "Official plans and special agreements",
    adminFileSubtitle: "Sensitive actions remain attached to the selected parent and open in a dedicated window.",
    plans: "Plans",
    agreements: "Agreements",
    assignPlanTitle: "Assign official tuition plan",
    assignPlanSubtitle: "Assign an official KCS plan to the whole parent account or to a specific child.",
    openWindow: "Open window",
    createAgreementTitle: "Create owner agreement",
    createAgreementSubtitle: "Create a management agreement with installments, reductions, and private notes.",
    classMissing: "Class not provided",
    balance: "Balance",
    coverage: "Coverage",
    totalTrackedDebt: "Total remaining balance",
    originalDebtTotal: "Original debt total",
    settledDebtTotal: "Amount already settled",
    currentYearDebt: "Current-year debt",
    dateWindow: "Observed period",
    noDebtDateWindow: "No debt date available",
    fromDateToDate: "From {{from}} to {{to}}",
    dueWindow: "Due-date window",
    debtSummaryHelp: "This summary adds all debt lines linked to the parent, then separates the current plan from previous-year balances.",
    previousYears: "Previous years",
    debtLines: "Debt lines",
    noDebtForParent: "No debt recorded for this parent.",
    generatedDebtReason: "Debt generated by the EduPay finance engine.",
    historicalDebtFlag: "Previous-year debt / previous balance",
    initialAmount: "Initial amount",
    settledAmount: "Settled amount",
    remainingBalance: "Remaining balance",
    debtYear: "Debt year",
    carriedFrom: "Source year",
    dueDate: "Due date",
    createdAt: "Created on",
    settledAt: "Settled on",
    debtAge: "Debt age",
    daysBeforeDue: "{{count}} day(s) before due date",
    daysOverdue: "{{count}} day(s) past due",
    createdDaysAgo: "Created {{count}} day(s) ago",
    createdToday: "Created today",
    identifier: "Identifier",
    notProvidedF: "Not provided",
    notProvidedM: "Not provided",
    notCarried: "No previous balance",
    noDueDate: "Not defined",
    notSettled: "Not settled",
    noActiveAlert: "No active alert.",
    noAlert: "No alert.",
    noActiveDebt: "No active debt.",
    noReductionApplied: "No reduction applied.",
    noReductionTracked: "No reduction tracked.",
    parentAccount: "Parent account",
    noAgreement: "No special agreement.",
    noHistoricalPayment: "No historical payment available.",
    noLinkedStudent: "No linked student",
    selectedParent: "Selected parent",
    currentActivePlan: "Current active plan",
    studentTarget: "Student target",
    allParentStudents: "All parent students",
    paymentOption: "Payment option",
    notes: "Notes",
    assignmentNotesPlaceholder: "Assignment notes, justification, administrative comment...",
    assigning: "Assigning...",
    assignPlanButton: "Assign official plan",
    agreementSubtitleFor: "Special agreement created in {{name}}'s file.",
    assignmentSubtitleFor: "Official plan attached to {{name}}'s file.",
    status: "Status",
    title: "Title",
    agreementTitlePlaceholder: "Owner agreement title",
    customTotal: "Custom total",
    reductionAmount: "Reduction amount",
    gradeGroup: "Grade group",
    installments: "Installments",
    addInstallment: "Add installment",
    label: "Label",
    amountDue: "Amount due",
    installmentNotesPlaceholder: "Internal notes for this installment",
    remove: "Remove",
    publicNotesPlaceholder: "Visible notes for the financial file",
    privateNotesPlaceholder: "Private owner / management notes",
    creating: "Creating...",
    saveAgreement: "Save special agreement",
    studentsAssignedPlans: "Students and assigned plans",
    coverageText: "{{rate}}% covered",
    overdueInstallments: "{{count}} overdue installment(s)",
    alertsAndDebts: "Alerts and debts",
    remaining: "Remaining {{amount}}",
    carryOverFrom: "Previous balance from {{year}}",
    specialAgreements: "Special agreements",
    balanceDue: "Balance due {{amount}}",
    selectParentPrompt: "Select a parent to display the detailed financial profile.",
    optionFullPreSeptember: "Full payment before September",
    optionTwoInstallments: "Two-installment payment",
    optionThreeInstallments: "Three-installment payment",
    optionStandardMonthly: "Standard monthly payment",
    gradeK: "K (K3-K5)",
    grade1to5: "Grades 1-5",
    grade6to8: "Grades 6-8",
    grade9to12: "Grades 9-12",
    gradeCustom: "Custom",
    statusDraft: "Draft",
    statusPendingApproval: "Pending approval",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusOpen: "Open",
    statusPartiallyPaid: "Partially paid",
    statusPaid: "Paid",
    statusHigh: "High",
    statusMedium: "Medium",
    statusLow: "Low",
    statusFailed: "Failed",
    statusPending: "Pending",
    statusCompleted: "Completed"
  }
} as const;

type PageLang = keyof typeof pageCopy;
type PageCopy = typeof pageCopy[PageLang];

const paymentOptionChoices = [
  { value: "FULL_PRESEPTEMBER", labelKey: "optionFullPreSeptember" },
  { value: "TWO_INSTALLMENTS", labelKey: "optionTwoInstallments" },
  { value: "THREE_INSTALLMENTS", labelKey: "optionThreeInstallments" },
  { value: "STANDARD_MONTHLY", labelKey: "optionStandardMonthly" }
] as const;

const gradeGroupChoices = [
  { value: "K", labelKey: "gradeK" },
  { value: "GRADE_1_5", labelKey: "grade1to5" },
  { value: "GRADE_6_8", labelKey: "grade6to8" },
  { value: "GRADE_9_12", labelKey: "grade9to12" },
  { value: "CUSTOM", labelKey: "gradeCustom" }
] as const;

const agreementStatusChoices = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"];

function tone(status: string) {
  if (status === "HIGH" || status === "OPEN") return "border-red-500/25 bg-red-500/10 text-red-100";
  if (status === "MEDIUM" || status === "PARTIALLY_PAID" || status === "PENDING_APPROVAL") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  if (status === "APPROVED" || status === "PAID") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
}

function emptyInstallment(): AgreementInstallmentForm {
  return { label: "", dueDate: "", amountDue: "", notes: "" };
}

function formatCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(values[key] ?? ""));
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function statusLabel(status: string, copy: PageCopy) {
  const labels: Record<string, string> = {
    DRAFT: copy.statusDraft,
    PENDING_APPROVAL: copy.statusPendingApproval,
    APPROVED: copy.statusApproved,
    REJECTED: copy.statusRejected,
    OPEN: copy.statusOpen,
    PARTIALLY_PAID: copy.statusPartiallyPaid,
    PAID: copy.statusPaid,
    HIGH: copy.statusHigh,
    MEDIUM: copy.statusMedium,
    LOW: copy.statusLow,
    FAILED: copy.statusFailed,
    PENDING: copy.statusPending,
    COMPLETED: copy.statusCompleted
  };
  return labels[status] ?? status;
}

function AdminParentDialog({
  title,
  subtitle,
  children,
  onClose,
  copy
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
  copy: PageCopy;
}) {
  return (
    <div className="edupay-parent-tracking-dialog fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-5">
      <button aria-label={copy.close} className="absolute inset-0 bg-slate-950/78 backdrop-blur-md" onClick={onClose} />
      <section className="edupay-parent-tracking-modal relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/95 shadow-2xl">
        <header className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">{copy.dialogEyebrow}</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-white">{title}</h2>
            <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-dim hover:border-brand-300/30 hover:text-white"
            aria-label="Fermer la boîte de dialogue"
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

function AllocationTraceBlock({ trace, money, lang }: { trace?: AllocationTrace | null; money: Intl.NumberFormat; lang: string }) {
  if (!trace) return null;
  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <p className="font-black uppercase tracking-[0.16em] text-emerald-100">Repartition tracee par EduPay {trace.mode ? `(${trace.mode})` : ""}</p>
        <p className="font-mono font-bold text-emerald-200">{money.format(trace.allocatedTotal)} / {money.format(trace.totalReceived)}</p>
      </div>
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
      {trace.advanceBalance > 0 && <p className="mt-2 text-xs text-emerald-100">Avance conservee: {money.format(trace.advanceBalance)}</p>}
    </div>
  );
}

export function FinanceParentAdminPage() {
  const { lang } = useI18n();
  const copy = pageCopy[lang as PageLang];
  const [parents, setParents] = useState<Parent[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<AdminParentModule | null>(null);
  const [activeAction, setActiveAction] = useState<AdminParentAction | null>(null);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [agreementSubmitting, setAgreementSubmitting] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ studentId: "", paymentOptionType: "STANDARD_MONTHLY", notes: "" });
  const [agreementForm, setAgreementForm] = useState({
    studentId: "",
    title: "",
    customTotal: "",
    reductionAmount: "0",
    gradeGroup: "CUSTOM",
    status: "PENDING_APPROVAL",
    notes: "",
    privateNotes: "",
    installments: [emptyInstallment()]
  });

  const money = useMemo(
    () => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    [lang]
  );

  const loadSnapshot = async (parentId: string) => {
    setDetailLoading(true);
    try {
      const result = await api<FinanceSnapshot>(`/api/finance/parents/${parentId}/profile`);
      setSnapshot(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadProfileError);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Parent[]>("/api/parents").catch(() => []),
      api<CatalogResponse>("/api/finance/catalog").catch(() => null)
    ])
      .then(([rows, catalogResult]) => {
        if (!active) return;
        setParents(rows);
        setCatalog(catalogResult);
        setSelectedId(rows[0]?.id ?? "");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : copy.loadFinanceError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSnapshot(null);
      return;
    }
    void loadSnapshot(selectedId);
  }, [selectedId]);

  const filteredParents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return parents;
    return parents.filter((parent) =>
      parent.fullName.toLowerCase().includes(query) ||
      parent.id.toLowerCase().includes(query) ||
      String(parent.phone ?? "").toLowerCase().includes(query) ||
      String(parent.email ?? "").toLowerCase().includes(query)
    );
  }, [parents, search]);

  const selectedParent = useMemo(
    () => parents.find((parent) => parent.id === selectedId) ?? null,
    [parents, selectedId]
  );

  const availableStudents = selectedParent?.students ?? [];

  const summaryCards = snapshot ? [
    { label: copy.paid, value: money.format(snapshot.profile.totalPaid), detail: copy.paidHelp, color: "text-emerald-300", Icon: WalletCards },
    { label: copy.debt, value: money.format(snapshot.profile.totalDebt), detail: copy.debtHelp, color: "text-red-300", Icon: AlertTriangle },
    { label: copy.reductions, value: money.format(snapshot.profile.totalReduction), detail: copy.reductionsHelp, color: "text-cyan-300", Icon: HandCoins },
    { label: copy.carryOver, value: money.format(snapshot.profile.carriedOverDebt), detail: copy.carryOverHelp, color: "text-amber-300", Icon: FileClock },
    { label: copy.overdue, value: String(snapshot.profile.overdueInstallments), detail: copy.overdueHelp, color: "text-orange-300", Icon: ShieldAlert }
  ] : [];

  const historicalDebts = snapshot?.debts.filter((debt) =>
    Boolean(debt.carriedOverFromYearId || debt.carriedOverFromYearName) ||
    Boolean(debt.academicYearId && debt.academicYearName && debt.academicYearName !== "2026-2027")
  ) ?? [];
  const historicalDebtTotal = historicalDebts.reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0);
  const currentDebtTotal = snapshot?.debts.reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0) ?? 0;
  const originalDebtTotal = snapshot?.debts.reduce((sum, debt) => sum + Number(debt.originalAmount || 0), 0) ?? 0;
  const settledDebtTotal = Math.max(originalDebtTotal - currentDebtTotal, 0);
  const currentYearDebtTotal = Math.max(currentDebtTotal - historicalDebtTotal, 0);
  const debtCreatedDates = (snapshot?.debts ?? []).map((debt) => parseDate(debt.createdAt)).filter((date): date is Date => Boolean(date));
  const debtDueDates = (snapshot?.debts ?? []).map((debt) => parseDate(debt.dueDate)).filter((date): date is Date => Boolean(date));
  const firstDebtDate = debtCreatedDates.length ? new Date(Math.min(...debtCreatedDates.map((date) => date.getTime()))) : null;
  const lastDebtDate = debtCreatedDates.length ? new Date(Math.max(...debtCreatedDates.map((date) => date.getTime()))) : null;
  const firstDueDate = debtDueDates.length ? new Date(Math.min(...debtDueDates.map((date) => date.getTime()))) : null;
  const lastDueDate = debtDueDates.length ? new Date(Math.max(...debtDueDates.map((date) => date.getTime()))) : null;
  const paymentCount = snapshot?.paymentHistory?.length ?? 0;
  const moduleCards: Array<{
    id: AdminParentModule;
    title: string;
    subtitle: string;
    count: number;
    metric: string;
    Icon: typeof WalletCards;
    toneClass: string;
  }> = snapshot ? [
    { id: "students", title: copy.studentsPlansTitle, subtitle: copy.studentsPlansSubtitle, count: snapshot.students.length, metric: formatCopy(copy.coveredMetric, { rate: snapshot.profile.completionRate.toFixed(1) }), Icon: CalendarClock, toneClass: "border-brand-300/20 bg-brand-500/10 text-brand-100" },
    { id: "debts", title: copy.historicalDebtsTitle, subtitle: copy.historicalDebtsSubtitle, count: snapshot.debts.length, metric: money.format(historicalDebtTotal), Icon: FileClock, toneClass: "border-red-300/20 bg-red-500/10 text-red-100" },
    { id: "alerts", title: copy.alertsTitle, subtitle: copy.alertsSubtitle, count: snapshot.alerts.length, metric: formatCopy(copy.lateMetric, { count: snapshot.profile.overdueInstallments }), Icon: ShieldAlert, toneClass: "border-amber-300/20 bg-amber-500/10 text-amber-100" },
    { id: "reductions", title: copy.reductionsTitle, subtitle: copy.reductionsSubtitle, count: snapshot.reductions.length, metric: money.format(snapshot.profile.totalReduction), Icon: HandCoins, toneClass: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100" },
    { id: "agreements", title: copy.agreementsTitle, subtitle: copy.agreementsSubtitle, count: snapshot.agreements.length, metric: snapshot.agreements[0] ? money.format(snapshot.agreements[0].balanceDue) : copy.none, Icon: Save, toneClass: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" },
    { id: "payments", title: copy.paymentsTitle, subtitle: copy.paymentsSubtitle, count: paymentCount, metric: money.format(snapshot.profile.totalPaid), Icon: ReceiptText, toneClass: "border-violet-300/20 bg-violet-500/10 text-violet-100" }
  ] : [];
  const selectedModule = moduleCards.find((module) => module.id === activeModule) ?? null;

  const matchingPlanCount = useMemo(() => {
    if (!catalog) return 0;
    return catalog.plans.filter((plan) => paymentOptionChoices.some((option) => option.value === plan.paymentOptionType)).length;
  }, [catalog]);

  const submitAssignment = async () => {
    if (!selectedParent) return;
    setAssignmentSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      await api("/api/finance/assignments", {
        method: "POST",
        body: JSON.stringify({
          parentId: selectedParent.id,
          studentId: assignmentForm.studentId || undefined,
          paymentOptionType: assignmentForm.paymentOptionType,
          notes: assignmentForm.notes || undefined
        })
      });
      setSuccess(copy.assignmentSuccess);
      await loadSnapshot(selectedParent.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.assignmentError);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const submitAgreement = async () => {
    if (!selectedParent) return;
    const installments = agreementForm.installments
      .filter((row) => row.label.trim() && row.dueDate.trim() && Number(row.amountDue) > 0)
      .map((row) => ({
        label: row.label.trim(),
        dueDate: new Date(row.dueDate).toISOString(),
        amountDue: Number(row.amountDue),
        notes: row.notes.trim() || undefined
      }));

    if (!agreementForm.title.trim() || Number(agreementForm.customTotal) <= 0 || installments.length === 0) {
      setError(copy.agreementValidationError);
      return;
    }

    setAgreementSubmitting(true);
    setSuccess(null);
    setError(null);
    try {
      await api("/api/finance/agreements", {
        method: "POST",
        body: JSON.stringify({
          parentId: selectedParent.id,
          studentId: agreementForm.studentId || undefined,
          title: agreementForm.title.trim(),
          customTotal: Number(agreementForm.customTotal),
          reductionAmount: Number(agreementForm.reductionAmount || 0),
          gradeGroup: agreementForm.gradeGroup,
          status: agreementForm.status,
          notes: agreementForm.notes.trim() || undefined,
          privateNotes: agreementForm.privateNotes.trim() || undefined,
          installments
        })
      });
      setSuccess(copy.agreementSuccess);
      await loadSnapshot(selectedParent.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.agreementError);
    } finally {
      setAgreementSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">{copy.loading}</p>
        </div>
      </div>
    );
  }

  if (!parents.length) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-amber-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{copy.emptyEyebrow}</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">{copy.emptyTitle}</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? copy.emptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="edupay-parent-admin min-w-0 space-y-6 overflow-hidden pb-10 animate-fadeInUp">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">{copy.pageEyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">{copy.pageTitle}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          {copy.pageSubtitle}
        </p>
      </div>

      {success && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>}
      {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
        <aside className="card glass min-w-0 border border-brand-500/10 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full !pl-10"
            />
          </div>
          <div className="edupay-scrollbar mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
            {filteredParents.map((parent) => (
              <button
                key={parent.id}
                type="button"
                onClick={() => setSelectedId(parent.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-all ${
                  selectedId === parent.id
                    ? "border-brand-400 bg-brand-500/15"
                    : "border-slate-700/60 bg-slate-900/25 hover:border-slate-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{parent.fullName}</p>
                    <p className="mt-1 truncate text-xs text-ink-dim">{parent.phone || parent.email || parent.id}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-ink-dim">{parent.students.length}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {detailLoading && !snapshot ? (
            <div className="card glass border border-white/10 shadow-lg">
              <p className="text-sm text-ink-dim">{copy.profileLoading}</p>
            </div>
          ) : snapshot ? (
            <>
              <div className="card glass border border-cyan-500/10 shadow-lg">
                <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-200">
                        <UserRound className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="break-words font-display text-2xl font-bold text-white">{snapshot.parent.fullName}</h2>
                        <p className="break-words text-sm text-ink-dim">{snapshot.parent.phone || copy.phoneMissing} · {snapshot.parent.email || copy.emailMissing}</p>
                      </div>
                    </div>
                    <p className="mt-4 max-w-2xl break-words text-sm text-ink-dim">{copy.activePlan}: {snapshot.profile.activeTuitionPlan}</p>
                    <p className="mt-2 break-words text-xs text-cyan-200">{formatCopy(copy.officialCatalogLoaded, { count: matchingPlanCount })}</p>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-6 w-6 text-cyan-300" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">{copy.behaviorScore}</p>
                        <p className="font-mono text-2xl font-black text-white">{snapshot.profile.paymentBehaviorScore.toFixed(0)}%</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-cyan-200">{formatCopy(copy.completion, { rate: snapshot.profile.completionRate.toFixed(1) })}</p>
                  </div>
                </div>

                <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {summaryCards.map(({ label, value, detail, color, Icon }) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{label}</p>
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <p className={`mt-2 break-words font-mono text-lg font-bold ${color}`}>{value}</p>
                      <p className="mt-2 text-xs leading-5 text-ink-dim">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {moduleCards.map((module) => {
                  const Icon = module.Icon;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => setActiveModule(module.id)}
                      className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left shadow-lg transition hover:border-brand-300/30 hover:bg-white/[0.075]"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${module.toneClass}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <span className="break-words font-display text-xl font-bold text-white">{module.title}</span>
                            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-ink-dim">{module.count}</span>
                          </span>
                          <span className="mt-2 block text-sm text-ink-dim">{module.subtitle}</span>
                          <span className="mt-4 flex min-w-0 items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-brand-100">
                            <span className="break-words">{module.metric}</span>
                            <span className="rounded-full border border-white/10 px-3 py-1 normal-case tracking-normal text-white group-hover:border-brand-300/30">{copy.open}</span>
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-lg sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">{copy.adminFileEyebrow}</p>
                    <h3 className="mt-2 font-display text-xl font-bold text-white">{copy.adminFileTitle}</h3>
                    <p className="mt-1 max-w-3xl text-sm text-ink-dim">
                      {copy.adminFileSubtitle}
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-center">
                    <div className="px-3 py-2">
                      <p className="font-mono text-lg font-bold text-brand-100">{matchingPlanCount}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">{copy.plans}</p>
                    </div>
                    <div className="border-l border-white/10 px-3 py-2">
                      <p className="font-mono text-lg font-bold text-emerald-200">{snapshot.agreements.length}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">{copy.agreements}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveAction("assignment")}
                    className="group flex min-w-0 items-start gap-4 rounded-2xl border border-brand-300/20 bg-brand-500/10 p-4 text-left transition-all hover:border-brand-200/45 hover:bg-brand-500/15"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-500/15 text-brand-100">
                      <Save className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-bold text-white">{copy.assignPlanTitle}</span>
                      <span className="mt-1 block text-sm text-ink-dim">{copy.assignPlanSubtitle}</span>
                      <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-brand-100 group-hover:border-brand-200/40">{copy.openWindow}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAction("agreement")}
                    className="group flex min-w-0 items-start gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-left transition-all hover:border-emerald-200/45 hover:bg-emerald-500/15"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-500/15 text-emerald-100">
                      <HandCoins className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-bold text-white">{copy.createAgreementTitle}</span>
                      <span className="mt-1 block text-sm text-ink-dim">{copy.createAgreementSubtitle}</span>
                      <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-emerald-100 group-hover:border-emerald-200/40">{copy.openWindow}</span>
                    </span>
                  </button>
                </div>
              </section>

              {selectedModule && (
                <AdminParentDialog title={selectedModule.title} subtitle={selectedModule.subtitle} onClose={() => setActiveModule(null)} copy={copy}>
                  {activeModule === "students" && (
                    <div className="space-y-3">
                      {snapshot.students.map((student) => (
                        <article key={student.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-display text-xl font-bold text-white">{student.fullName}</p>
                              <p className="mt-1 text-sm text-ink-dim">{student.className || copy.classMissing} · {student.planName}</p>
                              <p className="mt-2 text-xs text-cyan-200">{student.paymentOptionLabel}</p>
                            </div>
                            <div className="grid gap-2 text-sm sm:grid-cols-3">
                              <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-emerald-300">{copy.paid}: {money.format(student.paid)}</span>
                              <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-red-300">{copy.balance}: {money.format(student.balance)}</span>
                              <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-amber-300">{copy.overdue}: {student.overdueInstallments}</span>
                            </div>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, student.completionRate))}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-ink-dim">{copy.coverage}: {student.completionRate.toFixed(1)} %</p>
                        </article>
                      ))}
                    </div>
                  )}

                  {activeModule === "debts" && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-sm leading-6 text-ink-dim">{copy.debtSummaryHelp}</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-500/20 bg-slate-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.originalDebtTotal}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-white">{money.format(originalDebtTotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.totalTrackedDebt}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-red-200">{money.format(currentDebtTotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.settledDebtTotal}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-emerald-200">{money.format(settledDebtTotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.currentYearDebt}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-brand-100">{money.format(currentYearDebtTotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.previousYears}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-amber-200">{money.format(historicalDebtTotal)}</p>
                        </div>
                        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.debtLines}</p>
                          <p className="mt-2 font-mono text-xl font-bold text-cyan-200">{snapshot.debts.length}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.dateWindow}</p>
                          <p className="mt-2 font-semibold text-white">
                            {firstDebtDate && lastDebtDate
                              ? formatCopy(copy.fromDateToDate, {
                                  from: firstDebtDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US"),
                                  to: lastDebtDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")
                                })
                              : copy.noDebtDateWindow}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{copy.dueWindow}</p>
                          <p className="mt-2 font-semibold text-white">
                            {firstDueDate && lastDueDate
                              ? formatCopy(copy.fromDateToDate, {
                                  from: firstDueDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US"),
                                  to: lastDueDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")
                                })
                              : copy.noDueDate}
                          </p>
                        </div>
                      </div>

                      {snapshot.debts.length === 0 && <p className="text-sm text-ink-dim">{copy.noDebtForParent}</p>}
                      {snapshot.debts.map((debt) => {
                        const isHistorical = historicalDebts.some((entry) => entry.id === debt.id);
                        const createdDate = parseDate(debt.createdAt);
                        const dueDate = parseDate(debt.dueDate);
                        const settledAt = parseDate(debt.settledAt);
                        const today = new Date();
                        const createdDays = createdDate ? Math.max(0, daysBetween(createdDate, today)) : null;
                        const dueDelta = dueDate ? daysBetween(today, dueDate) : null;
                        const settledAmount = Math.max(Number(debt.originalAmount || 0) - Number(debt.amountRemaining || 0), 0);
                        return (
                          <article key={debt.id} className={`rounded-2xl border p-4 ${isHistorical ? "border-amber-500/25 bg-amber-500/10" : "border-white/10 bg-slate-950/40"}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-semibold text-white">{debt.title}</p>
                                <p className="mt-1 text-sm text-ink-dim">{debt.reason || copy.generatedDebtReason}</p>
                                {isHistorical && <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-200">{copy.historicalDebtFlag}</p>}
                              </div>
                              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${tone(debt.status)}`}>{statusLabel(debt.status, copy)}</span>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.initialAmount}</p><p className="mt-1 font-mono font-bold text-white">{money.format(debt.originalAmount || 0)}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.settledAmount}</p><p className="mt-1 font-mono font-bold text-emerald-300">{money.format(settledAmount)}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.remainingBalance}</p><p className="mt-1 font-mono font-bold text-red-300">{money.format(debt.amountRemaining)}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.debtYear}</p><p className="mt-1 font-semibold text-white">{debt.academicYearName || debt.academicYearId || copy.notProvidedF}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.carriedFrom}</p><p className="mt-1 font-semibold text-white">{debt.carriedOverFromYearName || debt.carriedOverFromYearId || copy.notCarried}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                                <p className="text-xs text-ink-dim">{copy.dueDate}</p>
                                <p className="mt-1 font-semibold text-white">{dueDate ? dueDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : copy.noDueDate}</p>
                                {dueDelta !== null && <p className={`mt-1 text-xs ${dueDelta < 0 ? "text-red-300" : "text-amber-200"}`}>{dueDelta < 0 ? formatCopy(copy.daysOverdue, { count: Math.abs(dueDelta) }) : formatCopy(copy.daysBeforeDue, { count: dueDelta })}</p>}
                              </div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                                <p className="text-xs text-ink-dim">{copy.createdAt}</p>
                                <p className="mt-1 font-semibold text-white">{createdDate ? createdDate.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : copy.notProvidedM}</p>
                                {createdDays !== null && <p className="mt-1 text-xs text-ink-dim">{createdDays === 0 ? copy.createdToday : formatCopy(copy.createdDaysAgo, { count: createdDays })}</p>}
                              </div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.settledAt}</p><p className="mt-1 font-semibold text-white">{settledAt ? settledAt.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US") : copy.notSettled}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.debtAge}</p><p className="mt-1 font-semibold text-white">{createdDays !== null ? (createdDays === 0 ? copy.createdToday : formatCopy(copy.createdDaysAgo, { count: createdDays })) : copy.notProvidedM}</p></div>
                              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-ink-dim">{copy.identifier}</p><p className="mt-1 break-all font-mono text-xs font-semibold text-cyan-200">{debt.id}</p></div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {activeModule === "alerts" && (
                    <div className="space-y-3">
                      {snapshot.alerts.length === 0 && <p className="text-sm text-ink-dim">{copy.noActiveAlert}</p>}
                      {snapshot.alerts.map((alert) => (
                        <article key={alert.id} className={`rounded-2xl border p-4 ${tone(alert.severity)}`}>
                          <p className="font-semibold text-white">{alert.title}</p>
                          <p className="mt-1 text-sm opacity-90">{alert.message}</p>
                        </article>
                      ))}
                    </div>
                  )}

                  {activeModule === "reductions" && (
                    <div className="space-y-3">
                      {snapshot.reductions.length === 0 && <p className="text-sm text-ink-dim">{copy.noReductionApplied}</p>}
                      {snapshot.reductions.map((reduction) => (
                        <article key={reduction.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{reduction.title}</p>
                              <p className="mt-1 text-sm text-ink-dim">{reduction.studentName || copy.parentAccount}</p>
                            </div>
                            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">{money.format(reduction.amount)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {activeModule === "agreements" && (
                    <div className="space-y-3">
                      {snapshot.agreements.length === 0 && <p className="text-sm text-ink-dim">{copy.noAgreement}</p>}
                      {snapshot.agreements.map((agreement) => (
                        <article key={agreement.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{agreement.title}</p>
                              <p className="mt-1 text-sm text-ink-dim">{copy.remainingBalance}: {money.format(agreement.balanceDue)}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone(agreement.status)}`}>{statusLabel(agreement.status, copy)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {activeModule === "payments" && (
                    <div className="space-y-3">
                      {(!snapshot.paymentHistory || snapshot.paymentHistory.length === 0) && <p className="text-sm text-ink-dim">{copy.noHistoricalPayment}</p>}
                      {(snapshot.paymentHistory ?? []).map((payment) => (
                        <article key={payment.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{payment.reason}</p>
                              <p className="mt-1 text-xs text-ink-dim">{payment.transactionNumber} · {new Date(payment.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
                              <p className="mt-2 text-xs text-cyan-200">{payment.students.map((student) => student.fullName).join(", ") || copy.noLinkedStudent}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-lg font-bold text-emerald-300">{money.format(payment.amount)}</p>
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone(payment.status)}`}>{statusLabel(payment.status, copy)}</span>
                            </div>
                          </div>
                          <AllocationTraceBlock trace={payment.allocationTrace} money={money} lang={lang} />
                        </article>
                      ))}
                    </div>
                  )}
                </AdminParentDialog>
              )}

              {activeAction === "assignment" && (
                <AdminParentDialog
                  title={copy.assignPlanTitle}
                  subtitle={formatCopy(copy.assignmentSubtitleFor, { name: snapshot.parent.fullName })}
                  onClose={() => setActiveAction(null)}
                  copy={copy}
                >
                  <div className="mx-auto max-w-4xl space-y-5">
                    <div className="rounded-2xl border border-brand-300/20 bg-brand-500/10 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-100">{copy.selectedParent}</p>
                      <h3 className="mt-2 font-display text-2xl font-bold text-white">{snapshot.parent.fullName}</h3>
                      <p className="mt-1 text-sm text-ink-dim">
                        {copy.currentActivePlan}: <span className="font-semibold text-cyan-100">{snapshot.profile.activeTuitionPlan}</span>
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.studentTarget}</label>
                        <select
                          value={assignmentForm.studentId}
                          onChange={(event) => setAssignmentForm((current) => ({ ...current, studentId: event.target.value }))}
                          className="w-full"
                        >
                          <option value="">{copy.allParentStudents}</option>
                          {availableStudents.map((student) => (
                            <option key={student.id} value={student.id}>{student.fullName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.paymentOption}</label>
                        <select
                          value={assignmentForm.paymentOptionType}
                          onChange={(event) => setAssignmentForm((current) => ({ ...current, paymentOptionType: event.target.value }))}
                          className="w-full"
                        >
                          {paymentOptionChoices.map((option) => (
                            <option key={option.value} value={option.value}>{copy[option.labelKey]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.notes}</label>
                      <textarea
                        value={assignmentForm.notes}
                        onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                        className="h-32 w-full resize-none"
                        placeholder={copy.assignmentNotesPlaceholder}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-5">
                      <button
                        type="button"
                        onClick={() => setActiveAction(null)}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-ink-dim transition-all hover:border-white/20 hover:text-white"
                      >
                        {copy.close}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitAssignment()}
                        disabled={assignmentSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-brand-700 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {assignmentSubmitting ? copy.assigning : copy.assignPlanButton}
                      </button>
                    </div>
                  </div>
                </AdminParentDialog>
              )}

              {activeAction === "agreement" && (
                <AdminParentDialog
                  title={copy.createAgreementTitle}
                  subtitle={formatCopy(copy.agreementSubtitleFor, { name: snapshot.parent.fullName })}
                  onClose={() => setActiveAction(null)}
                  copy={copy}
                >
                  <div className="mx-auto max-w-5xl space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.studentTarget}</label>
                        <select
                          value={agreementForm.studentId}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, studentId: event.target.value }))}
                          className="w-full"
                        >
                          <option value="">{copy.allParentStudents}</option>
                          {availableStudents.map((student) => (
                            <option key={student.id} value={student.id}>{student.fullName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.status}</label>
                        <select
                          value={agreementForm.status}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, status: event.target.value }))}
                          className="w-full"
                        >
                          {agreementStatusChoices.map((status) => <option key={status} value={status}>{statusLabel(status, copy)}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.title}</label>
                        <input
                          value={agreementForm.title}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, title: event.target.value }))}
                          className="w-full"
                          placeholder={copy.agreementTitlePlaceholder}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.customTotal}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={agreementForm.customTotal}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, customTotal: event.target.value }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.reductionAmount}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={agreementForm.reductionAmount}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, reductionAmount: event.target.value }))}
                          className="w-full"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.gradeGroup}</label>
                        <select
                          value={agreementForm.gradeGroup}
                          onChange={(event) => setAgreementForm((current) => ({ ...current, gradeGroup: event.target.value }))}
                          className="w-full"
                        >
                          {gradeGroupChoices.map((option) => <option key={option.value} value={option.value}>{copy[option.labelKey]}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{copy.installments}</p>
                        <button
                          type="button"
                          onClick={() => setAgreementForm((current) => ({ ...current, installments: [...current.installments, emptyInstallment()] }))}
                          className="inline-flex items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-200"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {copy.addInstallment}
                        </button>
                      </div>
                      {agreementForm.installments.map((installment, index) => (
                        <div key={`installment-dialog-${index}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <input
                              value={installment.label}
                              onChange={(event) => setAgreementForm((current) => ({
                                ...current,
                                installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row)
                              }))}
                              className="w-full"
                              placeholder={copy.label}
                            />
                            <input
                              type="date"
                              value={installment.dueDate}
                              onChange={(event) => setAgreementForm((current) => ({
                                ...current,
                                installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, dueDate: event.target.value } : row)
                              }))}
                              className="w-full"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={installment.amountDue}
                              onChange={(event) => setAgreementForm((current) => ({
                                ...current,
                                installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, amountDue: event.target.value } : row)
                              }))}
                              className="w-full"
                              placeholder={copy.amountDue}
                            />
                          </div>
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                              value={installment.notes}
                              onChange={(event) => setAgreementForm((current) => ({
                                ...current,
                                installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row)
                              }))}
                              className="w-full"
                              placeholder={copy.installmentNotesPlaceholder}
                            />
                            {agreementForm.installments.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setAgreementForm((current) => ({
                                  ...current,
                                  installments: current.installments.filter((_row, rowIndex) => rowIndex !== index)
                                }))}
                                className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
                              >
                                {copy.remove}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <textarea
                        value={agreementForm.notes}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, notes: event.target.value }))}
                        className="h-24 w-full resize-none"
                        placeholder={copy.publicNotesPlaceholder}
                      />
                      <textarea
                        value={agreementForm.privateNotes}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, privateNotes: event.target.value }))}
                        className="h-24 w-full resize-none"
                        placeholder={copy.privateNotesPlaceholder}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-5">
                      <button
                        type="button"
                        onClick={() => setActiveAction(null)}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-ink-dim transition-all hover:border-white/20 hover:text-white"
                      >
                        {copy.close}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitAgreement()}
                        disabled={agreementSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {agreementSubmitting ? copy.creating : copy.saveAgreement}
                      </button>
                    </div>
                  </div>
                </AdminParentDialog>
              )}

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">{copy.studentsAssignedPlans}</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.students.map((student) => (
                        <div key={student.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{student.fullName}</p>
                              <p className="mt-1 text-xs text-ink-dim">{student.className || copy.classMissing} · {student.planName}</p>
                              <p className="mt-2 text-xs text-cyan-200">{student.paymentOptionLabel}</p>
                            </div>
                            <div className="text-right text-sm">
                              <p className="font-mono text-emerald-300">{money.format(student.paid)}</p>
                              <p className="font-mono text-red-300">{money.format(student.balance)}</p>
                            </div>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${Math.max(0, Math.min(100, student.completionRate))}%` }} />
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-ink-dim">
                            <span>{formatCopy(copy.coverageText, { rate: student.completionRate.toFixed(1) })}</span>
                            <span>{formatCopy(copy.overdueInstallments, { count: student.overdueInstallments })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">{copy.alertsAndDebts}</h3>
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        {snapshot.alerts.length === 0 && <p className="text-sm text-ink-dim">{copy.noAlert}</p>}
                        {snapshot.alerts.map((alert) => (
                          <div key={alert.id} className={`rounded-2xl border p-4 ${tone(alert.severity)}`}>
                            <p className="font-semibold text-white">{alert.title}</p>
                            <p className="mt-1 text-sm opacity-90">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        {snapshot.debts.length === 0 && <p className="text-sm text-ink-dim">{copy.noActiveDebt}</p>}
                        {snapshot.debts.map((debt) => (
                          <div key={debt.id} className={`rounded-2xl border p-4 ${tone(debt.status)}`}>
                            <p className="font-semibold text-white">{debt.title}</p>
                            <p className="mt-1 text-sm opacity-90">{formatCopy(copy.remaining, { amount: money.format(debt.amountRemaining) })}</p>
                            {debt.carriedOverFromYearId && <p className="mt-1 text-xs opacity-80">{formatCopy(copy.carryOverFrom, { year: debt.carriedOverFromYearId })}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">{copy.reductionsTitle}</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.reductions.length === 0 && <p className="text-sm text-ink-dim">{copy.noReductionTracked}</p>}
                      {snapshot.reductions.map((reduction) => (
                        <div key={reduction.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{reduction.title}</p>
                              <p className="mt-1 text-xs text-ink-dim">{reduction.studentName || snapshot.parent.fullName}</p>
                            </div>
                            <span className="font-mono font-semibold text-cyan-200">{money.format(reduction.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">{copy.specialAgreements}</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.agreements.length === 0 && <p className="text-sm text-ink-dim">{copy.noAgreement}</p>}
                      {snapshot.agreements.map((agreement) => (
                        <div key={agreement.id} className={`rounded-2xl border p-4 ${tone(agreement.status)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{agreement.title}</p>
                              <p className="mt-1 text-sm opacity-90">{formatCopy(copy.balanceDue, { amount: money.format(agreement.balanceDue) })}</p>
                            </div>
                            <span className="text-xs font-bold uppercase tracking-[0.16em]">{statusLabel(agreement.status, copy)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="card glass border border-white/10 shadow-lg">
              <p className="text-sm text-ink-dim">{copy.selectParentPrompt}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
