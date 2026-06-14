import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { SearchField } from "../components/SearchField";
import { schoolBranding } from "../config/branding";
import { api } from "../services/api";
import { useAuthStore } from "../store/auth";
import { exportWorkbook } from "../utils/financeExcel";
import { exportElementToPdf } from "../utils/pdfDocument";
import { printHtmlDocument as sharedPrintHtmlDocument } from "../utils/printDocument";

type Employee = {
  id: string;
  orbitId?: string;
  displayId?: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  physicalAddress?: string | null;
  accessCode?: string | null;
  subject?: string | null;
  employeeId?: string | null;
  employeeType?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  mustChangePassword?: boolean;
  organizationId?: string | null;
  externalIds: Array<{ appSlug: string; externalId: string }>;
};

type EmployeeFormState = {
  fullName: string;
  phone: string;
  email: string;
  physicalAddress: string;
  accessCode: string;
  subject: string;
  employeeId: string;
  employeeType: string;
  department: string;
  jobTitle: string;
  mustChangePassword: boolean;
};

type SalaryProfile = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  position: string;
  baseSalary: number;
  currency: string;
  frequency: string;
  defaultBonus: number;
  defaultDeduction: number;
  advanceBalance?: number;
  debtRecoveryRate: number;
  deductionMode?: string;
  maxDeductionRate?: number;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
};

type PayrollRunItem = {
  id: string;
  baseSalary?: number;
  bonuses?: number;
  deductions?: number;
  advancesRecovered?: number;
  debtRecovered?: number;
  netSalary: number;
  salarySlipNumber: string;
  salaryProfile: SalaryProfile;
};

type PayrollRun = {
  id: string;
  title: string;
  department?: string;
  frequency: string;
  status: string;
  totalGross: number;
  totalBonuses: number;
  totalDeductions: number;
  totalNet: number;
  notes?: string;
  processedAt: string | null;
  period?: { id: string; name: string } | null;
  items: PayrollRunItem[];
};

type EmployeeFinanceRecord = {
  run: PayrollRun;
  item: PayrollRunItem;
};

type EmployeeFinanceSnapshot = {
  profiles: SalaryProfile[];
  payrollRecords: EmployeeFinanceRecord[];
  primaryProfile: SalaryProfile | null;
  currency: string;
  totals: {
    totalNetPaid: number;
    totalBonuses: number;
    totalDeductions: number;
    totalDebtRecovered: number;
    totalAdvancesRecovered: number;
  };
  salaryProjection?: {
    mode: string;
    grossSalary: number;
    netSalary: number;
    totalDeductions: number;
    advancesRecovered: number;
    debtRecovered: number;
    salaryPressure: number;
    maxDeductionRate: number;
    recommendation: string;
  };
  communicationHistory?: Array<{ id: string; channel: string; subject?: string | null; content: string; status: string; createdAt: string }>;
};

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

const EMPTY_FORM: EmployeeFormState = {
  fullName: "",
  phone: "",
  email: "",
  physicalAddress: "",
  accessCode: "",
  subject: "",
  employeeId: "",
  employeeType: "",
  department: "",
  jobTitle: "",
  mustChangePassword: false,
};

