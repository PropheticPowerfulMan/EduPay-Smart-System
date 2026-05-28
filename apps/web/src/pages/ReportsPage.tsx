import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Download, FileSpreadsheet, Landmark, Printer, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { schoolBranding } from "../config/branding";
import { api } from "../services/api";
import { exportWorkbook } from "../utils/financeExcel";
import { printHtmlDocument } from "../utils/printDocument";

type FinanceOverviewResponse = {
  academicYear: { id: string; name: string; startDate: string; endDate: string };
  totalRevenue: number;
  expectedRevenue: number;
  collectedRevenue: number;
  totalDebt: number;
  paymentSuccessRate: number;
};

type ExpenseOverviewResponse = {
  expenses: {
    totalExpenses: number;
    approvedExpenses: number;
    pendingExpenses: number;
    rejectedExpenses: number;
    pendingApprovalSteps: number;
  };
  payroll: {
    activeProfiles: number;
    runCount: number;
    totalPayroll: number;
    salaryLiability: number;
  };
  cashflow: {
    availableCash: number;
    operationalBalance: number;
    profitLoss: number;
  };
  liabilities: {
    supplierDebt: number;
    payrollLiability: number;
    institutionalObligations: number;
  };
  budgets: Array<{
    id: string;
    name: string;
    department: string;
    plannedAmount: number;
    consumedAmount: number;
    remainingAmount: number;
    utilization: number;
    status: string;
    periodName: string;
    categoryName: string | null;
  }>;
  budgetAlerts: Array<{
    id: string;
    name: string;
    department: string;
    plannedAmount: number;
    consumedAmount: number;
    remainingAmount: number;
    utilization: number;
    status: string;
    periodName: string;
    categoryName: string | null;
  }>;
  departmentSpending: Array<{ department: string; total: number }>;
  monthlyPerformance: Array<{ period: string; revenue: number; expenses: number; profitLoss: number }>;
};

type AccountingEntry = {
  id: string;
  entryType: string;
  direction: string;
  title: string;
  amount: number;
  currency: string;
  entryDate: string;
  department?: string | null;
  expense?: { title: string } | null;
  payrollRun?: { title: string } | null;
  payrollItem?: { salarySlipNumber?: string | null } | null;
};

type CashflowEntry = {
  id: string;
  sourceType: string;
  direction: string;
  amount: number;
  currency: string;
  method?: string | null;
  referenceDate: string;
  notes?: string | null;
  expense?: { title: string } | null;
  payrollRun?: { title: string } | null;
  payrollItem?: { salarySlipNumber?: string | null } | null;
};

type PayrollRun = {
  id: string;
  title: string;
  department?: string;
  frequency: string;
  status: string;
  totalNet: number;
  totalDeductions: number;
  processedAt: string | null;
  period?: { id: string; name: string } | null;
  items: Array<{ id: string; salarySlipNumber: string; netSalary: number; salaryProfile: { fullName: string; employeeCode: string } }>;
};

