import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileClock,
  HandCoins,
  Plus,
  Save,
  Search,
  ShieldAlert,
  UserRound,
  WalletCards
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
  debts: Array<{ id: string; title: string; amountRemaining: number; status: string; carriedOverFromYearId?: string | null }>;
  agreements: Array<{ id: string; title: string; status: string; balanceDue: number }>;
  alerts: Array<{ id: string; title: string; message: string; severity: string }>;
};

type AgreementInstallmentForm = {
  label: string;
  dueDate: string;
  amountDue: string;
  notes: string;
};

const paymentOptionChoices = [
  { value: "FULL_PRESEPTEMBER", label: "Full payment before September" },
  { value: "TWO_INSTALLMENTS", label: "Two-installment payment" },
  { value: "THREE_INSTALLMENTS", label: "Three-installment payment" },
  { value: "STANDARD_MONTHLY", label: "Standard monthly payment" }
];

const gradeGroupChoices = [
  { value: "K", label: "K (K3-K5)" },
  { value: "GRADE_1_5", label: "Grades 1-5" },
  { value: "GRADE_6_8", label: "Grades 6-8" },
  { value: "GRADE_9_12", label: "Grades 9-12" },
  { value: "CUSTOM", label: "Custom" }
];

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

export function FinanceParentAdminPage() {
  const { lang } = useI18n();
  const [parents, setParents] = useState<Parent[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le profil financier parent.");
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
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger les donnees finance.");
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
    { label: "Paid", value: money.format(snapshot.profile.totalPaid), color: "text-emerald-300", Icon: WalletCards },
    { label: "Debt", value: money.format(snapshot.profile.totalDebt), color: "text-red-300", Icon: AlertTriangle },
    { label: "Reductions", value: money.format(snapshot.profile.totalReduction), color: "text-cyan-300", Icon: HandCoins },
    { label: "Carry-over", value: money.format(snapshot.profile.carriedOverDebt), color: "text-amber-300", Icon: FileClock },
    { label: "Overdue", value: String(snapshot.profile.overdueInstallments), color: "text-orange-300", Icon: ShieldAlert }
  ] : [];

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
      setSuccess("Plan officiel affecte avec succes.");
      await loadSnapshot(selectedParent.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible d'affecter le plan officiel.");
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
      setError("Completez le titre, le total et au moins une echeance valide pour l'accord special.");
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
      setSuccess("Accord special enregistre avec succes.");
      await loadSnapshot(selectedParent.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible de creer l'accord special.");
    } finally {
      setAgreementSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-brand-500/30" />
          <p className="text-sm font-semibold text-ink-dim">Chargement du suivi parent financier...</p>
        </div>
      </div>
    );
  }

  if (!parents.length) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="glass max-w-lg rounded-2xl border border-amber-500/20 p-8 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Parent finance</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Aucun parent disponible</h1>
          <p className="mt-3 text-sm text-ink-dim">{error ?? "Ajoutez un parent pour activer le suivi financier detaille."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 overflow-hidden pb-10 animate-fadeInUp">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-300">Administration financiere</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">Inspection detaillee des comptes parents</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          Lecture parent par parent du plan actif, des reductions, des dettes historiques, des alertes et des accords speciaux du proprietaire.
        </p>
      </div>

      {success && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>}
      {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="card glass border border-brand-500/10 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un parent, telephone, email..."
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
              <p className="text-sm text-ink-dim">Chargement du profil financier...</p>
            </div>
          ) : snapshot ? (
            <>
              <div className="card glass border border-cyan-500/10 shadow-lg">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-200">
                        <UserRound className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl font-bold text-white">{snapshot.parent.fullName}</h2>
                        <p className="text-sm text-ink-dim">{snapshot.parent.phone || "Telephone non renseigne"} · {snapshot.parent.email || "Email non renseigne"}</p>
                      </div>
                    </div>
                    <p className="mt-4 max-w-2xl text-sm text-ink-dim">Plan actif: {snapshot.profile.activeTuitionPlan}</p>
                    <p className="mt-2 text-xs text-cyan-200">{matchingPlanCount} variantes officielles chargees dans le catalogue finance.</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-6 w-6 text-cyan-300" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Behavior score</p>
                        <p className="font-mono text-2xl font-black text-white">{snapshot.profile.paymentBehaviorScore.toFixed(0)}%</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-cyan-200">Completion {snapshot.profile.completionRate.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {summaryCards.map(({ label, value, color, Icon }) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">{label}</p>
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <p className={`mt-2 font-mono text-lg font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="card glass border border-white/10 shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold text-white">Assign official tuition plan</h3>
                      <p className="mt-1 text-sm text-ink-dim">Affecte un des plans KCS officiels au parent ou a un eleve cible.</p>
                    </div>
                    <Save className="h-5 w-5 text-brand-200" />
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Student target</label>
                      <select
                        value={assignmentForm.studentId}
                        onChange={(event) => setAssignmentForm((current) => ({ ...current, studentId: event.target.value }))}
                        className="w-full"
                      >
                        <option value="">Tous les eleves du parent</option>
                        {availableStudents.map((student) => (
                          <option key={student.id} value={student.id}>{student.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Payment option</label>
                      <select
                        value={assignmentForm.paymentOptionType}
                        onChange={(event) => setAssignmentForm((current) => ({ ...current, paymentOptionType: event.target.value }))}
                        className="w-full"
                      >
                        {paymentOptionChoices.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Notes</label>
                    <textarea
                      value={assignmentForm.notes}
                      onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                      className="h-28 w-full resize-none"
                      placeholder="Notes d'affectation, justification, commentaire administratif..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitAssignment()}
                    disabled={assignmentSubmitting}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {assignmentSubmitting ? "Affectation..." : "Affecter le plan officiel"}
                  </button>
                </div>

                <div className="card glass border border-white/10 shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold text-white">Create owner agreement</h3>
                      <p className="mt-1 text-sm text-ink-dim">Structure independante avec echeances flexibles, reductions et notes privees.</p>
                    </div>
                    <HandCoins className="h-5 w-5 text-amber-300" />
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Student target</label>
                      <select
                        value={agreementForm.studentId}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, studentId: event.target.value }))}
                        className="w-full"
                      >
                        <option value="">Tous les eleves du parent</option>
                        {availableStudents.map((student) => (
                          <option key={student.id} value={student.id}>{student.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Status</label>
                      <select
                        value={agreementForm.status}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, status: event.target.value }))}
                        className="w-full"
                      >
                        {agreementStatusChoices.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Title</label>
                      <input
                        value={agreementForm.title}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, title: event.target.value }))}
                        className="w-full"
                        placeholder="Owner agreement title"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Custom total</label>
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
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Reduction amount</label>
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
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Grade group</label>
                      <select
                        value={agreementForm.gradeGroup}
                        onChange={(event) => setAgreementForm((current) => ({ ...current, gradeGroup: event.target.value }))}
                        className="w-full"
                      >
                        {gradeGroupChoices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-dim">Installments</p>
                      <button
                        type="button"
                        onClick={() => setAgreementForm((current) => ({ ...current, installments: [...current.installments, emptyInstallment()] }))}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-200"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ajouter une echeance
                      </button>
                    </div>
                    {agreementForm.installments.map((installment, index) => (
                      <div key={`installment-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <input
                            value={installment.label}
                            onChange={(event) => setAgreementForm((current) => ({
                              ...current,
                              installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row)
                            }))}
                            className="w-full"
                            placeholder="Label"
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
                            placeholder="Amount due"
                          />
                        </div>
                        <div className="mt-3 flex gap-3">
                          <input
                            value={installment.notes}
                            onChange={(event) => setAgreementForm((current) => ({
                              ...current,
                              installments: current.installments.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row)
                            }))}
                            className="w-full"
                            placeholder="Notes internes pour cette echeance"
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
                              Retirer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <textarea
                      value={agreementForm.notes}
                      onChange={(event) => setAgreementForm((current) => ({ ...current, notes: event.target.value }))}
                      className="h-24 w-full resize-none"
                      placeholder="Notes visibles pour le dossier financier"
                    />
                    <textarea
                      value={agreementForm.privateNotes}
                      onChange={(event) => setAgreementForm((current) => ({ ...current, privateNotes: event.target.value }))}
                      className="h-24 w-full resize-none"
                      placeholder="Notes privees du proprietaire / direction"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void submitAgreement()}
                    disabled={agreementSubmitting}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-amber-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {agreementSubmitting ? "Creation..." : "Enregistrer l'accord special"}
                  </button>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">Students and assigned plans</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.students.map((student) => (
                        <div key={student.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{student.fullName}</p>
                              <p className="mt-1 text-xs text-ink-dim">{student.className || "Classe non renseignee"} · {student.planName}</p>
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
                            <span>{student.completionRate.toFixed(1)}% covered</span>
                            <span>{student.overdueInstallments} overdue installment(s)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">Alerts and debts</h3>
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        {snapshot.alerts.length === 0 && <p className="text-sm text-ink-dim">Aucune alerte.</p>}
                        {snapshot.alerts.map((alert) => (
                          <div key={alert.id} className={`rounded-2xl border p-4 ${tone(alert.severity)}`}>
                            <p className="font-semibold text-white">{alert.title}</p>
                            <p className="mt-1 text-sm opacity-90">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        {snapshot.debts.length === 0 && <p className="text-sm text-ink-dim">Aucune dette active.</p>}
                        {snapshot.debts.map((debt) => (
                          <div key={debt.id} className={`rounded-2xl border p-4 ${tone(debt.status)}`}>
                            <p className="font-semibold text-white">{debt.title}</p>
                            <p className="mt-1 text-sm opacity-90">Remaining {money.format(debt.amountRemaining)}</p>
                            {debt.carriedOverFromYearId && <p className="mt-1 text-xs opacity-80">Carry-over from {debt.carriedOverFromYearId}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="card glass border border-white/10 shadow-lg">
                    <h3 className="font-display text-xl font-bold text-white">Reductions</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.reductions.length === 0 && <p className="text-sm text-ink-dim">Aucune reduction tracee.</p>}
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
                    <h3 className="font-display text-xl font-bold text-white">Special agreements</h3>
                    <div className="mt-5 space-y-3">
                      {snapshot.agreements.length === 0 && <p className="text-sm text-ink-dim">Aucun accord special.</p>}
                      {snapshot.agreements.map((agreement) => (
                        <div key={agreement.id} className={`rounded-2xl border p-4 ${tone(agreement.status)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{agreement.title}</p>
                              <p className="mt-1 text-sm opacity-90">Balance due {money.format(agreement.balanceDue)}</p>
                            </div>
                            <span className="text-xs font-bold uppercase tracking-[0.16em]">{agreement.status}</span>
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
              <p className="text-sm text-ink-dim">Selectionnez un parent pour afficher son profil financier detaille.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}