function sortEmployeesByName(employees: Employee[]) {
  return [...employees].sort((a, b) =>
    String(a.fullName || a.employeeId || a.id || "").localeCompare(String(b.fullName || b.employeeId || b.id || ""), "fr", { sensitivity: "base" })
  );
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function employeeSearchAliases(employee: Employee) {
  const normalizedRole = normalizeSearchText([
    employee.employeeType,
    employee.department,
    employee.jobTitle,
    employee.subject,
  ].join(" "));
  const aliases = new Set<string>();

  if (/\b(teacher|teaching|enseignant|professeur|academic|academique)\b/.test(normalizedRole)) {
    ["professeur", "enseignant", "teacher", "teaching", "academique", "academic"].forEach((alias) => aliases.add(alias));
  }
  if (/\b(driver|chauffeur|transport|logistique|logistics|operations?)\b/.test(normalizedRole)) {
    ["chauffeur", "driver", "transport", "logistique", "operations", "bureau transport"].forEach((alias) => aliases.add(alias));
  }
  if (/\b(accountant|finance|comptable|cashier|caissier)\b/.test(normalizedRole)) {
    ["finance", "comptable", "accountant", "cashier", "caissier", "bureau finance"].forEach((alias) => aliases.add(alias));
  }
  if (/\b(admin|administration|registrar|secretariat|secretary)\b/.test(normalizedRole)) {
    ["administration", "admin", "registrar", "secretariat", "bureau administratif"].forEach((alias) => aliases.add(alias));
  }
  if (/\b(security|securite|guard|garde)\b/.test(normalizedRole)) {
    ["securite", "security", "garde", "guard"].forEach((alias) => aliases.add(alias));
  }

  return Array.from(aliases);
}

function buildEmployeeSearchIndex(employee: Employee) {
  const values = [
    employee.fullName,
    employee.displayId,
    employee.employeeId,
    employee.id,
    employee.email,
    employee.phone,
    employee.physicalAddress,
    employee.department,
    employee.jobTitle,
    employee.employeeType,
    employee.subject,
    ...(employee.externalIds || []).flatMap((item) => [item.appSlug, item.externalId]),
    ...employeeSearchAliases(employee),
  ];

  const terms = values
    .map(normalizeSearchText)
    .filter(Boolean)
    .flatMap((value) => [value, value.replace(/\s+/g, "")]);

  return Array.from(new Set(terms)).join(" ");
}

function searchIndexMatches(index: string, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;
  const compactQuery = query.replace(/\s+/g, "");
  if (index.includes(query) || index.includes(compactQuery)) return true;
  return query.split(" ").filter(Boolean).every((part) => index.includes(part));
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ModalShell({ title, subtitle, actions, onClose, children }: { title: string; subtitle?: string; actions?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-5 sm:py-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="edupay-scrollbar relative flex max-h-[98vh] w-full max-w-8xl flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl animate-fadeInUp" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-[1] border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Employés</p>
            <h2 className="mt-2 truncate font-display text-2xl font-bold text-white">{title}</h2>
            {subtitle ? <p className="mt-2 text-sm text-ink-dim">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <button
                type="button"
                aria-label="Fermer"
                onClick={onClose}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-dim transition-colors hover:text-white"
              >
                <XIcon />
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function toFormState(employee: Employee): EmployeeFormState {
  return {
    fullName: employee.fullName || "",
    phone: employee.phone || "",
    email: employee.email || "",
    physicalAddress: employee.physicalAddress || "",
    accessCode: employee.accessCode || "",
    subject: employee.subject || "",
    employeeId: employee.employeeId || employee.displayId || "",
    employeeType: employee.employeeType || "",
    department: employee.department || "",
    jobTitle: employee.jobTitle || "",
    mustChangePassword: Boolean(employee.mustChangePassword),
  };
}

function infoValue(value?: string | null) {
  return value?.trim() ? value : "Non renseigné";
}

function normalizeComparable(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return "Non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non disponible";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function labelizeFrequency(value?: string | null) {
  switch (String(value ?? "").toUpperCase()) {
    case "MONTHLY":
      return "Mensuelle";
    case "BI_MONTHLY":
      return "Bimensuelle";
    case "QUARTERLY":
      return "Trimestrielle";
    case "ANNUAL":
      return "Annuelle";
    default:
      return infoValue(value);
  }
}

function labelizeObligationType(value?: string | null) {
  switch (String(value ?? "").toUpperCase()) {
    case "SALARY_ADVANCE":
      return "Avance sur salaire";
    case "SCHOOL_DEBT":
      return "Dette envers l'ecole";
    default:
      return "Autre dette";
  }
}

function labelizeRepaymentMethod(value?: string | null) {
  switch (String(value ?? "").toUpperCase()) {
    case "SALARY_DEDUCTION":
      return "Deduction salaire";
    case "EXTERNAL_PAYMENT":
      return "Paiement hors salaire";
    case "MIXED":
      return "Mixte";
    default:
      return infoValue(value);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "employee";
}

function buildEmployeeFinanceSnapshot(employee: Employee, profiles: SalaryProfile[], runs: PayrollRun[]): EmployeeFinanceSnapshot {
  const employeeKeys = new Set(
    [employee.id, employee.orbitId, employee.displayId, employee.employeeId]
      .map((value) => normalizeComparable(value))
      .filter(Boolean)
  );
  const employeeName = normalizeComparable(employee.fullName);

  const matchedProfiles = profiles.filter((profile) => {
    const profileCode = normalizeComparable(profile.employeeCode);
    const profileName = normalizeComparable(profile.fullName);
    return employeeKeys.has(profileCode) || (employeeName && profileName === employeeName);
  });

  const matchedProfileIds = new Set(matchedProfiles.map((profile) => profile.id));

  const payrollRecords = runs.flatMap((run) =>
    (Array.isArray(run.items) ? run.items : [])
      .filter((item) => {
        const code = normalizeComparable(item.salaryProfile?.employeeCode);
        const name = normalizeComparable(item.salaryProfile?.fullName);
        const profileId = item.salaryProfile?.id;
        return Boolean(
          (profileId && matchedProfileIds.has(profileId))
          || employeeKeys.has(code)
          || (employeeName && name === employeeName)
        );
      })
      .map((item) => ({ run, item }))
  );

  const primaryProfile = matchedProfiles[0] ?? payrollRecords[0]?.item.salaryProfile ?? null;
  const currency = primaryProfile?.currency || payrollRecords[0]?.item.salaryProfile?.currency || "USD";

  return {
    profiles: matchedProfiles,
    payrollRecords,
    primaryProfile,
    currency,
    totals: {
      totalNetPaid: payrollRecords.reduce((sum, record) => sum + Number(record.item.netSalary ?? 0), 0),
      totalBonuses: payrollRecords.reduce((sum, record) => sum + Number(record.item.bonuses ?? record.item.salaryProfile?.defaultBonus ?? 0), 0),
      totalDeductions: payrollRecords.reduce((sum, record) => sum + Number(record.item.deductions ?? record.item.salaryProfile?.defaultDeduction ?? 0), 0),
      totalDebtRecovered: payrollRecords.reduce((sum, record) => sum + Number(record.item.debtRecovered ?? 0), 0),
      totalAdvancesRecovered: payrollRecords.reduce((sum, record) => sum + Number(record.item.advancesRecovered ?? 0), 0),
    },
  };
}

function buildEmployeeReportHtml(employee: Employee, snapshot: EmployeeFinanceSnapshot) {
  const currency = snapshot.currency;
  const profile = snapshot.primaryProfile;
  const payrollRows = snapshot.payrollRecords.length > 0
    ? snapshot.payrollRecords.map(({ run, item }) => `
        <tr>
          <td>${escapeHtml(formatDateTimeLabel(run.processedAt))}</td>
          <td>${escapeHtml(item.salarySlipNumber)}</td>
          <td>${escapeHtml(run.title)}</td>
          <td>${escapeHtml(run.period?.name ?? "Période active")}</td>
          <td>${escapeHtml(formatCurrency(Number(item.baseSalary ?? item.salaryProfile.baseSalary ?? 0), currency))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.bonuses ?? item.salaryProfile.defaultBonus ?? 0), currency))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.deductions ?? item.salaryProfile.defaultDeduction ?? 0), currency))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.advancesRecovered ?? 0), currency))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.debtRecovered ?? 0), currency))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.netSalary ?? 0), currency))}</td>
        </tr>`).join("")
    : '<tr><td colspan="10" class="empty">Aucun historique salarial disponible pour cet employé.</td></tr>';

  const notesBlock = profile?.notes?.trim()
    ? `<div class="panel"><h3>Observations RH</h3><p>${escapeHtml(profile.notes.trim())}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Dossier financier employé - ${escapeHtml(employee.fullName)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #edf2f7; color: #0f172a; }
    .sheet { width: 100%; max-width: 1020px; margin: 0 auto; padding: 24px; }
    .report { background: #ffffff; border: 1px solid #dbe4f0; border-radius: 24px; overflow: hidden; position: relative; }
    .watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.05; pointer-events: none; }
    .watermark img { width: 320px; height: 320px; object-fit: contain; }
    .hero { position: relative; padding: 28px; background: linear-gradient(135deg, ${schoolBranding.colors.primary}, ${schoolBranding.colors.secondary}); color: white; }
    .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .brand img { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; background: rgba(255,255,255,0.14); padding: 8px; }
    .eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.8); }
    h1 { margin: 10px 0 0; font-size: 30px; }
    .hero p { margin: 6px 0 0; color: rgba(255,255,255,0.82); }
    .meta-badge { border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 700; }
    .section { padding: 24px 28px 0; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .card { border: 1px solid #dbe4f0; border-radius: 18px; padding: 16px; background: #f8fbff; }
    .label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
    .value { margin-top: 8px; font-size: 20px; font-weight: 700; color: #0f172a; }
    .subvalue { margin-top: 6px; font-size: 12px; color: #475569; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .panel { border: 1px solid #dbe4f0; border-radius: 18px; padding: 18px; background: #ffffff; }
    .panel h3 { margin: 0 0 12px; font-size: 15px; }
    .detail-list { display: grid; gap: 10px; }
    .detail-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eef2f7; padding-bottom: 8px; }
    .detail-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .detail-row span:first-child { color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    thead th { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 12px; }
    .empty { text-align: center; color: #64748b; padding: 20px; }
    .footer { padding: 22px 28px 28px; font-size: 12px; color: #475569; }
    @media print {
      body { background: white; }
      .sheet { padding: 0; }
      .report { border-radius: 0; border: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="report">
      <div class="watermark"><img src="${escapeHtml(schoolBranding.logoSrc)}" alt="Logo" /></div>
      <div class="hero">
        <div class="hero-top">
          <div class="brand">
            <img src="${escapeHtml(schoolBranding.logoSrc)}" alt="${escapeHtml(schoolBranding.schoolName)}" />
            <div>
              <div class="eyebrow">${escapeHtml(schoolBranding.schoolName)}</div>
              <h1>Dossier financier employé</h1>
              <p>${escapeHtml(employee.fullName)} • ${escapeHtml(infoValue(employee.jobTitle))} • ${escapeHtml(infoValue(employee.department))}</p>
            </div>
          </div>
          <div class="meta-badge">ID système: ${escapeHtml(employee.displayId || employee.employeeId || employee.id)}</div>
        </div>
      </div>

      <div class="section">
        <div class="cards">
          <div class="card"><div class="label">Salaire de base</div><div class="value">${escapeHtml(formatCurrency(Number(profile?.baseSalary ?? 0), currency))}</div><div class="subvalue">${escapeHtml(labelizeFrequency(profile?.frequency))}</div></div>
          <div class="card"><div class="label">Bonus cumulés</div><div class="value">${escapeHtml(formatCurrency(snapshot.totals.totalBonuses, currency))}</div><div class="subvalue">Historique de paie</div></div>
          <div class="card"><div class="label">Dettes recouvrées</div><div class="value">${escapeHtml(formatCurrency(snapshot.totals.totalDebtRecovered, currency))}</div><div class="subvalue">Taux: ${escapeHtml(`${Number(profile?.debtRecoveryRate ?? 0).toFixed(2)}%`)}</div></div>
          <div class="card"><div class="label">Avances en cours</div><div class="value">${escapeHtml(formatCurrency(Number(profile?.advanceBalance ?? 0), currency))}</div><div class="subvalue">Avances récupérées: ${escapeHtml(formatCurrency(snapshot.totals.totalAdvancesRecovered, currency))}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="grid">
          <div class="panel">
            <h3>Référentiel salarial</h3>
            <div class="detail-list">
              <div class="detail-row"><span>Code employé</span><strong>${escapeHtml(profile?.employeeCode || employee.displayId || employee.employeeId || employee.id)}</strong></div>
              <div class="detail-row"><span>Poste</span><strong>${escapeHtml(infoValue(profile?.position || employee.jobTitle))}</strong></div>
              <div class="detail-row"><span>Département</span><strong>${escapeHtml(infoValue(profile?.department || employee.department))}</strong></div>
              <div class="detail-row"><span>Bonus par défaut</span><strong>${escapeHtml(formatCurrency(Number(profile?.defaultBonus ?? 0), currency))}</strong></div>
              <div class="detail-row"><span>Déductions par défaut</span><strong>${escapeHtml(formatCurrency(Number(profile?.defaultDeduction ?? 0), currency))}</strong></div>
              <div class="detail-row"><span>Net versé cumulé</span><strong>${escapeHtml(formatCurrency(snapshot.totals.totalNetPaid, currency))}</strong></div>
            </div>
          </div>
          <div class="panel">
            <h3>Coordonnées et traçabilité</h3>
            <div class="detail-list">
              <div class="detail-row"><span>Email</span><strong>${escapeHtml(infoValue(employee.email))}</strong></div>
              <div class="detail-row"><span>Téléphone</span><strong>${escapeHtml(infoValue(employee.phone))}</strong></div>
              <div class="detail-row"><span>Type</span><strong>${escapeHtml(infoValue(employee.employeeType))}</strong></div>
              <div class="detail-row"><span>Spécialité</span><strong>${escapeHtml(infoValue(employee.subject))}</strong></div>
              <div class="detail-row"><span>Dernier run</span><strong>${escapeHtml(formatDateTimeLabel(snapshot.payrollRecords[0]?.run.processedAt))}</strong></div>
              <div class="detail-row"><span>Nombre de fiches</span><strong>${escapeHtml(String(snapshot.payrollRecords.length))}</strong></div>
            </div>
          </div>
        </div>
      </div>

      ${notesBlock ? `<div class="section">${notesBlock}</div>` : ""}

      <div class="section">
        <div class="panel">
          <h3>Historique salarial détaillé</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fiche</th>
                <th>Run</th>
                <th>Période</th>
                <th>Brut</th>
                <th>Bonus</th>
                <th>Déductions</th>
                <th>Avances</th>
                <th>Dettes</th>
                <th>Net payé</th>
              </tr>
            </thead>
            <tbody>${payrollRows}</tbody>
          </table>
        </div>
      </div>

      <div class="footer">Document généré par ${escapeHtml(schoolBranding.appName)} le ${escapeHtml(formatDateTimeLabel(new Date().toISOString()))}.</div>
    </div>
  </div>
</body>
</html>`;
}

function printHtmlDocument(html: string) {
  sharedPrintHtmlDocument(html);
}

async function exportEmployeeReportPdf(employee: Employee, snapshot: EmployeeFinanceSnapshot) {
  const html = buildEmployeeReportHtml(employee, snapshot);
  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-10000px";
  mount.style.top = "0";
  mount.style.width = "1020px";
  mount.innerHTML = html;
  document.body.appendChild(mount);

  try {
    const reportNode = mount.querySelector(".report") as HTMLElement | null;
    if (!reportNode) throw new Error("Support de rapport introuvable.");

    await exportElementToPdf(reportNode, {
      filename: `dossier-financier-${slugify(employee.fullName)}.pdf`,
      backgroundColor: "#edf2f7",
    });
  } finally {
    mount.remove();
  }
}

function printEmployeeReport(employee: Employee, snapshot: EmployeeFinanceSnapshot) {
  printHtmlDocument(buildEmployeeReportHtml(employee, snapshot));
}

function exportEmployeeReportExcel(employee: Employee, snapshot: EmployeeFinanceSnapshot) {
  const currency = snapshot.currency;
  const profile = snapshot.primaryProfile;
  exportWorkbook(`dossier-financier-${slugify(employee.fullName)}`, [
    {
      name: "Synthese",
      rows: [{
        "Employé": employee.fullName,
        "ID système": employee.displayId || employee.employeeId || employee.id,
        "Département": profile?.department || employee.department || "",
        "Poste": profile?.position || employee.jobTitle || "",
        "Fréquence": labelizeFrequency(profile?.frequency),
        "Salaire de base": Number(profile?.baseSalary ?? 0),
        "Bonus par défaut": Number(profile?.defaultBonus ?? 0),
        "Déductions par défaut": Number(profile?.defaultDeduction ?? 0),
        "Avances en cours": Number(profile?.advanceBalance ?? 0),
        "Taux recouvrement dette %": Number(Number(profile?.debtRecoveryRate ?? 0).toFixed(2)),
        "Net payé cumulé": Number(snapshot.totals.totalNetPaid.toFixed(2)),
        "Bonus cumulés": Number(snapshot.totals.totalBonuses.toFixed(2)),
        "Déductions cumulées": Number(snapshot.totals.totalDeductions.toFixed(2)),
        "Dettes recouvrées": Number(snapshot.totals.totalDebtRecovered.toFixed(2)),
        "Avances récupérées": Number(snapshot.totals.totalAdvancesRecovered.toFixed(2)),
        "Devise": currency,
      }],
    },
    {
      name: "Historique paie",
      rows: snapshot.payrollRecords.map(({ run, item }) => ({
        "Date de traitement": formatDateTimeLabel(run.processedAt),
        "Run": run.title,
        "Période": run.period?.name ?? "Période active",
        "Statut": run.status,
        "Numéro fiche": item.salarySlipNumber,
        "Salaire brut": Number((item.baseSalary ?? item.salaryProfile.baseSalary ?? 0).toFixed(2)),
        "Bonus": Number((item.bonuses ?? item.salaryProfile.defaultBonus ?? 0).toFixed(2)),
        "Déductions": Number((item.deductions ?? item.salaryProfile.defaultDeduction ?? 0).toFixed(2)),
        "Avances récupérées": Number((item.advancesRecovered ?? 0).toFixed(2)),
        "Dettes recouvrées": Number((item.debtRecovered ?? 0).toFixed(2)),
        "Net payé": Number(item.netSalary.toFixed(2)),
      })),
    },
  ]);
}

export function EmployeesPage() {
  const role = useAuthStore((state) => state.role);
  const canManageEmployees = ["SUPER_ADMIN", "OWNER", "ADMIN", "HR_MANAGER"].includes(role || "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [employeeFinanceLoading, setEmployeeFinanceLoading] = useState(false);
  const [employeeFinanceError, setEmployeeFinanceError] = useState<string | null>(null);
  const [employeeFinanceSnapshot, setEmployeeFinanceSnapshot] = useState<EmployeeFinanceSnapshot | null>(null);
  const [employeeObligations, setEmployeeObligations] = useState<EmployeeObligation[]>([]);
  const [employeeFinanceQuery, setEmployeeFinanceQuery] = useState("");
  const [employeeFinanceDateFrom, setEmployeeFinanceDateFrom] = useState("");
  const [employeeFinanceDateTo, setEmployeeFinanceDateTo] = useState("");
  const [employeePdfExporting, setEmployeePdfExporting] = useState(false);
  const [employeeNoticeSending, setEmployeeNoticeSending] = useState(false);

  async function loadEmployees() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Employee[]>("/api/shared-directory/teachers");
      setEmployees(sortEmployeesByName(Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les employés.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeFinanceSnapshot(null);
      setEmployeeObligations([]);
      setEmployeeFinanceError(null);
      setEmployeeFinanceLoading(false);
      setEmployeePdfExporting(false);
      return;
    }

    let active = true;
    setEmployeeFinanceLoading(true);
    setEmployeeFinanceError(null);

    const params = new URLSearchParams();
    const employeeCode = selectedEmployee.employeeId || selectedEmployee.displayId || selectedEmployee.id;
    if (employeeCode) params.set("employeeCode", employeeCode);
    if (employeeFinanceQuery.trim()) params.set("query", employeeFinanceQuery.trim());
    if (employeeFinanceDateFrom) params.set("dateFrom", employeeFinanceDateFrom);
    if (employeeFinanceDateTo) params.set("dateTo", employeeFinanceDateTo);
    const snapshotParams = new URLSearchParams(params);
    snapshotParams.delete("query");

    void Promise.all([
      api<SalaryProfile[]>("/api/expenses/payroll/profiles"),
      api<PayrollRun[]>("/api/expenses/payroll/runs"),
      api<EmployeeObligation[]>(`/api/expenses/employee-finance/obligations?${params.toString()}`),
      api<{ salaryProjection?: EmployeeFinanceSnapshot["salaryProjection"]; communicationHistory?: EmployeeFinanceSnapshot["communicationHistory"] }>(`/api/expenses/employee-finance/snapshot?${snapshotParams.toString()}`),
    ])
      .then(([profiles, runs, obligations, enrichedSnapshot]) => {
        if (!active) return;
        setEmployeeFinanceSnapshot({
          ...buildEmployeeFinanceSnapshot(selectedEmployee, Array.isArray(profiles) ? profiles : [], Array.isArray(runs) ? runs : []),
          salaryProjection: enrichedSnapshot.salaryProjection,
          communicationHistory: enrichedSnapshot.communicationHistory ?? []
        });
        setEmployeeObligations(Array.isArray(obligations) ? obligations : []);
      })
      .catch((err) => {
        if (!active) return;
        setEmployeeFinanceSnapshot(null);
        setEmployeeFinanceError(err instanceof Error ? err.message : "Impossible de charger le dossier financier de cet employé.");
      })
      .finally(() => {
        if (active) setEmployeeFinanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmployee, employeeFinanceQuery, employeeFinanceDateFrom, employeeFinanceDateTo]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim();
    if (!term) return employees;

    return employees.filter((employee) => searchIndexMatches(buildEmployeeSearchIndex(employee), term));
  }, [employees, search]);

  const stats = useMemo(() => {
    const departments = new Set(employees.map((employee) => employee.department?.trim()).filter((value): value is string => Boolean(value)));
    const withAccessCode = employees.filter((employee) => employee.accessCode?.trim()).length;
    return {
      total: employees.length,
      departments: departments.size,
      withAccessCode,
    };
  }, [employees]);

  const employeeObligationTotals = useMemo(() => {
    const active = employeeObligations.filter((item) => !["PAID", "CANCELLED", "WRITTEN_OFF"].includes(item.status));
    return {
      totalBalance: active.reduce((sum, item) => sum + Number(item.balance || 0), 0),
      salaryAdvances: active.filter((item) => item.type === "SALARY_ADVANCE").reduce((sum, item) => sum + Number(item.balance || 0), 0),
      schoolDebts: active.filter((item) => item.type === "SCHOOL_DEBT").reduce((sum, item) => sum + Number(item.balance || 0), 0),
      overdue: active.flatMap((item) => item.repayments || []).filter((repayment) => repayment.status !== "PAID" && new Date(repayment.dueDate).getTime() < Date.now()).length,
    };
  }, [employeeObligations]);

  async function handleSendEmployeeTransparencyNotice() {
    const profile = employeeFinanceSnapshot?.primaryProfile;
    if (!profile) return;
    setEmployeeNoticeSending(true);
    setMutationNotice(null);
    try {
      await api("/api/expenses/employee-finance/notify", {
        method: "POST",
        body: JSON.stringify({
          salaryProfileId: profile.id,
          channels: ["DASHBOARD", "EMAIL", "SMS"],
          subject: "Mise a jour de votre situation salariale EduPay"
        })
      });
      setMutationNotice("Avis de transparence envoye a l'employe et ajoute dans son dashboard.");
      const params = new URLSearchParams();
      const employeeCode = selectedEmployee?.employeeId || selectedEmployee?.displayId || selectedEmployee?.id;
      if (employeeCode) params.set("employeeCode", employeeCode);
      const enrichedSnapshot = await api<{ salaryProjection?: EmployeeFinanceSnapshot["salaryProjection"]; communicationHistory?: EmployeeFinanceSnapshot["communicationHistory"] }>(`/api/expenses/employee-finance/snapshot?${params.toString()}`);
      setEmployeeFinanceSnapshot((current) => current ? { ...current, salaryProjection: enrichedSnapshot.salaryProjection, communicationHistory: enrichedSnapshot.communicationHistory ?? [] } : current);
    } catch (err) {
      setEmployeeFinanceError(err instanceof Error ? err.message : "Impossible d'envoyer l'avis de transparence.");
    } finally {
      setEmployeeNoticeSending(false);
    }
  }

  async function handleUpdateEmployeeDeductionMode(mode: string) {
    const profile = employeeFinanceSnapshot?.primaryProfile;
    if (!profile) return;
    setEmployeeNoticeSending(true);
    setEmployeeFinanceError(null);
    try {
      const updated = await api<SalaryProfile>(`/api/expenses/payroll/profiles/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify({ deductionMode: mode })
      });
      setEmployeeFinanceSnapshot((current) => current ? { ...current, primaryProfile: { ...current.primaryProfile!, ...updated } } : current);
      setMutationNotice(`Mode de deduction mis a jour: ${mode}.`);
    } catch (err) {
      setEmployeeFinanceError(err instanceof Error ? err.message : "Impossible de modifier le mode de deduction.");
    } finally {
      setEmployeeNoticeSending(false);
    }
  }

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    setForm(toFormState(employee));
  }

  function closeEditModal() {
    setEditingEmployee(null);
    setForm(EMPTY_FORM);
  }

  async function handleSaveEmployee() {
    if (!editingEmployee) return;
    const identifier = editingEmployee.orbitId || editingEmployee.id;
    if (!identifier) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await api<{ notificationStatus?: { email?: string; sms?: string; adminEmail?: string } }>(`/api/shared-directory/teachers/${encodeURIComponent(identifier)}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim() ? form.phone.trim() : null,
          email: form.email.trim() ? form.email.trim() : null,
          physicalAddress: form.physicalAddress.trim() ? form.physicalAddress.trim() : null,
          accessCode: form.accessCode.trim() ? form.accessCode.trim() : null,
          subject: form.subject.trim() ? form.subject.trim() : null,
          employeeType: form.employeeType.trim() ? form.employeeType.trim() : null,
          department: form.department.trim() ? form.department.trim() : null,
          jobTitle: form.jobTitle.trim() ? form.jobTitle.trim() : null,
          mustChangePassword: form.mustChangePassword,
        }),
      });
      setMutationNotice([
        "Les informations de l'employé ont été synchronisées dans le répertoire commun de l'écosystème.",
        `Notification email employé : ${result.notificationStatus?.email ?? "non disponible"}.`,
        `Notification SMS employé : ${result.notificationStatus?.sms ?? "non disponible"}.`,
        `Notification administrateurs : ${result.notificationStatus?.adminEmail ?? "non disponible"}.`,
      ].join("\n"));
      closeEditModal();
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour cet employé.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return;
    const identifier = deleteTarget.orbitId || deleteTarget.id;
    if (!identifier) return;

    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/shared-directory/teachers/${encodeURIComponent(identifier)}`, { method: "DELETE" });
      setDeleteTarget(null);
      if (selectedEmployee?.id === deleteTarget.id) {
        setSelectedEmployee(null);
      }
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer cet employé.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {mutationNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-400/30 bg-slate-950 p-5 text-white shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Modification synchronisée</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Notification envoyée</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-ink-dim">{mutationNotice}</pre>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMutationNotice(null)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-white">Répertoire des employés</h1>
          <p className="mt-1 text-ink-dim">
            Liste centralisée du personnel synchronisé depuis SAVANEX, avec une lecture plus proche des surfaces Élèves et Gestion parents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-right">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Source</p>
            <p className="mt-1 text-sm font-semibold text-white">SAVANEX</p>
          </div>
          <button
            onClick={() => void loadEmployees()}
            className="inline-flex h-[52px] items-center justify-center rounded-xl border border-brand-300/25 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:border-brand-300/45 hover:bg-brand-500/12"
          >
            Actualiser la liste
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-fadeInUp">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Employés</p>
          <p className="mt-1 font-display text-3xl font-bold text-cyan-300">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Départements</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-300">{stats.departments}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Codes d'accès</p>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-300">{stats.withAccessCode}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Résultats</p>
          <p className="mt-1 font-display text-3xl font-bold text-white">{filteredEmployees.length}</p>
        </div>
      </div>

      <SearchField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Rechercher un employe, matricule, departement, bureau, poste, professeur, chauffeur ou contact..."
        wrapperClassName="animate-fadeInUp"
      />

      {error ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger animate-fadeInUp">
          {error}
        </div>
      ) : null}

      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-ink-dim">Aucun employé ne correspond à votre recherche.</div>
        ) : (
          <div className="edupay-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">ID employé</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Nom complet</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Département</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Profil</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Contact</th>
                  <th className="px-5 py-4 text-center text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee, index) => (
                  <tr key={employee.id} className="border-b border-slate-700/30 transition-colors hover:bg-slate-800/30" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td className="px-5 py-4">
                      <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-xs font-bold text-cyan-200">
                        {employee.displayId || employee.employeeId || employee.id}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{employee.fullName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-ink-dim">{infoValue(employee.jobTitle)}</span>
                        {employee.accessCode?.trim() ? (
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">Code d'accès actif</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-ink-dim">{infoValue(employee.department)}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{infoValue(employee.employeeType)}</p>
                      <p className="mt-1 text-xs text-ink-dim">{infoValue(employee.subject)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{infoValue(employee.email)}</p>
                      <p className="mt-1 text-xs text-ink-dim">{infoValue(employee.phone)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedEmployee(employee)}
                          className="rounded-lg bg-slate-700/50 p-2 text-ink-dim transition-all hover:bg-slate-600/50 hover:text-white"
                          title="Voir"
                        >
                          <EyeIcon />
                        </button>
                        {canManageEmployees ? (
                          <>
                            <button
                              onClick={() => openEditModal(employee)}
                              className="rounded-lg bg-brand-500/20 p-2 text-brand-300 transition-all hover:bg-brand-500/30"
                              title="Modifier"
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(employee)}
                              className="rounded-lg bg-danger/20 p-2 text-danger transition-all hover:bg-danger/30"
                              title="Supprimer"
                            >
                              <TrashIcon />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEmployee ? (
        <ModalShell
          title={selectedEmployee.fullName}
          subtitle="Fiche détaillée de l'employé dans le registre partagé."
          onClose={() => setSelectedEmployee(null)}
          actions={(
            <>
              <button
                type="button"
                onClick={() => {
                  if (!employeeFinanceSnapshot) return;
                  setEmployeePdfExporting(true);
                  void exportEmployeeReportPdf(selectedEmployee, employeeFinanceSnapshot).finally(() => setEmployeePdfExporting(false));
                }}
                disabled={employeeFinanceLoading || !employeeFinanceSnapshot || employeePdfExporting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Télécharger le rapport en PDF"
              >
                <FileText className="h-4 w-4" /> {employeePdfExporting ? "PDF..." : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => employeeFinanceSnapshot && printEmployeeReport(selectedEmployee, employeeFinanceSnapshot)}
                disabled={employeeFinanceLoading || !employeeFinanceSnapshot || employeePdfExporting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Imprimer le rapport"
              >
                <Printer className="h-4 w-4" /> Impression
              </button>
              <button
                type="button"
                onClick={() => employeeFinanceSnapshot && exportEmployeeReportExcel(selectedEmployee, employeeFinanceSnapshot)}
                disabled={employeeFinanceLoading || !employeeFinanceSnapshot || employeePdfExporting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                title="Exporter le rapport en Excel"
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
            </>
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Identifiant affiché</p>
              <p className="mt-2 text-sm font-semibold text-white">{selectedEmployee.displayId || selectedEmployee.employeeId || selectedEmployee.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Matricule interne</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.employeeId)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Département</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.department)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Poste</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.jobTitle)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Email</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.email)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Téléphone</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.phone)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Adresse physique</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.physicalAddress)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Matière ou spécialité</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.subject)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Type d'employé</p>
              <p className="mt-2 text-sm font-semibold text-white">{infoValue(selectedEmployee.employeeType)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Codes externes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEmployee.externalIds.length > 0 ? selectedEmployee.externalIds.map((item) => (
                  <span key={`${item.appSlug}-${item.externalId}`} className="rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-100">
                    {item.appSlug}: {item.externalId}
                  </span>
                )) : <span className="text-sm text-ink-dim">Aucun identifiant externe.</span>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Dossier financier</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">Historique salarial, dettes et avances</h3>
                </div>
                {employeeFinanceLoading ? <span className="text-sm text-ink-dim">Chargement des données financières...</span> : null}
              </div>

              {employeeFinanceError ? (
                <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {employeeFinanceError}
                </div>
              ) : null}

              {employeeFinanceSnapshot ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-brand-300/20 bg-brand-500/10 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-200">Avances, dettes et echeances</p>
                        <h3 className="mt-1 text-lg font-semibold text-white">Registre financier employe</h3>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input className="h-10" value={employeeFinanceQuery} onChange={(event) => setEmployeeFinanceQuery(event.target.value)} placeholder="Recherche: avance, dette, retard..." />
                        <input className="h-10" type="date" value={employeeFinanceDateFrom} onChange={(event) => setEmployeeFinanceDateFrom(event.target.value)} />
                        <input className="h-10" type="date" value={employeeFinanceDateTo} onChange={(event) => setEmployeeFinanceDateTo(event.target.value)} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Solde total</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(employeeObligationTotals.totalBalance, employeeFinanceSnapshot.currency)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Avances ouvertes</p>
                        <p className="mt-2 text-lg font-semibold text-cyan-300">{formatCurrency(employeeObligationTotals.salaryAdvances, employeeFinanceSnapshot.currency)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Dettes ecole</p>
                        <p className="mt-2 text-lg font-semibold text-amber-300">{formatCurrency(employeeObligationTotals.schoolDebts, employeeFinanceSnapshot.currency)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Echeances en retard</p>
                        <p className="mt-2 text-lg font-semibold text-rose-300">{employeeObligationTotals.overdue}</p>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-slate-950/50 text-left text-xs uppercase tracking-[0.14em] text-ink-dim">
                            <th className="px-4 py-3">Engagement</th>
                            <th className="px-4 py-3">Mode</th>
                            <th className="px-4 py-3">Solde</th>
                            <th className="px-4 py-3">Echeance</th>
                            <th className="px-4 py-3">Risque</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employeeObligations.length > 0 ? employeeObligations.map((obligation) => (
                            <tr key={obligation.id} className="border-b border-white/5 last:border-b-0">
                              <td className="px-4 py-3">
                                <p className="font-medium text-white">{obligation.title}</p>
                                <p className="text-xs text-ink-dim">{labelizeObligationType(obligation.type)} - {obligation.status}</p>
                              </td>
                              <td className="px-4 py-3 text-ink-dim">{labelizeRepaymentMethod(obligation.repaymentMethod)}</td>
                              <td className="px-4 py-3 font-semibold text-white">{formatCurrency(Number(obligation.balance || 0), obligation.currency)}</td>
                              <td className="px-4 py-3 text-ink-dim">{formatDateTimeLabel(obligation.dueDate)}</td>
                              <td className="px-4 py-3 text-ink-dim">{obligation.riskLevel} ({Number(obligation.riskScore || 0).toFixed(0)})</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-ink-dim">Aucune avance ou dette trouvee pour cette periode.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Net mensuel prevu</p>
                      <p className="mt-2 text-lg font-semibold text-emerald-300">{formatCurrency(Number(employeeFinanceSnapshot.salaryProjection?.netSalary ?? employeeFinanceSnapshot.primaryProfile?.baseSalary ?? 0), employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">Mode {employeeFinanceSnapshot.salaryProjection?.mode || employeeFinanceSnapshot.primaryProfile?.deductionMode || "AUTOMATIC"}</p>
                      <select
                        className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white"
                        value={employeeFinanceSnapshot.primaryProfile?.deductionMode || "AUTOMATIC"}
                        onChange={(event) => void handleUpdateEmployeeDeductionMode(event.target.value)}
                        disabled={employeeNoticeSending || !employeeFinanceSnapshot.primaryProfile}
                      >
                        <option value="AUTOMATIC">Automatique</option>
                        <option value="MANUAL">Manuel</option>
                        <option value="HYBRID">Hybride</option>
                      </select>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Deductions du mois</p>
                      <p className="mt-2 text-lg font-semibold text-amber-300">{formatCurrency(Number(employeeFinanceSnapshot.salaryProjection?.totalDeductions ?? 0), employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">Pression {Number(employeeFinanceSnapshot.salaryProjection?.salaryPressure ?? 0).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Avis envoyes</p>
                      <p className="mt-2 text-lg font-semibold text-cyan-300">{employeeFinanceSnapshot.communicationHistory?.length ?? 0}</p>
                      <p className="mt-1 text-xs text-ink-dim">Dashboard / email / SMS</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Action transparence</p>
                      <button
                        type="button"
                        onClick={() => void handleSendEmployeeTransparencyNotice()}
                        disabled={employeeNoticeSending || !employeeFinanceSnapshot.primaryProfile}
                        className="mt-2 w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {employeeNoticeSending ? "Envoi..." : "Notifier"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Salaire de base</p>
                      <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(Number(employeeFinanceSnapshot.primaryProfile?.baseSalary ?? 0), employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">{labelizeFrequency(employeeFinanceSnapshot.primaryProfile?.frequency)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Bonus cumulés</p>
                      <p className="mt-2 text-lg font-semibold text-emerald-300">{formatCurrency(employeeFinanceSnapshot.totals.totalBonuses, employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">Toutes fiches confondues</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Dettes recouvrées</p>
                      <p className="mt-2 text-lg font-semibold text-amber-300">{formatCurrency(employeeFinanceSnapshot.totals.totalDebtRecovered, employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">Taux {Number(employeeFinanceSnapshot.primaryProfile?.debtRecoveryRate ?? 0).toFixed(2)}%</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-dim">Avances en cours</p>
                      <p className="mt-2 text-lg font-semibold text-cyan-300">{formatCurrency(Number(employeeFinanceSnapshot.primaryProfile?.advanceBalance ?? 0), employeeFinanceSnapshot.currency)}</p>
                      <p className="mt-1 text-xs text-ink-dim">Récupérées: {formatCurrency(employeeFinanceSnapshot.totals.totalAdvancesRecovered, employeeFinanceSnapshot.currency)}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Paramètres salariaux</p>
                      <div className="mt-3 space-y-3 text-sm text-ink-dim">
                        <div className="flex items-center justify-between gap-3"><span>Code employé</span><span className="font-semibold text-white">{employeeFinanceSnapshot.primaryProfile?.employeeCode || selectedEmployee.displayId || selectedEmployee.employeeId || selectedEmployee.id}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>Bonus par défaut</span><span className="font-semibold text-white">{formatCurrency(Number(employeeFinanceSnapshot.primaryProfile?.defaultBonus ?? 0), employeeFinanceSnapshot.currency)}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>Déductions par défaut</span><span className="font-semibold text-white">{formatCurrency(Number(employeeFinanceSnapshot.primaryProfile?.defaultDeduction ?? 0), employeeFinanceSnapshot.currency)}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>Net payé cumulé</span><span className="font-semibold text-white">{formatCurrency(employeeFinanceSnapshot.totals.totalNetPaid, employeeFinanceSnapshot.currency)}</span></div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-dim">Notes et couverture</p>
                      <div className="mt-3 space-y-3 text-sm text-ink-dim">
                        <div className="flex items-center justify-between gap-3"><span>Fiches salariales</span><span className="font-semibold text-white">{employeeFinanceSnapshot.payrollRecords.length}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>Dernier traitement</span><span className="font-semibold text-white">{formatDateTimeLabel(employeeFinanceSnapshot.payrollRecords[0]?.run.processedAt)}</span></div>
                        <div><span className="block text-xs uppercase tracking-[0.16em] text-ink-dim">Observation</span><p className="mt-2 text-sm text-white">{employeeFinanceSnapshot.primaryProfile?.notes?.trim() || "Aucune note RH disponible pour ce profil salarial."}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.04] text-left text-xs uppercase tracking-[0.14em] text-ink-dim">
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Fiche</th>
                          <th className="px-4 py-3">Run</th>
                          <th className="px-4 py-3">Brut</th>
                          <th className="px-4 py-3">Bonus</th>
                          <th className="px-4 py-3">Déductions</th>
                          <th className="px-4 py-3">Avances</th>
                          <th className="px-4 py-3">Dettes</th>
                          <th className="px-4 py-3">Net payé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeFinanceSnapshot.payrollRecords.length > 0 ? employeeFinanceSnapshot.payrollRecords.map(({ run, item }) => (
                          <tr key={item.id} className="border-b border-white/5 last:border-b-0">
                            <td className="px-4 py-3 text-ink-dim">{formatDateTimeLabel(run.processedAt)}</td>
                            <td className="px-4 py-3 font-medium text-white">{item.salarySlipNumber}</td>
                            <td className="px-4 py-3 text-ink-dim">{run.title}</td>
                            <td className="px-4 py-3 text-white">{formatCurrency(Number(item.baseSalary ?? item.salaryProfile.baseSalary ?? 0), employeeFinanceSnapshot.currency)}</td>
                            <td className="px-4 py-3 text-emerald-300">{formatCurrency(Number(item.bonuses ?? item.salaryProfile.defaultBonus ?? 0), employeeFinanceSnapshot.currency)}</td>
                            <td className="px-4 py-3 text-rose-300">{formatCurrency(Number(item.deductions ?? item.salaryProfile.defaultDeduction ?? 0), employeeFinanceSnapshot.currency)}</td>
                            <td className="px-4 py-3 text-cyan-300">{formatCurrency(Number(item.advancesRecovered ?? 0), employeeFinanceSnapshot.currency)}</td>
                            <td className="px-4 py-3 text-amber-300">{formatCurrency(Number(item.debtRecovered ?? 0), employeeFinanceSnapshot.currency)}</td>
                            <td className="px-4 py-3 font-semibold text-white">{formatCurrency(Number(item.netSalary ?? 0), employeeFinanceSnapshot.currency)}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={9} className="px-4 py-6 text-center text-ink-dim">Aucune fiche salariale disponible pour cet employé.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : employeeFinanceLoading ? null : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-ink-dim">
                  Aucun profil de paie ou historique salarial n'a encore été trouvé pour cet employé.
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {editingEmployee ? (
        <ModalShell title="Modifier un employé" subtitle="Chaque champ est explicite et peut être vidé si l'information n'est plus valable." onClose={closeEditModal}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-white">Nom complet</span>
              <input className="w-full" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Ex. Mireille Ilunga" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Email</span>
              <input className="w-full" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="nom@ecole.cd" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Téléphone</span>
              <input className="w-full" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+243 ..." />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-white">Adresse physique</span>
              <input className="w-full" value={form.physicalAddress} onChange={(event) => setForm((current) => ({ ...current, physicalAddress: event.target.value }))} placeholder="Avenue, quartier, commune, ville" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Matricule employé</span>
              <input className="w-full cursor-not-allowed opacity-70" value={form.employeeId} readOnly disabled placeholder="Généré par le système" />
              <p className="text-xs text-ink-dim">Ce matricule est généré par le système et ne peut pas être modifié ici.</p>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Type d'employé</span>
              <input className="w-full" value={form.employeeType} onChange={(event) => setForm((current) => ({ ...current, employeeType: event.target.value }))} placeholder="TEACHING ou STAFF" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Département</span>
              <input className="w-full" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Académique" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Poste</span>
              <input className="w-full" value={form.jobTitle} onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="Teacher" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Matière ou spécialité</span>
              <input className="w-full" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Mathématiques" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-white">Code d'accès</span>
              <input className="w-full" value={form.accessCode} onChange={(event) => setForm((current) => ({ ...current, accessCode: event.target.value }))} placeholder="ACC-TCH-..." />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 md:col-span-2">
              <input type="checkbox" checked={form.mustChangePassword} onChange={(event) => setForm((current) => ({ ...current, mustChangePassword: event.target.checked }))} />
              <span className="text-sm text-white">Exiger un changement de mot de passe à la prochaine connexion</span>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={closeEditModal} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-dim transition hover:text-white">
              Annuler
            </button>
            <button
              onClick={() => void handleSaveEmployee()}
              disabled={submitting || !form.fullName.trim()}
              className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {deleteTarget ? (
        <ModalShell title="Supprimer cet employé" subtitle="Cette action retire l'employé du registre partagé pour l'application." onClose={() => setDeleteTarget(null)}>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            Vous êtes sur le point de supprimer <span className="font-semibold text-white">{deleteTarget.fullName}</span>. Cette opération est irréversible.
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-ink-dim transition hover:text-white">
              Annuler
            </button>
            <button
              onClick={() => void handleDeleteEmployee()}
              disabled={submitting}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
