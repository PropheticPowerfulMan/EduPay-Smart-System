import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Edit3, Eye, FileSpreadsheet, FileText, Printer, Trash2, X } from "lucide-react";
import { SearchField } from "../components/SearchField";
import { schoolBranding } from "../config/branding";
import { api } from "../services/api";
import { exportWorkbook } from "../utils/financeExcel";
import { exportElementToPdf } from "../utils/pdfDocument";
import { printHtmlDocument } from "../utils/printDocument";

type SharedDirectoryStudent = {
  id: string;
  orbitId?: string;
  displayId?: string;
  studentNumber?: string;
  externalStudentId?: string;
  fullName: string;
  classId?: string;
  className?: string;
  createdAt?: string;
  parentId?: string;
  annualFee?: number;
  annualFeeDisplay?: number;
  originalAnnualFee?: number;
  reductionTotal?: number;
  paymentOptionType?: string | null;
  tuitionPlanName?: string;
};

type SharedDirectoryParent = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students?: SharedDirectoryStudent[];
};

type FinanceInstallment = {
  id: string;
  studentId?: string | null;
  label: string;
  periodKey?: string | null;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
  isOverdue: boolean;
  createdAt?: string | null;
};

type FinanceReduction = {
  id: string;
  title: string;
  source?: string;
  amount: number;
  percentage?: number | null;
  studentId?: string | null;
  studentName?: string | null;
  effectiveDate?: string;
  scope?: string;
};

type FinanceAgreement = {
  id: string;
  title: string;
  status: string;
  customTotal: number;
  reductionAmount: number;
  balanceDue: number;
  paymentOptionType?: string;
  notes?: string | null;
  approvedAt?: string | null;
  createdAt: string;
};

type FinanceDebt = {
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

type FinanceAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
};

type FinanceAllocationLine = {
  allocationId?: string;
  installmentId?: string;
  studentId?: string | null;
  studentName?: string;
  label: string;
  dueDate: string;
  allocated: number;
  outstandingAfter: number;
  createdAt?: string;
};

type FinancePaymentHistory = {
  id: string;
  transactionNumber: string;
  amount: number;
  reason: string;
  method: string;
  status: string;
  createdAt: string;
  receiptId?: string | null;
  receiptNumber?: string | null;
  allocationTrace?: {
    mode: string;
    totalReceived: number;
    allocatedTotal: number;
    advanceBalance: number;
    lines: FinanceAllocationLine[];
  } | null;
  students: Array<{ id: string; fullName: string }>;
};

type StudentFinanceRow = {
  id: string;
  fullName: string;
  className?: string | null;
  annualFee?: number;
  gradeGroup?: string;
  paymentOptionType?: string;
  paymentOptionLabel?: string;
  planName?: string;
  agreementId?: string | null;
  expectedTotal: number;
  reductionTotal: number;
  originalAmount?: number;
  installments?: FinanceInstallment[];
  paid: number;
  balance: number;
  overdueInstallments: number;
  completionRate: number;
  reductions?: FinanceReduction[];
  agreements?: FinanceAgreement[];
  debts?: FinanceDebt[];
};

type StudentFinanceSnapshot = {
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
  students: StudentFinanceRow[];
  installments?: FinanceInstallment[];
  reductions?: FinanceReduction[];
  debts?: FinanceDebt[];
  agreements?: FinanceAgreement[];
  alerts?: FinanceAlert[];
  paymentHistory?: FinancePaymentHistory[];
};

type SharedDirectoryResponse = {
  source: string;
  visibility: string;
  counts: { families: number; parents: number; students: number; teachers: number };
  parents: SharedDirectoryParent[];
  students: SharedDirectoryStudent[];
};

type SchoolClass = { id: string; name: string };

type StudentFormState = {
  fullName: string;
  classId: string;
  parentId: string;
  annualFee: string;
};

const SCHOOL_SECTIONS: SchoolClass[] = [
  ...Array.from({ length: 3 }, (_v, index) => {
    const name = `K${index + 3}`;
    return { id: `section-${name.toLowerCase()}`, name };
  }),
  ...Array.from({ length: 12 }, (_v, index) => ({ id: `section-grade-${index + 1}`, name: `Grade ${index + 1}` }))
];

function getCanonicalSchoolClass(entry: SchoolClass): SchoolClass | null {
  const normalized = entry.name.trim().toLowerCase();
  const kindergarten = normalized.match(/\bk\s*([3-5])\b/) || entry.id.toLowerCase().match(/\bk\s*([3-5])\b/);
  if (kindergarten) return { ...entry, name: `K${kindergarten[1]}` };

  const grade = normalized.match(/\b(?:grade|g)\s*([1-9]|1[0-2])\b/) || entry.id.toLowerCase().match(/\b(?:grade|g)[-\s]*([1-9]|1[0-2])\b/);
  if (grade) return { ...entry, name: `Grade ${Number(grade[1])}` };

  return null;
}

function getSchoolClassOptions(classes: SchoolClass[]) {
  const byName = new Map<string, SchoolClass>();
  for (const fallbackClass of SCHOOL_SECTIONS) {
    const canonical = getCanonicalSchoolClass(fallbackClass);
    if (canonical) byName.set(canonical.name, canonical);
  }
  for (const classEntry of classes) {
    const canonical = getCanonicalSchoolClass(classEntry);
    if (canonical) byName.set(canonical.name, canonical);
  }

  return [...byName.values()].sort((a, b) => {
    const rank = (name: string) => {
      if (name.startsWith("K")) return Number(name.slice(1));
      const grade = name.match(/^Grade\s+([1-9]|1[0-2])$/);
      return grade ? 10 + Number(grade[1]) : 100;
    };
    return rank(a.name) - rank(b.name);
  });
}