function plainPrintText(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card glass border border-white/10 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ReportsPage() {
  const currency = useMemo(() => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }), []);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverviewResponse | null>(null);
  const [expenseOverview, setExpenseOverview] = useState<ExpenseOverviewResponse | null>(null);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [cashflowEntries, setCashflowEntries] = useState<CashflowEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api<FinanceOverviewResponse>("/api/finance/overview"),
      api<ExpenseOverviewResponse>("/api/expenses/overview")
    ])
      .then(([nextFinanceOverview, nextExpenseOverview]) => {
        if (!active) return;
        setFinanceOverview(nextFinanceOverview);
        setExpenseOverview(nextExpenseOverview);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger les rapports exécutifs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    Promise.allSettled([
      api<AccountingEntry[]>("/api/expenses/accounting-entries"),
      api<CashflowEntry[]>("/api/expenses/cashflow-entries"),
      api<PayrollRun[]>("/api/expenses/payroll/runs")
    ]).then((results) => {
      if (!active) return;

      const [accountingResult, cashflowResult, payrollResult] = results;

      if (accountingResult.status === "fulfilled") {
        setAccountingEntries(accountingResult.value);
      }
      if (cashflowResult.status === "fulfilled") {
        setCashflowEntries(cashflowResult.value);
      }
      if (payrollResult.status === "fulfilled") {
        setPayrollRuns(payrollResult.value);
      }

      setDetailsError(results.some((result) => result.status === "rejected")
        ? "Certaines listes détaillées restent en cours de récupération ou indisponibles temporairement."
        : null);
      setDetailsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const reportNeedle = reportSearch.trim().toLowerCase();
  const matchesReportSearch = (values: Array<string | number | null | undefined>) => !reportNeedle
    || values.some((value) => String(value ?? "").toLowerCase().includes(reportNeedle));
  const filteredBudgets = expenseOverview?.budgets.filter((budget) => matchesReportSearch([
    budget.name, budget.department, budget.categoryName, budget.periodName, budget.status, budget.utilization
  ])) ?? [];
  const filteredBudgetAlerts = expenseOverview?.budgetAlerts.filter((budget) => matchesReportSearch([
    budget.name, budget.department, budget.categoryName, budget.periodName, budget.status, budget.utilization
  ])) ?? [];
  const filteredDepartmentSpending = expenseOverview?.departmentSpending.filter((row) => matchesReportSearch([row.department, row.total])) ?? [];
  const filteredAccountingEntries = accountingEntries.filter((entry) => matchesReportSearch([
    entry.title, entry.entryType, entry.direction, entry.department, entry.currency, entry.amount,
    entry.expense?.title, entry.payrollRun?.title, entry.payrollItem?.salarySlipNumber
  ]));
  const filteredCashflowEntries = cashflowEntries.filter((entry) => matchesReportSearch([
    entry.sourceType, entry.direction, entry.method, entry.currency, entry.amount, entry.notes,
    entry.expense?.title, entry.payrollRun?.title, entry.payrollItem?.salarySlipNumber
  ]));
  const filteredPayrollRuns = payrollRuns.filter((run) => matchesReportSearch([
    run.title, run.department, run.frequency, run.status, run.period?.name, run.totalNet
  ]));
  const accountingTotal = filteredAccountingEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const cashflowTotal = filteredCashflowEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const payrollTotal = filteredPayrollRuns.reduce((sum, run) => sum + run.totalNet, 0);
  const budgetConsumedTotal = filteredBudgets.reduce((sum, budget) => sum + budget.consumedAmount, 0);
  const budgetPlannedTotal = filteredBudgets.reduce((sum, budget) => sum + budget.plannedAmount, 0);
  const budgetUtilization = budgetPlannedTotal > 0 ? (budgetConsumedTotal / budgetPlannedTotal) * 100 : 0;
  const collectionRate = financeOverview && financeOverview.expectedRevenue > 0
    ? (financeOverview.collectedRevenue / financeOverview.expectedRevenue) * 100
    : 0;
  const expenseToRevenueRate = financeOverview && financeOverview.collectedRevenue > 0
    ? ((expenseOverview?.expenses.totalExpenses ?? 0) / financeOverview.collectedRevenue) * 100
    : 0;
  const executiveSignals = [
    financeOverview && financeOverview.totalDebt > 0 ? `Recouvrement a renforcer : ${currency.format(financeOverview.totalDebt)} reste a encaisser.` : "Recouvrement stable : aucune dette globale critique visible.",
    budgetUtilization >= 90 ? `Budgets sous tension : ${budgetUtilization.toFixed(1)}% consomme sur les lignes filtrees.` : `Budgets maitrises : ${budgetUtilization.toFixed(1)}% consomme sur les lignes filtrees.`,
    expenseToRevenueRate > 100 ? "Les depenses depassent le revenu collecte sur la periode." : `Ratio depenses / revenu collecte : ${expenseToRevenueRate.toFixed(1)}%.`,
    filteredBudgetAlerts.length ? `${filteredBudgetAlerts.length} alerte(s) budgetaire(s) a traiter.` : "Aucune alerte budgetaire ouverte dans le filtre courant."
  ];

  function buildExecutiveReportHtml() {
    if (!financeOverview || !expenseOverview) return "";
    const generatedAt = new Date();
    const logoSrc = plainPrintText(new URL(schoolBranding.logoSrc, window.location.href).toString());
    const rows = [
      ["Exercice", financeOverview.academicYear.name, "Période académique de référence."],
      ["Revenu attendu", currency.format(financeOverview.expectedRevenue), "Montant brut attendu."],
      ["Revenu encaissé", currency.format(financeOverview.collectedRevenue), "Cash réellement capturé."],
      ["Dette globale", currency.format(financeOverview.totalDebt), "Reste à recouvrer."],
      ["Dépenses", currency.format(expenseOverview.expenses.totalExpenses), "Sorties opérationnelles."],
      ["Profit / perte", currency.format(expenseOverview.cashflow.profitLoss), "Résultat financier courant."],
      ["Trésorerie", currency.format(expenseOverview.cashflow.availableCash), "Cash disponible."],
      ["Masse salariale", currency.format(expenseOverview.payroll.totalPayroll), "Paie nette traitée."]
    ];
    const budgetRows = filteredBudgets.slice(0, 30).map((budget) => `<tr><td>${plainPrintText(budget.name)}</td><td>${plainPrintText(budget.department)}</td><td>${plainPrintText(budget.categoryName || "Global")}</td><td>${plainPrintText(currency.format(budget.plannedAmount))}</td><td>${plainPrintText(currency.format(budget.consumedAmount))}</td><td>${budget.utilization.toFixed(1)}%</td><td>${plainPrintText(budget.status)}</td></tr>`).join("");
    const alertRows = filteredBudgetAlerts.slice(0, 20).map((budget) => `<tr><td>${plainPrintText(budget.name)}</td><td>${plainPrintText(budget.department)}</td><td>${plainPrintText(currency.format(budget.remainingAmount))}</td><td>${budget.utilization.toFixed(1)}%</td><td>${plainPrintText(budget.status)}</td></tr>`).join("");
    const accountingRows = filteredAccountingEntries.slice(0, 35).map((entry) => `<tr><td>${plainPrintText(new Date(entry.entryDate).toLocaleDateString("fr-FR"))}</td><td>${plainPrintText(entry.entryType)}</td><td>${plainPrintText(entry.direction)}</td><td>${plainPrintText(entry.title)}</td><td>${plainPrintText(entry.department || "-")}</td><td>${plainPrintText(currency.format(entry.amount))}</td></tr>`).join("");
    const cashRows = filteredCashflowEntries.slice(0, 30).map((entry) => `<tr><td>${plainPrintText(new Date(entry.referenceDate).toLocaleDateString("fr-FR"))}</td><td>${plainPrintText(entry.sourceType)}</td><td>${plainPrintText(entry.direction)}</td><td>${plainPrintText(entry.method || "")}</td><td>${plainPrintText(currency.format(entry.amount))}</td><td>${plainPrintText(entry.notes || "")}</td></tr>`).join("");
    const payrollRows = filteredPayrollRuns.slice(0, 25).map((run) => `<tr><td>${plainPrintText(run.title)}</td><td>${plainPrintText(run.department || "Tous")}</td><td>${plainPrintText(run.period?.name || "-")}</td><td>${plainPrintText(run.status)}</td><td>${plainPrintText(currency.format(run.totalNet))}</td><td>${run.items.length}</td></tr>`).join("");
    const signalRows = executiveSignals.map((signal) => `<li>${plainPrintText(signal)}</li>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Rapport exécutif EduPay</title><style>
      @page{size:A4;margin:12mm}body{font-family:Inter,Arial,sans-serif;color:#0f172a}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${schoolBranding.colors.primary};padding-bottom:12px;margin-bottom:14px}.brand{display:flex;gap:12px;align-items:center}.logo{width:58px;height:58px;object-fit:contain}.kicker{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#64748b}h1{font-size:21px;margin:2px 0}.meta{text-align:right;font-size:11px;color:#475569}.scope,.signals{border:1px solid #cbd5e1;background:#f8fafc;padding:9px 11px;margin:10px 0 14px;font-size:11px}.signals{background:#ecfeff;border-color:#bae6fd}.signals ul{margin:6px 0 0 16px;padding:0}.signals li{margin:3px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.metric{border:1px solid #cbd5e1;padding:8px;background:#fff}.metric b{display:block;font-size:14px;margin-top:3px}.metric small{color:#64748b}table{width:100%;border-collapse:collapse;font-size:9.5px;margin:8px 0 14px;table-layout:fixed}th{background:#0f172a;color:white;text-align:left;padding:6px;border:1px solid #0f172a}td{border:1px solid #cbd5e1;padding:5px;vertical-align:top;word-break:break-word}h2{font-size:13px;margin-top:14px}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}.page-soft{break-inside:avoid}footer{border-top:1px solid #cbd5e1;margin-top:14px;padding-top:8px;font-size:10px;color:#64748b}</style></head><body>
      <header><div class="brand"><img class="logo" src="${logoSrc}" alt="Logo ${plainPrintText(schoolBranding.schoolName)}" /><div><div class="kicker">${plainPrintText(schoolBranding.appName)}</div><h1>Rapport exécutif financier</h1><div>${plainPrintText(schoolBranding.schoolName)}</div></div></div><div class="meta">Document administratif<br/>${plainPrintText(generatedAt.toLocaleString("fr-FR"))}<br/>${plainPrintText(schoolBranding.shortName)}</div></header>
      <div class="scope">Filtre analytique: ${plainPrintText(reportSearch || "Toutes les données")} · Budgets visibles: ${filteredBudgets.length} · Écritures: ${filteredAccountingEntries.length} · Cashflow: ${filteredCashflowEntries.length} · Paie: ${filteredPayrollRuns.length}</div>
      <div class="signals"><strong>Lecture de direction</strong><ul>${signalRows}</ul></div>
      <div class="grid">${rows.map(([label, value, note]) => `<div class="metric"><span>${plainPrintText(label)}</span><b>${plainPrintText(value)}</b><small>${plainPrintText(note)}</small></div>`).join("")}</div>
      <div class="grid"><div class="metric"><span>Taux de collecte</span><b>${collectionRate.toFixed(1)}%</b><small>Collecte / attendu</small></div><div class="metric"><span>Utilisation budgets</span><b>${budgetUtilization.toFixed(1)}%</b><small>${plainPrintText(currency.format(budgetConsumedTotal))} consomme</small></div><div class="metric"><span>Journaux filtres</span><b>${filteredAccountingEntries.length}</b><small>${plainPrintText(currency.format(accountingTotal))}</small></div><div class="metric"><span>Paie filtree</span><b>${plainPrintText(currency.format(payrollTotal))}</b><small>${filteredPayrollRuns.length} run(s)</small></div></div>
      <h2>Synthèse budgétaire filtrée</h2><table><thead><tr><th>Budget</th><th>Département</th><th>Catégorie</th><th>Planifié</th><th>Consommé</th><th>Utilisation</th><th>Statut</th></tr></thead><tbody>${budgetRows || "<tr><td colspan='7'>Aucune ligne budgétaire.</td></tr>"}</tbody></table>
      <div class="two-col"><section class="page-soft"><h2>Alertes budgetaires</h2><table><thead><tr><th>Budget</th><th>Departement</th><th>Reste</th><th>Utilisation</th><th>Statut</th></tr></thead><tbody>${alertRows || "<tr><td colspan='5'>Aucune alerte.</td></tr>"}</tbody></table></section><section class="page-soft"><h2>Paie</h2><table><thead><tr><th>Run</th><th>Departement</th><th>Periode</th><th>Statut</th><th>Net</th><th>Bulletins</th></tr></thead><tbody>${payrollRows || "<tr><td colspan='6'>Aucun run de paie.</td></tr>"}</tbody></table></section></div>
      <h2>Journaux comptables filtres</h2><table><thead><tr><th>Date</th><th>Type</th><th>Direction</th><th>Titre</th><th>Departement</th><th>Montant</th></tr></thead><tbody>${accountingRows || "<tr><td colspan='6'>Aucune ecriture comptable.</td></tr>"}</tbody></table>
      <h2>Trésorerie filtrée</h2><table><thead><tr><th>Date</th><th>Source</th><th>Direction</th><th>Méthode</th><th>Montant</th><th>Notes</th></tr></thead><tbody>${cashRows || "<tr><td colspan='6'>Aucune ligne de trésorerie.</td></tr>"}</tbody></table>
      <footer>Rapport généré depuis EduPay selon la charte administrative ${plainPrintText(schoolBranding.shortName)}. Total cashflow filtre: ${plainPrintText(currency.format(cashflowTotal))}.</footer>
    </body></html>`;
  }

  function printExecutiveReport() {
    const html = buildExecutiveReportHtml();
    if (html) printHtmlDocument(html);
  }

  function exportExecutiveWorkbook() {
    if (!financeOverview || !expenseOverview) return;
    exportWorkbook(`rapport-executif-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Synthèse",
        rows: [
          {
            "Exercice": financeOverview.academicYear.name,
            "Revenu collecté": financeOverview.collectedRevenue,
            "Revenu attendu": financeOverview.expectedRevenue,
            "Dette globale": financeOverview.totalDebt,
            "Dépenses": expenseOverview.expenses.totalExpenses,
            "Profit ou perte": expenseOverview.cashflow.profitLoss,
            "Trésorerie": expenseOverview.cashflow.availableCash,
            "Masse salariale": expenseOverview.payroll.totalPayroll
          }
        ]
      },
      {
        name: "Budgets",
        rows: filteredBudgets.map((budget) => ({
          "Budget": budget.name,
          "Département": budget.department,
          "Catégorie": budget.categoryName || "Global",
          "Planifié": budget.plannedAmount,
          "Consommé": budget.consumedAmount,
          "Reste": budget.remainingAmount,
          "Utilisation %": Number(budget.utilization.toFixed(2)),
          "Statut": budget.status,
          "Période": budget.periodName
        }))
      },
      {
        name: "Diagnostic",
        rows: executiveSignals.map((signal, index) => ({
          "Ordre": index + 1,
          "Signal": signal,
          "Taux de collecte": Number(collectionRate.toFixed(2)),
          "Utilisation budget %": Number(budgetUtilization.toFixed(2)),
          "Depenses sur revenu %": Number(expenseToRevenueRate.toFixed(2)),
          "Cashflow filtre": cashflowTotal,
          "Paie filtree": payrollTotal
        }))
      },
      {
        name: "Alertes budget",
        rows: filteredBudgetAlerts.map((budget) => ({
          "Budget": budget.name,
          "Departement": budget.department,
          "Categorie": budget.categoryName || "Global",
          "Planifie": budget.plannedAmount,
          "Consomme": budget.consumedAmount,
          "Reste": budget.remainingAmount,
          "Utilisation %": Number(budget.utilization.toFixed(2)),
          "Statut": budget.status,
          "Periode": budget.periodName
        }))
      },
      {
        name: "Comptabilité",
        rows: filteredAccountingEntries.map((entry) => ({
          "Date": new Date(entry.entryDate).toLocaleDateString("fr-FR"),
          "Type": entry.entryType,
          "Direction": entry.direction,
          "Titre": entry.title,
          "Département": entry.department || "",
          "Montant": entry.amount,
          "Devise": entry.currency,
          "Source": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || ""
        }))
      },
      {
        name: "Trésorerie",
        rows: filteredCashflowEntries.map((entry) => ({
          "Date": new Date(entry.referenceDate).toLocaleDateString("fr-FR"),
          "Source": entry.sourceType,
          "Direction": entry.direction,
          "Méthode": entry.method || "",
          "Montant": entry.amount,
          "Devise": entry.currency,
          "Référence": entry.expense?.title || entry.payrollRun?.title || entry.payrollItem?.salarySlipNumber || "",
          "Notes": entry.notes || ""
        }))
      },
      {
        name: "Paie",
        rows: filteredPayrollRuns.map((run) => ({
          "Run": run.title,
          "Département": run.department || "Tous",
          "Fréquence": run.frequency,
          "Statut": run.status,
          "Période": run.period?.name || "",
          "Net": run.totalNet,
          "Déductions": run.totalDeductions,
          "Bulletins": run.items.length,
          "Traité le": run.processedAt ? new Date(run.processedAt).toLocaleDateString("fr-FR") : ""
        }))
      }
    ]);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeInUp">
        <section className="card glass overflow-hidden border border-white/10 shadow-xl">
          <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_30%),linear-gradient(135deg,rgba(8,47,73,0.94),rgba(2,6,23,0.98))] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">Rapports exécutifs</p>
            <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Préparation du centre de rapports</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
              Les données principales se préchargent en arrière-plan pour éviter un écran vide trop long à l'ouverture.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                  <div className="mt-4 h-8 w-28 animate-pulse rounded bg-white/10" />
                  <div className="mt-3 h-3 w-32 animate-pulse rounded bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (error || !financeOverview || !expenseOverview) {
    return <div className="card glass border border-red-500/20 p-10 text-sm text-red-200">{error || "Rapports indisponibles."}</div>;
  }

  return (
    <div className="space-y-6">
      {(detailsLoading || detailsError) && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
          {detailsError ?? "Les journaux comptables, la trésorerie et la paie continuent de se charger en arrière-plan."}
        </div>
      )}
      <section className="card glass overflow-hidden border border-white/10 shadow-xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.24),_transparent_30%),linear-gradient(135deg,rgba(8,47,73,0.94),rgba(2,6,23,0.98))] p-6 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">Rapports exécutifs</p>
              <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Centre de pilotage financier visible et exportable</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                Cette vue consolide revenu, budgets, comptabilité, trésorerie et masse salariale. Elle sert de preuve visible dans l'interface et de point d'export Excel.
              </p>
              <input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                placeholder="Recherche rapport: departement, budget, statut, cashflow, paie, montant..."
                className="mt-5 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/40"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={printExecutiveReport} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-400/20">
                <Printer className="h-4 w-4" /> PDF / Imprimer
              </button>
              <button onClick={exportExecutiveWorkbook} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-400/20">
                <FileSpreadsheet className="h-4 w-4" /> Exporter pack Excel
              </button>
              <Link to="/operations" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white hover:border-cyan-300/25 hover:bg-white/[0.1]">
                <ReceiptText className="h-4 w-4" /> Ouvrir les opérations
              </Link>
            </div>
          </div>
          <div className="relative mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Revenu collecté", value: currency.format(financeOverview.collectedRevenue), icon: WalletCards },
              { label: "Dépenses totales", value: currency.format(expenseOverview.expenses.totalExpenses), icon: Landmark },
              { label: "Profit / perte", value: currency.format(expenseOverview.cashflow.profitLoss), icon: TrendingUp },
              { label: "Trésorerie disponible", value: currency.format(expenseOverview.cashflow.availableCash), icon: Download }
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{card.label}</p>
                    <p className="mt-3 text-2xl font-bold text-white">{card.value}</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionCard title="Diagnostic du rapport" subtitle="Signaux ajoutés au document imprimable et au pack Excel.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Taux de collecte</p>
            <p className="mt-3 text-2xl font-bold text-emerald-200">{collectionRate.toFixed(1)}%</p>
            <p className="mt-2 text-sm text-ink-dim">Revenu collecté sur revenu attendu.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Utilisation budgets</p>
            <p className="mt-3 text-2xl font-bold text-amber-200">{budgetUtilization.toFixed(1)}%</p>
            <p className="mt-2 text-sm text-ink-dim">{currency.format(budgetConsumedTotal)} consommé sur le filtre.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Journaux filtrés</p>
            <p className="mt-3 text-2xl font-bold text-cyan-200">{filteredAccountingEntries.length}</p>
            <p className="mt-2 text-sm text-ink-dim">{currency.format(accountingTotal)} en écritures visibles.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Paie filtrée</p>
            <p className="mt-3 text-2xl font-bold text-white">{currency.format(payrollTotal)}</p>
            <p className="mt-2 text-sm text-ink-dim">{filteredPayrollRuns.length} run(s) dans le périmètre.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {executiveSignals.map((signal) => (
            <div key={signal} className="rounded-xl border border-cyan-400/15 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
              {signal}
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Compte de résultat simplifié" subtitle="Revenu, dépenses et résultat mensuel sur la période courante.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseOverview.monthlyPerformance}>
                <defs>
                  <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="period" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }} />
                <Area type="monotone" dataKey="revenue" stroke="#22d3ee" fill="url(#revenueGlow)" strokeWidth={3} />
                <Area type="monotone" dataKey="profitLoss" stroke="#10b981" fill="url(#profitGlow)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Position budgétaire" subtitle="Alertes et taux de consommation à surveiller maintenant.">
          <div className="space-y-3">
            {filteredBudgetAlerts.map((budget) => (
              <article key={budget.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{budget.name}</p>
                    <p className="mt-1 text-xs text-ink-dim">{budget.department} • {budget.periodName} • {budget.categoryName || "Global"}</p>
                  </div>
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">{budget.utilization.toFixed(1)}%</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                  <div><p className="text-ink-dim">Planifié</p><p className="font-semibold text-white">{currency.format(budget.plannedAmount)}</p></div>
                  <div><p className="text-ink-dim">Consommé</p><p className="font-semibold text-amber-200">{currency.format(budget.consumedAmount)}</p></div>
                  <div><p className="text-ink-dim">Reste</p><p className="font-semibold text-emerald-300">{currency.format(budget.remainingAmount)}</p></div>
                </div>
              </article>
            ))}
            {!filteredBudgetAlerts.length && <p className="text-sm text-ink-dim">Aucune alerte budgétaire sur la période.</p>}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Dépenses par département" subtitle="Lecture immédiate des postes qui consomment le plus.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredDepartmentSpending} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis type="category" dataKey="department" stroke="#94a3b8" width={120} />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16 }} />
                <Bar dataKey="total" radius={[0, 14, 14, 0]} fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Synthèse comptable et cash" subtitle="Volumes visibles avant de descendre dans les journaux détaillés.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Écritures comptables</p>
              <p className="mt-3 text-3xl font-bold text-white">{accountingEntries.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Montant total : {currency.format(accountingEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Lignes de trésorerie</p>
              <p className="mt-3 text-3xl font-bold text-white">{cashflowEntries.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Sorties : {currency.format(cashflowEntries.reduce((sum, entry) => sum + entry.amount, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Runs de paie</p>
              <p className="mt-3 text-3xl font-bold text-white">{payrollRuns.length}</p>
              <p className="mt-2 text-sm text-ink-dim">Masse nette : {currency.format(payrollRuns.reduce((sum, run) => sum + run.totalNet, 0))}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-dim">Dette institutionnelle</p>
              <p className="mt-3 text-3xl font-bold text-white">{currency.format(expenseOverview.liabilities.institutionalObligations)}</p>
              <p className="mt-2 text-sm text-ink-dim">Dette fournisseurs : {currency.format(expenseOverview.liabilities.supplierDebt)}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
