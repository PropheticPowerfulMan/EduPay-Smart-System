import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleDollarSign, MailCheck, MessageSquareText, ShieldAlert, WalletCards } from "lucide-react";
import { api } from "../services/api";

type EmployeeRepayment = {
  id: string;
  method: string;
  expectedAmount: number;
  paidAmount: number;
  currency: string;
  dueDate: string;
  paidAt?: string | null;
  status: string;
  reference?: string | null;
  notes?: string | null;
};

type EmployeeObligation = {
  id: string;
  type: string;
  title: string;
  principalAmount: number;
  amountPaid: number;
  balance: number;
  currency: string;
  repaymentMethod: string;
  installmentAmount: number;
  startDate: string;
  dueDate: string;
  status: string;
  riskLevel: string;
  riskScore: number;
  notes?: string | null;
  repayments: EmployeeRepayment[];
};

type EmployeeFinanceSnapshot = {
  profile: {
    employeeCode: string;
    fullName: string;
    department: string;
    position: string;
    baseSalary: number;
    currency: string;
    frequency: string;
    deductionMode?: string;
    maxDeductionRate?: number;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  obligations: EmployeeObligation[];
  payrollRecords: Array<{
    id: string;
    netSalary: number;
    advancesRecovered: number;
    debtRecovered: number;
    salarySlipNumber?: string | null;
    payrollRun: { title: string; processedAt?: string | null; period?: { name: string } | null };
  }>;
  salaryProjection: {
    mode: string;
    baseSalary: number;
    bonuses: number;
    deductions: number;
    advancesRecovered: number;
    debtRecovered: number;
    totalDeductions: number;
    grossSalary: number;
    netSalary: number;
    salaryPressure: number;
    maxDeductionRate: number;
    deductionCeiling: number;
    deferredRepayments: Array<{ repaymentId: string; obligationId: string; amount: number; reason: string; dueDate?: string | null }>;
    recommendation: string;
    riskLevel: string;
  };
  communicationHistory: Array<{
    id: string;
    channel: string;
    subject?: string | null;
    content: string;
    status: string;
    createdAt: string;
  }>;
  totals: {
    totalPrincipal: number;
    totalPaid: number;
    totalBalance: number;
    salaryAdvanceBalance: number;
    schoolDebtBalance: number;
    overdueAmount: number;
    overdueCount: number;
    nextRepaymentAmount: number;
    nextRepaymentDueDate: string | null;
    salaryPressure: number;
  };
  intelligence: {
    riskLevel: string;
    recommendation: string;
    salaryProtectionFloor: number;
  };
};

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "Non defini";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non defini";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function typeLabel(value: string) {
  if (value === "SALARY_ADVANCE") return "Avance sur salaire";
  if (value === "SCHOOL_DEBT") return "Dette envers l'ecole";
  return "Autre engagement";
}

function methodLabel(value: string) {
  if (value === "SALARY_DEDUCTION") return "Deduction salaire";
  if (value === "EXTERNAL_PAYMENT") return "Paiement hors salaire";
  return "Mixte";
}

function modeLabel(value?: string) {
  if (value === "MANUAL") return "Manuel";
  if (value === "HYBRID") return "Hybride";
  return "Automatique";
}