function sortByFullName<T extends { fullName?: string; id?: string }>(items: T[] = []) {
  return [...items].sort((a, b) =>
    String(a.fullName || a.id || "").localeCompare(String(b.fullName || b.id || ""), "fr", { sensitivity: "base" })
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeDirectoryForUi(directory: SharedDirectoryResponse): SharedDirectoryResponse {
  const students = sortByFullName(directory.students ?? []);
  const parents = sortByFullName(directory.parents ?? []).map((parent) => ({
    ...parent,
    students: sortByFullName(parent.students ?? [])
  }));

  return {
    ...directory,
    parents,
    students,
    counts: {
      families: directory.counts?.families ?? parents.length,
      parents: directory.counts?.parents ?? parents.length,
      students: directory.counts?.students ?? students.length,
      teachers: directory.counts?.teachers ?? 0
    }
  };
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR");
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCurrency(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `$ ${value.toFixed(2)}` : "-";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dossier-élève";
}

function getInstallmentStatusTone(status: string, isOverdue: boolean) {
  if (isOverdue) return "border-red-500/30 bg-red-500/10 text-red-200";
  if (status === "PAID") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIALLY_PAID") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-700 bg-slate-900/40 text-ink-dim";
}

function getDebtStatusTone(status: string) {
  if (status === "CLEARED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIALLY_PAID") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "OVERDUE" || status === "OPEN") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-slate-700 bg-slate-900/40 text-ink-dim";
}

function getStudentFinanceData(snapshot: StudentFinanceSnapshot | null, student: SharedDirectoryStudent) {
  const financeStudent = snapshot?.students.find((entry) => entry.id === student.id) ?? null;
  const installments = financeStudent?.installments?.length
    ? financeStudent.installments
    : (snapshot?.installments ?? []).filter((installment) => installment.studentId === student.id);
  const reductions = financeStudent?.reductions?.length
    ? financeStudent.reductions
    : (snapshot?.reductions ?? []).filter((reduction) => reduction.studentId === student.id || reduction.studentName === student.fullName);
  const debts = financeStudent?.debts?.length
    ? financeStudent.debts
    : (snapshot?.debts ?? []).filter((debt) => debt.title.includes(student.fullName) || (debt.reason ?? "").includes(student.fullName));
  const agreements = financeStudent?.agreements?.length
    ? financeStudent.agreements
    : (snapshot?.agreements ?? []).filter((agreement) => {
      if (financeStudent?.agreementId) return agreement.id === financeStudent.agreementId;
      return agreement.title.toLowerCase().includes(student.fullName.toLowerCase());
    });
  const paymentHistory = (snapshot?.paymentHistory ?? []).filter((payment) =>
    payment.students.some((entry) => entry.id === student.id)
      || payment.allocationTrace?.lines.some((line) => line.studentId === student.id)
      || payment.reason.toLowerCase().includes(student.fullName.toLowerCase())
  );
  const alerts = (snapshot?.alerts ?? []).filter((alert) =>
    alert.message.toLowerCase().includes(student.fullName.toLowerCase())
      || alert.title.toLowerCase().includes(student.fullName.toLowerCase())
      || (snapshot?.students.length ?? 0) === 1
  );

  return { financeStudent, installments, reductions, debts, agreements, paymentHistory, alerts };
}

function buildStudentReportHtml(input: {
  student: SharedDirectoryStudent;
  parent?: SharedDirectoryParent;
  snapshot: StudentFinanceSnapshot | null;
}) {
  const { student, parent, snapshot } = input;
  const brand = schoolBranding;
  const generatedAt = new Date();
  const documentReference = escapeHtml(`KCS-STU-${generatedAt.toISOString().slice(0, 10)}-${(student.displayId || student.studentNumber || student.id).replace(/[^A-Za-z0-9-]/g, "")}`);
  const logoSrc = escapeHtml(new URL(brand.logoSrc, window.location.href).toString());
  const { financeStudent, installments, reductions, debts, agreements, paymentHistory, alerts } = getStudentFinanceData(snapshot, student);

  const installmentRows = installments.length
    ? installments.map((installment) => `
      <tr>
        <td>${escapeHtml(installment.label)}</td>
        <td>${escapeHtml(formatDateLabel(installment.dueDate))}</td>
        <td>${escapeHtml(installment.periodKey || "-")}</td>
        <td>${escapeHtml(formatCurrency(installment.amountDue))}</td>
        <td>${escapeHtml(formatCurrency(installment.amountPaid))}</td>
        <td>${escapeHtml(formatCurrency(installment.balance))}</td>
        <td>${escapeHtml(installment.status)}</td>
      </tr>`).join("")
    : `<tr><td colspan="7">Aucune échéance générée.</td></tr>`;

  const paymentRows = paymentHistory.length
    ? paymentHistory.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.transactionNumber)}</td>
        <td>${escapeHtml(payment.reason)}</td>
        <td>${escapeHtml(payment.method)}</td>
        <td>${escapeHtml(payment.status)}</td>
        <td>${escapeHtml(formatCurrency(payment.amount))}</td>
        <td>${escapeHtml(formatDateTimeLabel(payment.createdAt))}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">Aucun paiement rattaché à cet élève.</td></tr>`;

  const reductionRows = reductions.length
    ? reductions.map((reduction) => `
      <tr>
        <td>${escapeHtml(reduction.title)}</td>
        <td>${escapeHtml(reduction.source || reduction.scope || "-")}</td>
        <td>${escapeHtml(reduction.percentage ? `${reduction.percentage}%` : "-")}</td>
        <td>${escapeHtml(formatCurrency(reduction.amount))}</td>
        <td>${escapeHtml(formatDateLabel(reduction.effectiveDate))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">Aucune réduction enregistrée.</td></tr>`;

  const debtRows = debts.length
    ? debts.map((debt) => `
      <tr>
        <td>${escapeHtml(debt.title)}</td>
        <td>${escapeHtml(debt.reason || "-")}</td>
        <td>${escapeHtml(formatCurrency(debt.originalAmount))}</td>
        <td>${escapeHtml(formatCurrency(debt.amountRemaining))}</td>
        <td>${escapeHtml(debt.status)}</td>
        <td>${escapeHtml(formatDateLabel(debt.dueDate))}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">Aucune dette dédiée à cet élève.</td></tr>`;

  const agreementRows = agreements.length
    ? agreements.map((agreement) => `
      <tr>
        <td>${escapeHtml(agreement.title)}</td>
        <td>${escapeHtml(agreement.paymentOptionType || "-")}</td>
        <td>${escapeHtml(formatCurrency(agreement.customTotal))}</td>
        <td>${escapeHtml(formatCurrency(agreement.reductionAmount))}</td>
        <td>${escapeHtml(agreement.status)}</td>
        <td>${escapeHtml(formatDateTimeLabel(agreement.approvedAt || agreement.createdAt))}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">Aucun accord spécial enregistré.</td></tr>`;

  const alertRows = alerts.length
    ? alerts.map((alert) => `
      <div class="alert alert-${escapeHtml(alert.severity.toLowerCase())}">
        <strong>${escapeHtml(alert.title)}</strong>
        <p>${escapeHtml(alert.message)}</p>
        <span>${escapeHtml(formatDateTimeLabel(alert.createdAt))}</span>
      </div>`).join("")
    : `<div class="alert alert-neutral"><strong>Suivi</strong><p>Aucune alerte financière spécifique pour cet élève.</p><span>-</span></div>`;

  return `<!DOCTYPE html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(brand.schoolName)} - Dossier élève - ${escapeHtml(student.fullName)}</title>
      <style>
        :root {
          --brand-primary: ${brand.colors.primary};
          --brand-secondary: ${brand.colors.secondary};
          --brand-accent: ${brand.colors.accent};
          --brand-surface: ${brand.colors.surface};
          --ink: #0f172a;
          --muted: #64748b;
          --line: #cbd5e1;
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 28px; font-family: "Segoe UI", Arial, sans-serif; color: var(--ink); background: linear-gradient(180deg, #fff, var(--brand-surface)); }
        .watermark { position: fixed; right: 18px; bottom: 28px; width: 220px; opacity: 0.06; filter: grayscale(100%); }
        .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; color: var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:0.16em; }
        .topbar strong { color: var(--brand-primary); }
        .header { display: flex; justify-content: space-between; gap: 24px; border-radius: 20px; padding: 20px 22px; color: white; background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary)); }
        .header-brand { display: flex; gap: 16px; align-items: center; }
        .header-logo { width: 76px; height: 76px; border-radius: 22px; background: white; padding: 8px; object-fit: contain; }
        .eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.72); }
        .school-name { margin: 6px 0 0; font-size: 28px; font-weight: 800; }
        .school-meta { margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.88); }
        .report-box { min-width: 240px; border-radius: 16px; padding: 14px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.16); }
        .report-box strong { display: block; margin-top: 8px; font-size: 20px; }
        .panel { margin-top: 18px; border: 1px solid rgba(148,163,184,0.28); border-radius: 18px; padding: 18px; background: rgba(255,255,255,0.94); }
        .panel h2 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand-primary); }
        .summary-grid, .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .summary-grid div, .meta-grid div { border: 1px solid rgba(143,183,232,0.42); border-radius: 14px; padding: 12px; background: linear-gradient(180deg, rgba(248,251,255,0.98), rgba(232,241,252,0.88)); }
        .summary-grid span, .meta-grid span { display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); }
        .summary-grid strong, .meta-grid strong { display: block; margin-top: 6px; font-size: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid var(--line); padding: 9px; text-align: left; font-size: 12px; vertical-align: top; }
        th { background: linear-gradient(180deg, rgba(11,46,89,0.08), rgba(31,79,143,0.04)); color: var(--brand-primary); text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
        .alerts { display: grid; gap: 12px; }
        .alert { border-radius: 14px; padding: 14px; border: 1px solid var(--line); background: #f8fafc; }
        .alert strong { display: block; }
        .alert p { margin: 8px 0; font-size: 13px; }
        .alert span { color: var(--muted); font-size: 11px; }
        .alert-high { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); }
        .alert-medium { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
        .footer { margin-top: 18px; display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: var(--muted); }
        .compliance { margin-top: 16px; border: 1px solid rgba(15, 118, 110, 0.2); border-left: 5px solid #0f766e; border-radius: 14px; background: rgba(240, 253, 250, 0.96); padding: 12px 14px; color: #134e4a; font-size: 11px; line-height: 1.5; }
        .signatures { margin-top: 16px; display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:16px; }
        .signature-box { min-height:82px; border:1px dashed rgba(11,46,89,0.24); border-radius:14px; background: rgba(255,255,255,0.88); padding:12px; }
        .signature-title { font-size:10px; text-transform:uppercase; letter-spacing:0.14em; font-weight:800; color:var(--muted); }
        .signature-line { margin-top:38px; border-top:1px solid rgba(11,46,89,0.24); padding-top:6px; font-size:11px; color:var(--brand-primary); font-weight:700; }
      </style>
    </head>
    <body>
      <img class="watermark" src="${logoSrc}" alt="" />
      <div class="topbar"><span><strong>${escapeHtml(brand.shortName)}</strong> · dossier administratif élève</span><span>Référence ${documentReference}</span></div>
      <div class="header">
        <div class="header-brand">
          <img class="header-logo" src="${logoSrc}" alt="Logo ${escapeHtml(brand.schoolName)}" />
          <div>
            <div class="eyebrow">Dossier financier élève</div>
            <div class="school-name">${escapeHtml(brand.schoolName)}</div>
            <div class="school-meta">${escapeHtml(brand.tagline)} · ${escapeHtml(brand.appName)} · ${escapeHtml(brand.shortName)}</div>
          </div>
        </div>
        <div class="report-box">
          <div class="eyebrow">Élève</div>
          <strong>${escapeHtml(student.fullName)}</strong>
          <div class="school-meta">ID ${escapeHtml(student.displayId || student.studentNumber || student.id)}</div>
          <div class="school-meta">Émis le ${escapeHtml(generatedAt.toLocaleString("fr-FR"))}</div>
        </div>
      </div>
      <section class="panel">
        <h2>Identité et rattachement</h2>
        <div class="meta-grid">
          <div><span>Classe</span><strong>${escapeHtml(student.className || student.classId || "-")}</strong></div>
          <div><span>Parent</span><strong>${escapeHtml(parent?.fullName || "-")}</strong></div>
          <div><span>Téléphone parent</span><strong>${escapeHtml(parent?.phone || "-")}</strong></div>
          <div><span>Inscription</span><strong>${escapeHtml(formatDateTimeLabel(student.createdAt))}</strong></div>
        </div>
      </section>
      <section class="panel">
        <h2>Résumé financier</h2>
        <div class="summary-grid">
          <div><span>Total attendu</span><strong>${escapeHtml(formatCurrency(financeStudent?.expectedTotal ?? student.annualFeeDisplay ?? student.annualFee ?? null))}</strong></div>
          <div><span>Réduction</span><strong>${escapeHtml(formatCurrency(financeStudent?.reductionTotal ?? student.reductionTotal ?? null))}</strong></div>
          <div><span>Montant payé</span><strong>${escapeHtml(formatCurrency(financeStudent?.paid ?? 0))}</strong></div>
          <div><span>Solde</span><strong>${escapeHtml(formatCurrency(financeStudent?.balance ?? 0))}</strong></div>
          <div><span>Plan</span><strong>${escapeHtml(financeStudent?.planName || student.tuitionPlanName || "-")}</strong></div>
          <div><span>Option</span><strong>${escapeHtml(financeStudent?.paymentOptionLabel || financeStudent?.paymentOptionType || student.paymentOptionType || "-")}</strong></div>
          <div><span>Échéances en retard</span><strong>${escapeHtml(String(financeStudent?.overdueInstallments ?? 0))}</strong></div>
          <div><span>Taux de completion</span><strong>${escapeHtml(`${(financeStudent?.completionRate ?? 0).toFixed(1)}%`)}</strong></div>
        </div>
      </section>
      <section class="panel"><h2>Échéancier détaillé</h2><table><thead><tr><th>Échéance</th><th>Date</th><th>Période</th><th>Montant dû</th><th>Payé</th><th>Solde</th><th>Statut</th></tr></thead><tbody>${installmentRows}</tbody></table></section>
      <section class="panel"><h2>Historique des paiements</h2><table><thead><tr><th>Transaction</th><th>Motif</th><th>Méthode</th><th>Statut</th><th>Montant</th><th>Date</th></tr></thead><tbody>${paymentRows}</tbody></table></section>
      <section class="panel"><h2>Réductions et remises</h2><table><thead><tr><th>Libellé</th><th>Source</th><th>Taux</th><th>Montant</th><th>Date</th></tr></thead><tbody>${reductionRows}</tbody></table></section>
      <section class="panel"><h2>Accords spéciaux</h2><table><thead><tr><th>Accord</th><th>Option</th><th>Total</th><th>Réduction</th><th>Statut</th><th>Date</th></tr></thead><tbody>${agreementRows}</tbody></table></section>
      <section class="panel"><h2>Dettes et reports</h2><table><thead><tr><th>Ligne</th><th>Motif</th><th>Montant initial</th><th>Reste à payer</th><th>Statut</th><th>Échéance</th></tr></thead><tbody>${debtRows}</tbody></table></section>
      <section class="panel"><h2>Alertes financières</h2><div class="alerts">${alertRows}</div></section>
      <div class="compliance">Ce dossier reprend l'état académique et financier détaillé de l'élève tel qu'affiché dans EduPay. Il est édité selon la charte ${escapeHtml(brand.shortName)} pour contrôle, suivi et archivage.</div>
      <div class="signatures"><div class="signature-box"><div class="signature-title">Validation scolaire</div><div class="signature-line">Direction des études</div></div><div class="signature-box"><div class="signature-title">Visa financier</div><div class="signature-line">Service comptable</div></div></div>
      <div class="footer"><span>Document officiel ${escapeHtml(brand.appName)} généré pour ${escapeHtml(brand.schoolName)}.</span><span>Année académique ${escapeHtml(snapshot?.academicYear.name || "-")} · ${escapeHtml(generatedAt.toLocaleString("fr-FR"))}</span></div>
    </body>
  </html>`;
}

async function mountStudentReportFrame(student: SharedDirectoryStudent, parent: SharedDirectoryParent | undefined, snapshot: StudentFinanceSnapshot | null) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1024px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";
  document.body.appendChild(frame);

  return new Promise<HTMLIFrameElement>((resolve, reject) => {
    frame.onload = () => resolve(frame);
    frame.onerror = () => {
      frame.remove();
      reject(new Error("Impossible de préparer le document élève."));
    };
    frame.srcdoc = buildStudentReportHtml({ student, parent, snapshot });
  });
}

async function exportStudentReportPdf(student: SharedDirectoryStudent, parent: SharedDirectoryParent | undefined, snapshot: StudentFinanceSnapshot | null) {
  const frame = await mountStudentReportFrame(student, parent, snapshot);

  try {
    const body = frame.contentDocument?.body;
    if (!body) throw new Error("Document PDF élève introuvable.");

    await exportElementToPdf(body, {
      filename: `dossier-élève-${slugify(student.fullName)}-${new Date().toISOString().slice(0, 10)}.pdf`,
      backgroundColor: "#ffffff",
      width: Math.max(body.scrollWidth, 1024),
      height: body.scrollHeight,
      windowWidth: Math.max(body.scrollWidth, 1024),
      windowHeight: body.scrollHeight,
    });
  } finally {
    frame.remove();
  }
}

function printStudentReport(student: SharedDirectoryStudent, parent: SharedDirectoryParent | undefined, snapshot: StudentFinanceSnapshot | null) {
  printHtmlDocument(buildStudentReportHtml({ student, parent, snapshot }));
}

function exportStudentReportExcel(student: SharedDirectoryStudent, parent: SharedDirectoryParent | undefined, snapshot: StudentFinanceSnapshot | null) {
  const { financeStudent, installments, reductions, debts, agreements, paymentHistory, alerts } = getStudentFinanceData(snapshot, student);
  exportWorkbook(`dossier-élève-${slugify(student.fullName)}-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Résumé",
      rows: [{
        "ID Élève": student.displayId || student.studentNumber || student.id,
        "Nom complet": student.fullName,
        "Classe": student.className || student.classId,
        "Parent": parent?.fullName || "-",
        "Téléphone parent": parent?.phone || "-",
        "Date inscription": formatDateTimeLabel(student.createdAt),
        "Plan": financeStudent?.planName || student.tuitionPlanName || "-",
        "Option de paiement": financeStudent?.paymentOptionLabel || financeStudent?.paymentOptionType || student.paymentOptionType || "-",
        "Montant initial": financeStudent?.originalAmount ?? student.originalAnnualFee ?? student.annualFee ?? null,
        "Total attendu": financeStudent?.expectedTotal ?? student.annualFeeDisplay ?? student.annualFee ?? null,
        "Réduction": financeStudent?.reductionTotal ?? student.reductionTotal ?? null,
        "Payé": financeStudent?.paid ?? 0,
        "Solde": financeStudent?.balance ?? 0,
        "Échéances en retard": financeStudent?.overdueInstallments ?? 0,
        "Taux de completion": financeStudent?.completionRate ?? 0,
        "Année académique": snapshot?.academicYear.name ?? "-",
      }]
    },
    {
      name: "Échéances",
      rows: installments.map((installment) => ({
        "Libellé": installment.label,
        "Période": installment.periodKey || "-",
        "Date échéance": formatDateLabel(installment.dueDate),
        "Montant dû": installment.amountDue,
        "Montant payé": installment.amountPaid,
        "Solde": installment.balance,
        "Statut": installment.status,
        "En retard": installment.isOverdue ? "Oui" : "Non",
      }))
    },
    {
      name: "Paiements",
      rows: paymentHistory.map((payment) => ({
        "Transaction": payment.transactionNumber,
        "Motif": payment.reason,
        "Méthode": payment.method,
        "Statut": payment.status,
        "Montant": payment.amount,
        "Date": formatDateTimeLabel(payment.createdAt),
        "Reçu": payment.receiptNumber || "-",
      }))
    },
    {
      name: "Réductions",
      rows: reductions.map((reduction) => ({
        "Libellé": reduction.title,
        "Source": reduction.source || reduction.scope || "-",
        "Pourcentage": reduction.percentage ?? null,
        "Montant": reduction.amount,
        "Date": formatDateLabel(reduction.effectiveDate),
      }))
    },
    {
      name: "Dettes",
      rows: debts.map((debt) => ({
        "Ligne": debt.title,
        "Motif": debt.reason || "-",
        "Montant initial": debt.originalAmount,
        "Reste à payer": debt.amountRemaining,
        "Statut": debt.status,
        "Échéance": formatDateLabel(debt.dueDate),
        "Créée le": formatDateTimeLabel(debt.createdAt),
      }))
    },
    {
      name: "Accords et alertes",
      rows: [
        ...agreements.map((agreement) => ({
          "Type": "Accord",
          "Titre": agreement.title,
          "Détail": agreement.notes || agreement.paymentOptionType || "-",
          "Montant": agreement.customTotal,
          "Statut": agreement.status,
          "Date": formatDateTimeLabel(agreement.approvedAt || agreement.createdAt),
        })),
        ...alerts.map((alert) => ({
          "Type": "Alerte",
          "Titre": alert.title,
          "Détail": alert.message,
          "Montant": null,
          "Statut": alert.severity,
          "Date": formatDateTimeLabel(alert.createdAt),
        }))
      ]
    }
  ]);
}

function StudentDetailModal({ student, parent, onClose }: { student: SharedDirectoryStudent; parent?: SharedDirectoryParent; onClose: () => void }) {
  const displayedAnnualFee = typeof student.annualFeeDisplay === "number" ? student.annualFeeDisplay : student.annualFee;
  const originalAnnualFee = typeof student.originalAnnualFee === "number" ? student.originalAnnualFee : student.annualFee;
  const reductionTotal = typeof student.reductionTotal === "number" ? student.reductionTotal : 0;
  const registrationDate = student.createdAt
    ? new Date(student.createdAt).toLocaleString("fr-FR")
    : "Date non renseignée";
  const [financeSnapshot, setFinanceSnapshot] = useState<StudentFinanceSnapshot | null>(null);
  const [financeLoading, setFinanceLoading] = useState(Boolean(parent?.id));
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);

  useEffect(() => {
    if (!parent?.id) {
      setFinanceLoading(false);
      setFinanceSnapshot(null);
      setFinanceError("Aucun parent associé à cet élève.");
      return;
    }

    let active = true;
    setFinanceLoading(true);
    setFinanceError(null);
    void api<StudentFinanceSnapshot>(`/api/finance/parents/${parent.id}/profile`)
      .then((snapshot) => {
        if (!active) return;
        setFinanceSnapshot(snapshot);
      })
      .catch((error) => {
        if (!active) return;
        setFinanceError(error instanceof Error ? error.message : "Impossible de charger le dossier financier de l'élève.");
      })
      .finally(() => {
        if (active) setFinanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [parent?.id]);

  const { financeStudent, installments, reductions, debts, agreements, paymentHistory, alerts } = useMemo(
    () => getStudentFinanceData(financeSnapshot, student),
    [financeSnapshot, student]
  );
  const exportDisabled = financeLoading || Boolean(financeError) || !financeStudent || pdfExporting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-5 sm:py-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="edupay-dialog-panel-xl relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl animate-fadeInUp"
        onClick={(event) => event.stopPropagation()}
      >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-ink-dim shadow-lg backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </button>
        <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-white/10 bg-slate-950/90 px-6 py-5 pr-14 backdrop-blur-xl sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Fiche élève</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">{student.fullName}</h2>
            <p className="mt-1 text-sm text-ink-dim">Traçabilité complète du dossier financier, des échéances, des paiements et des alertes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPdfExporting(true);
                void exportStudentReportPdf(student, parent, financeSnapshot).finally(() => setPdfExporting(false));
              }}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" /> {pdfExporting ? "PDF..." : "PDF"}
            </button>
            <button
              type="button"
              onClick={() => printStudentReport(student, parent, financeSnapshot)}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Impression
            </button>
            <button
              type="button"
              onClick={() => exportStudentReportExcel(student, parent, financeSnapshot)}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        </div>
        <div className="edupay-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">ID élève</p>
            <p className="mt-1 break-words font-mono text-sm font-bold text-cyan-200">{student.displayId || student.studentNumber || student.id}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Classe</p>
            <p className="mt-1 font-semibold text-white">{student.className || student.classId || "Classe non renseignee"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Parent</p>
            <p className="mt-1 font-semibold text-white">{parent?.fullName || "Parent non retrouvé"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Inscription</p>
            <p className="mt-1 font-semibold text-white">{registrationDate}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Frais annuels</p>
            <p className="mt-1 font-mono font-bold text-emerald-300">{typeof displayedAnnualFee === "number" ? `$ ${displayedAnnualFee.toFixed(2)}` : "-"}</p>
            {student.tuitionPlanName ? <p className="mt-1 text-xs text-cyan-200">{student.tuitionPlanName}</p> : null}
            {typeof originalAnnualFee === "number" && reductionTotal > 0 ? <p className="mt-1 text-xs text-amber-200">Base $ {originalAnnualFee.toFixed(2)} · Reduction $ {reductionTotal.toFixed(2)}</p> : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">Total attendu</p>
            <p className="mt-1 font-mono font-bold text-white">{formatCurrency(financeStudent?.expectedTotal ?? displayedAnnualFee ?? null)}</p>
            <p className="mt-1 text-xs text-ink-dim">Payé {formatCurrency(financeStudent?.paid ?? 0)} · Solde {formatCurrency(financeStudent?.balance ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-ink-dim">État du dossier</p>
            <p className="mt-1 font-semibold text-white">{(financeStudent?.completionRate ?? 0).toFixed(1)}% de completion</p>
            <p className="mt-1 text-xs text-ink-dim">{financeStudent?.overdueInstallments ?? 0} échéance(s) en retard</p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {financeLoading ? (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-sm text-cyan-100">Chargement du dossier financier de l'élève...</div>
          ) : financeError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{financeError}</div>
          ) : !financeStudent ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Aucune ligne financière détaillée n'a été trouvée pour cet élève.</div>
          ) : (
            <>
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Échéancier détaillé</p>
                      <p className="mt-1 text-sm text-ink-dim">Chaque échéance, son statut, son reste à payer et sa date limite.</p>
                    </div>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.12em] text-ink-dim">
                          <th className="px-3 py-3">Libellé</th>
                          <th className="px-3 py-3">Date</th>
                          <th className="px-3 py-3">Montant dû</th>
                          <th className="px-3 py-3">Payé</th>
                          <th className="px-3 py-3">Solde</th>
                          <th className="px-3 py-3">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.length === 0 ? (
                          <tr><td colSpan={6} className="px-3 py-4 text-sm text-ink-dim">Aucune échéance enregistrée.</td></tr>
                        ) : installments.map((installment) => (
                          <tr key={installment.id} className="border-b border-white/5">
                            <td className="px-3 py-3 text-white">{installment.label}<p className="mt-1 text-xs text-ink-dim">{installment.periodKey || "Période non renseignée"}</p></td>
                            <td className="px-3 py-3 text-ink-dim">{formatDateLabel(installment.dueDate)}</td>
                            <td className="px-3 py-3 font-mono text-white">{formatCurrency(installment.amountDue)}</td>
                            <td className="px-3 py-3 font-mono text-emerald-300">{formatCurrency(installment.amountPaid)}</td>
                            <td className="px-3 py-3 font-mono text-amber-200">{formatCurrency(installment.balance)}</td>
                            <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getInstallmentStatusTone(installment.status, installment.isOverdue)}`}>{installment.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Traçabilité des paiements</p>
                    <div className="mt-4 space-y-3">
                      {paymentHistory.length === 0 ? (
                        <p className="text-sm text-ink-dim">Aucun paiement rattaché à cet élève.</p>
                      ) : paymentHistory.map((payment) => (
                        <div key={payment.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{payment.reason}</p>
                              <p className="mt-1 text-xs text-ink-dim">{payment.transactionNumber} · {formatDateTimeLabel(payment.createdAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-lg font-bold text-emerald-300">{formatCurrency(payment.amount)}</p>
                              <p className="mt-1 text-xs text-ink-dim">{payment.method} · {payment.status}</p>
                            </div>
                          </div>
                          {payment.allocationTrace?.lines?.filter((line) => line.studentId === student.id).length ? (
                            <div className="mt-3 space-y-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                              {payment.allocationTrace.lines.filter((line) => line.studentId === student.id).map((line, index) => (
                                <div key={`${payment.id}-${line.installmentId || index}`} className="flex items-center justify-between gap-3 text-xs text-ink-dim">
                                  <span>{line.label} · {formatDateLabel(line.dueDate)}</span>
                                  <span className="font-mono text-cyan-200">Alloué {formatCurrency(line.allocated)} · Reste {formatCurrency(line.outstandingAfter)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Réductions et accords</p>
                    <div className="mt-4 space-y-3">
                      {reductions.map((reduction) => (
                        <div key={reduction.id} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{reduction.title}</p>
                              <p className="mt-1 text-xs text-ink-dim">{reduction.source || reduction.scope || "Remise"} · {formatDateLabel(reduction.effectiveDate)}</p>
                            </div>
                            <p className="font-mono text-sm font-bold text-amber-200">{formatCurrency(reduction.amount)}</p>
                          </div>
                        </div>
                      ))}
                      {agreements.map((agreement) => (
                        <div key={agreement.id} className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                          <p className="font-semibold text-white">{agreement.title}</p>
                          <p className="mt-1 text-xs text-ink-dim">{agreement.paymentOptionType || "Accord spécial"} · {agreement.status}</p>
                          <p className="mt-2 text-sm text-cyan-100">Total {formatCurrency(agreement.customTotal)} · Réduction {formatCurrency(agreement.reductionAmount)} · Solde {formatCurrency(agreement.balanceDue)}</p>
                        </div>
                      ))}
                      {reductions.length === 0 && agreements.length === 0 ? <p className="text-sm text-ink-dim">Aucune réduction ni accord spécial enregistré.</p> : null}
                    </div>
                  </div>
                </section>
              </div>

              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Dettes et reports</p>
                  <div className="mt-4 space-y-3">
                    {debts.length === 0 ? (
                      <p className="text-sm text-ink-dim">Aucune dette spécifique trouvée pour cet élève.</p>
                    ) : debts.map((debt) => (
                      <div key={debt.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{debt.title}</p>
                            <p className="mt-1 text-xs text-ink-dim">{debt.reason || debt.academicYearName || debt.academicYearId}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getDebtStatusTone(debt.status)}`}>{debt.status}</span>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div><p className="text-xs text-ink-dim">Montant initial</p><p className="mt-1 font-mono font-bold text-white">{formatCurrency(debt.originalAmount)}</p></div>
                          <div><p className="text-xs text-ink-dim">Reste à payer</p><p className="mt-1 font-mono font-bold text-amber-200">{formatCurrency(debt.amountRemaining)}</p></div>
                          <div><p className="text-xs text-ink-dim">Échéance</p><p className="mt-1 font-semibold text-white">{formatDateLabel(debt.dueDate)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Alertes et suivi</p>
                  <div className="mt-4 space-y-3">
                    {alerts.length === 0 ? (
                      <p className="text-sm text-ink-dim">Aucune alerte spécifique pour cet élève.</p>
                    ) : alerts.map((alert) => (
                      <div key={alert.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full bg-amber-500/10 p-2 text-amber-200"><AlertCircle className="h-4 w-4" /></div>
                          <div>
                            <p className="font-semibold text-white">{alert.title}</p>
                            <p className="mt-1 text-sm text-ink-dim">{alert.message}</p>
                            <p className="mt-2 text-xs text-ink-dim">{alert.severity} · {formatDateTimeLabel(alert.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function StudentEditModal({
  student,
  parent,
  parents,
  classes,
  saving,
  onSave,
  onClose
}: {
  student: SharedDirectoryStudent;
  parent?: SharedDirectoryParent;
  parents: SharedDirectoryParent[];
  classes: SchoolClass[];
  saving: boolean;
  onSave: (state: StudentFormState) => Promise<void>;
  onClose: () => void;
}) {
  const classOptions = useMemo(() => getSchoolClassOptions(classes), [classes]);
  const [form, setForm] = useState<StudentFormState>({
    fullName: student.fullName,
    classId: student.classId || "",
    parentId: parent?.id || student.parentId || "",
    annualFee: typeof student.annualFee === "number" ? String(student.annualFee) : ""
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="edupay-dialog-panel-md relative w-full rounded-2xl border border-white/10 glass p-6 shadow-2xl sm:p-7">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-ink-dim hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-10 font-display text-2xl font-bold text-white">Modifier l'élève</h2>
        <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); void onSave(form); }}>
          <input className="input" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nom complet" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select className="input" value={form.classId} onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))} required>
              <option value="">Classe</option>
              <optgroup label="Maternelle">
                {classOptions.filter((item) => item.name.startsWith("K")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
              <optgroup label="G1 - G12">
                {classOptions.filter((item) => item.name.startsWith("G")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            </select>
            <input className="input" type="number" min="0" step="0.01" value={form.annualFee} onChange={(event) => setForm((current) => ({ ...current, annualFee: event.target.value }))} placeholder="Frais annuels" required />
          </div>
          <select className="input" value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))} required>
            <option value="">Parent</option>
            {parents.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
          </select>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-60">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentDeleteModal({ student, deleting, onConfirm, onClose }: { student: SharedDirectoryStudent; deleting: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="edupay-dialog-panel-sm relative w-full rounded-2xl border border-danger/30 glass p-6 shadow-2xl sm:p-7">
        <h2 className="font-display text-xl font-bold text-white">Supprimer l'élève</h2>
        <p className="mt-3 text-sm text-ink-dim">Cette action supprimera {student.fullName} de la liste des élèves.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">Annuler</button>
          <button type="button" onClick={() => void onConfirm()} disabled={deleting} className="flex-1 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentsDirectoryPage() {
  const [directory, setDirectory] = useState<SharedDirectoryResponse | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<SharedDirectoryStudent | null>(null);
  const [editTarget, setEditTarget] = useState<SharedDirectoryStudent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SharedDirectoryStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setApiError(null);

    const [directoryResult, classesResult] = await Promise.allSettled([
      withTimeout(api<SharedDirectoryResponse>("/api/shared-directory"), 4500, "shared-directory"),
      api<SchoolClass[]>("/api/classes")
    ]);

    if (directoryResult.status === "fulfilled") {
      setDirectory(normalizeDirectoryForUi(directoryResult.value));
    } else {
      setApiError(directoryResult.reason instanceof Error ? directoryResult.reason.message : "Impossible de charger l'annuaire des élèves.");
    }

    setClasses(classesResult.status === "fulfilled" && classesResult.value.length ? classesResult.value : SCHOOL_SECTIONS);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const parentByStudentId = useMemo(() => {
    const lookup = new Map<string, SharedDirectoryParent>();
    for (const parent of directory?.parents ?? []) {
      for (const student of parent.students ?? []) {
        lookup.set(student.id, parent);
      }
    }
    return lookup;
  }, [directory]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const students = directory?.students ?? [];
    if (!query) return students;

    return students.filter((student) => {
      const parent = parentByStudentId.get(student.id);
      const haystack = [
        student.fullName,
        student.displayId,
        student.studentNumber,
        student.externalStudentId,
        student.className,
        student.classId,
        parent?.fullName,
        parent?.phone,
        parent?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [directory, parentByStudentId, search]);

  const handleUpdateStudent = async (state: StudentFormState) => {
    if (!editTarget) return;
    try {
      setSaving(true);
      setApiError(null);
      const updated = await api<{ notificationStatus?: { dashboard?: string; email?: string; sms?: string; adminEmail?: string } }>(`/api/students/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: state.fullName,
          classId: state.classId,
          className: getSchoolClassOptions(classes).find((item) => item.id === state.classId)?.name || "",
          parentId: state.parentId,
          annualFee: Number(state.annualFee)
        })
      });
      setMutationNotice([
        `Le dossier élève de ${state.fullName} a été modifié avec succès.`,
        "EduPay a synchronisé le registre partagé quand il est actif.",
        `Compte parent : ${updated.notificationStatus?.dashboard ?? "OPEN"}`,
        `E-mail parent : ${updated.notificationStatus?.email ?? "SKIPPED"}`,
        `SMS parent : ${updated.notificationStatus?.sms ?? "SKIPPED"}`,
        `E-mail administrateur : ${updated.notificationStatus?.adminEmail ?? "SKIPPED"}`,
      ].join("\n"));
      setEditTarget(null);
      await load();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de modifier l'élève.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setApiError(null);
      await api(`/api/students/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de supprimer l'élève.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {mutationNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => setMutationNotice(null)}>
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
          <section className="relative w-full max-w-lg rounded-2xl border border-emerald-400/30 bg-slate-950 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Modification synchronisée</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">Notification envoyée</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-900/70 p-4 text-sm text-emerald-50">{mutationNotice}</pre>
            <button type="button" onClick={() => setMutationNotice(null)} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Compris</button>
          </section>
        </div>
      )}
      {viewTarget && <StudentDetailModal student={viewTarget} parent={parentByStudentId.get(viewTarget.id)} onClose={() => setViewTarget(null)} />}
      {editTarget && (
        <StudentEditModal
          student={editTarget}
          parent={parentByStudentId.get(editTarget.id)}
          parents={directory?.parents ?? []}
          classes={classes}
          saving={saving}
          onSave={handleUpdateStudent}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && <StudentDeleteModal student={deleteTarget} deleting={deleting} onConfirm={handleDeleteStudent} onClose={() => setDeleteTarget(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-4 animate-fadeInDown">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Annuaire des élèves</h1>
          <p className="mt-1 text-ink-dim">
            Liste centralisée des élèves venant du registre partage Orbit via Savanex, comme pour les parents.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-right">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Source</p>
          <p className="mt-1 text-sm font-semibold text-white">{directory?.source ?? "Chargement..."}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-fadeInUp">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Eleves</p>
          <p className="mt-1 font-display text-3xl font-bold text-cyan-300">{directory?.counts.students ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Parents</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-300">{directory?.counts.parents ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Familles</p>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-300">{directory?.counts.families ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-dim">Resultats</p>
          <p className="mt-1 font-display text-3xl font-bold text-white">{filteredStudents.length}</p>
        </div>
      </div>

      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un élève, une classe, un parent ou un identifiant..." wrapperClassName="animate-fadeInUp" />

      {apiError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {apiError}
        </div>
      )}

      <div className="card !p-0 overflow-hidden animate-fadeInUp">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-ink-dim">Aucun élève trouvé.</div>
        ) : (
          <div className="edupay-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/40">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">ID élève</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Nom complet</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Classe</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Parent</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Frais annuels</th>
                  <th className="px-5 py-4 text-center text-xs font-bold uppercase tracking-[0.1em] text-ink-dim">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => {
                  const parent = parentByStudentId.get(student.id);
                  const displayedAnnualFee = typeof student.annualFeeDisplay === "number" ? student.annualFeeDisplay : student.annualFee;
                  return (
                    <tr key={student.id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors" style={{ animationDelay: `${index * 0.03}s` }}>
                      <td className="px-5 py-4">
                        <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-xs font-bold text-cyan-200">
                          {student.displayId || student.studentNumber || student.id}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">{student.fullName}</p>
                        <p className="text-xs text-ink-dim">Inscrit le {student.createdAt ? new Date(student.createdAt).toLocaleString("fr-FR") : "-"}</p>
                        <p className="text-xs text-ink-dim">{student.externalStudentId || student.id}</p>
                      </td>
                      <td className="px-5 py-4 text-ink-dim">{student.className || student.classId || "Classe non renseignee"}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">{parent?.fullName || "Parent non retrouvé"}</p>
                        <p className="text-xs text-ink-dim">{parent?.phone || parent?.email || "Aucun contact"}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-300">
                        {typeof displayedAnnualFee === "number" ? `$ ${displayedAnnualFee.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => setViewTarget(student)} className="rounded-lg bg-slate-700/50 p-2 text-ink-dim transition-all hover:bg-slate-600/50 hover:text-white" title="Voir">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setEditTarget(student)} className="rounded-lg bg-brand-500/20 p-2 text-brand-300 transition-all hover:bg-brand-500/30" title="Modifier">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteTarget(student)} className="rounded-lg bg-danger/20 p-2 text-danger transition-all hover:bg-danger/30" title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