export function EmployeeFinancePage() {
  const [snapshot, setSnapshot] = useState<EmployeeFinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    setLoading(true);
    setError(null);
    void api<EmployeeFinanceSnapshot>(`/api/expenses/employee-finance/me${params.toString() ? `?${params.toString()}` : ""}`)
      .then(setSnapshot)
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger votre situation financiere."))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const currency = snapshot?.profile.currency ?? "USD";
  const filteredObligations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return snapshot?.obligations ?? [];
    return (snapshot?.obligations ?? []).filter((item) => [
      item.title,
      typeLabel(item.type),
      methodLabel(item.repaymentMethod),
      item.status,
      item.notes ?? ""
    ].join(" ").toLowerCase().includes(term));
  }, [snapshot, query]);

  if (loading && !snapshot) {
    return <div className="glass rounded-2xl p-6 text-sm text-ink-dim">Chargement de votre dashboard financier...</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">{error}</div>;
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Espace employe</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">{snapshot.profile.fullName}</h1>
            <p className="mt-2 text-sm text-ink-dim">{snapshot.profile.employeeCode} - {snapshot.profile.position} - {snapshot.profile.department}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-11" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-11" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Recherche precise..." className="h-11" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Salaire mensuel", value: money(snapshot.salaryProjection.grossSalary, currency), sub: modeLabel(snapshot.salaryProjection.mode), icon: WalletCards, color: "text-white" },
          { label: "Net previsionnel", value: money(snapshot.salaryProjection.netSalary, currency), sub: `${snapshot.salaryProjection.salaryPressure.toFixed(1)}% deduit`, icon: CircleDollarSign, color: "text-emerald-300" },
          { label: "Deductions mois", value: money(snapshot.salaryProjection.totalDeductions, currency), sub: `Plafond ${snapshot.salaryProjection.maxDeductionRate.toFixed(0)}%`, icon: ShieldAlert, color: "text-amber-300" },
          { label: "Transparence", value: `${snapshot.communicationHistory.length} avis`, sub: "SMS / email / dashboard", icon: MailCheck, color: "text-cyan-300" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <card.icon className={`h-5 w-5 ${card.color}`} />
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink-dim">{card.label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{card.value}</p>
            <p className="mt-1 text-xs text-ink-dim">{card.sub}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Solde total", value: money(snapshot.totals.totalBalance, currency), icon: WalletCards, color: "text-cyan-300" },
          { label: "Avances", value: money(snapshot.totals.salaryAdvanceBalance, currency), icon: CircleDollarSign, color: "text-emerald-300" },
          { label: "Dettes ecole", value: money(snapshot.totals.schoolDebtBalance, currency), icon: ShieldAlert, color: "text-amber-300" },
          { label: "Prochaine echeance", value: money(snapshot.totals.nextRepaymentAmount, currency), sub: dateLabel(snapshot.totals.nextRepaymentDueDate), icon: CalendarClock, color: "text-brand-200" }
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <card.icon className={`h-5 w-5 ${card.color}`} />
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink-dim">{card.label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{card.value}</p>
            {"sub" in card ? <p className="mt-1 text-xs text-ink-dim">{card.sub}</p> : null}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Analyse intelligente</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Risque {snapshot.intelligence.riskLevel}</h2>
          </div>
          <span className="rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">
            Pression salaire: {snapshot.totals.salaryPressure.toFixed(1)}%
          </span>
        </div>
        <p className="mt-3 text-sm text-ink-dim">{snapshot.intelligence.recommendation}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Avances recuperees ce mois</p>
            <p className="mt-2 text-lg font-semibold text-cyan-300">{money(snapshot.salaryProjection.advancesRecovered, currency)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Dettes recuperees ce mois</p>
            <p className="mt-2 text-lg font-semibold text-amber-300">{money(snapshot.salaryProjection.debtRecovered, currency)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Reports intelligents</p>
            <p className="mt-2 text-lg font-semibold text-white">{snapshot.salaryProjection.deferredRepayments.length}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10">
        <div className="border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Notifications administratives</h2>
        </div>
        <div className="divide-y divide-white/5">
          {snapshot.communicationHistory.slice(0, 6).map((message) => (
            <div key={message.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <MessageSquareText className="mt-1 h-4 w-4 text-brand-200" />
                <div>
                  <p className="font-medium text-white">{message.subject || message.channel}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-dim">{message.content}</p>
                </div>
              </div>
              <div className="text-xs text-ink-dim sm:text-right">
                <p>{message.channel} - {message.status}</p>
                <p>{dateLabel(message.createdAt)}</p>
              </div>
            </div>
          ))}
          {snapshot.communicationHistory.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-dim">Aucune notification administrative n'a encore ete publiee.</div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10">
        <div className="border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Engagements et echeances</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-[0.14em] text-ink-dim">
              <tr>
                <th className="px-4 py-3">Engagement</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Solde</th>
                <th className="px-4 py-3">Echeance</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredObligations.map((item) => (
                <tr key={item.id} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-ink-dim">{typeLabel(item.type)} - risque {item.riskLevel}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{methodLabel(item.repaymentMethod)}</td>
                  <td className="px-4 py-3 font-semibold text-white">{money(item.balance, item.currency)}</td>
                  <td className="px-4 py-3 text-ink-dim">{dateLabel(item.dueDate)}</td>
                  <td className="px-4 py-3 text-ink-dim">{item.status}</td>
                </tr>
              ))}
              {filteredObligations.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-dim">Aucun engagement trouve pour cette recherche.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
