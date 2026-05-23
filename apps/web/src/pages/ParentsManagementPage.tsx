import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { SearchField } from "../components/SearchField";
import { schoolBranding } from "../config/branding";
import { api } from "../services/api";
import { exportWorkbook } from "../utils/financeExcel";
import { exportElementToPdf } from "../utils/pdfDocument";
import { printHtmlDocument } from "../utils/printDocument";

/* ─── Types ─────────────────────────────────────────────────────── */
type Student = {
  id: string;
  displayId?: string;
  fullName: string;
  gender?: "F" | "M" | "O" | "";
  classId: string;
  className: string;
  annualFee: number;
  createdAt?: string;
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
  physicalAddress?: string;
  photoUrl?: string;
  preferredLanguage?: "fr" | "en";
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

type SpecialAgreementInstallmentMode = "ONE_TIME" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS";

type SpecialAgreementDraft = {
  title: string;
  customTotal: string;
  reductionAmount: string;
  notes: string;
  installmentMode: SpecialAgreementInstallmentMode;
};

type FinanceCatalog = {
  academicYear?: { name?: string };
  plans: TuitionPlan[];
};

type StudentFormState = {
  id?: string;
  fullName: string;
  gender: "F" | "M" | "O" | "";
  classId: string;
  annualFee: string;
  paymentOptionType: string;
  specialAgreement?: SpecialAgreementDraft;
};

type FormState = {
  nom: string;
  postnom: string;
  prenom: string;
  phone: string;
  email: string;
  physicalAddress: string;
  photoUrl: string;
  preferredLanguage: "fr" | "en";
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
  SPECIAL_OWNER_AGREEMENT: "Accord spécial parent-école"
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
  physicalAddress: "",
  photoUrl: "",
  preferredLanguage: "fr",
  defaultPaymentOptionType: "STANDARD_MONTHLY",
  notifyEmail: true,
  notifySms: true,
  students: []
};

const EMPTY_STUDENT: StudentFormState = { fullName: "", gender: "", classId: "", annualFee: "", paymentOptionType: "STANDARD_MONTHLY" };

const EMPTY_SPECIAL_AGREEMENT: SpecialAgreementDraft = {
  title: "",
  customTotal: "",
  reductionAmount: "0",
  notes: "",
  installmentMode: "THREE_INSTALLMENTS"
};

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
      if (grade) return 10 + Number(grade[1]);
      return 100;
    };
    return rank(a.name) - rank(b.name);
  });
}

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
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
function PrintIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M6 9V4h12v5" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v6H6z" />
    </svg>
  );
}
function ExcelIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M9 13l4 6" />
      <path d="M13 13l-4 6" />
      <path d="M8 13h6" />
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
    .replace(/^-+|-+$/g, "") || "rapport-parent";
}

function buildParentReportHtml(parent: Parent, financeSnapshot: ParentFinanceSnapshot | null) {
  const brand = schoolBranding;
  const generatedAt = new Date();
  const documentReference = escapeHtml(`KCS-PAR-${generatedAt.toISOString().slice(0, 10)}-${(parent.displayId || parent.id).replace(/[^A-Za-z0-9-]/g, "")}`);
  const logoSrc = escapeHtml(new URL(brand.logoSrc, window.location.href).toString());
  const studentRows = parent.students.map((student) => {
    const financeRow = financeSnapshot?.students.find((entry) => entry.id === student.id);
    return `
      <tr>
        <td>${escapeHtml(student.fullName)}</td>
        <td>${escapeHtml(student.className || student.classId)}</td>
        <td>${escapeHtml(student.tuitionPlanName || student.paymentOptionLabel || "-")}</td>
        <td>${escapeHtml(formatDateTimeLabel(student.createdAt))}</td>
        <td>$ ${student.annualFee.toFixed(2)}</td>
        <td>${financeRow ? `$ ${financeRow.expectedTotal.toFixed(2)}` : "-"}</td>
        <td>${financeRow ? `$ ${financeRow.paid.toFixed(2)}` : "-"}</td>
        <td>${financeRow ? `$ ${financeRow.balance.toFixed(2)}` : "-"}</td>
      </tr>`;
  }).join("");

  const debtRows = financeSnapshot?.debts.length
    ? financeSnapshot.debts.map((debt) => `
      <tr>
        <td>${escapeHtml(debt.title)}</td>
        <td>${escapeHtml(getDebtReferenceYear(debt))}</td>
        <td>$ ${debt.originalAmount.toFixed(2)}</td>
        <td>$ ${debt.amountRemaining.toFixed(2)}</td>
        <td>${escapeHtml(getDebtStatusLabel(debt.status))}</td>
        <td>${escapeHtml(formatDateLabel(debt.dueDate))}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">Aucune dette détaillée enregistrée.</td></tr>`;

  const summarySection = financeSnapshot ? `
    <section class="panel">
      <h2>Synthèse financière</h2>
      <div class="summary-grid">
        <div><span>Année académique</span><strong>${escapeHtml(financeSnapshot.academicYear.name)}</strong></div>
        <div><span>Total payé</span><strong>$ ${financeSnapshot.profile.totalPaid.toFixed(2)}</strong></div>
        <div><span>Dette totale</span><strong>$ ${financeSnapshot.profile.totalDebt.toFixed(2)}</strong></div>
        <div><span>Réductions</span><strong>$ ${financeSnapshot.profile.totalReduction.toFixed(2)}</strong></div>
        <div><span>Dette reportée</span><strong>$ ${financeSnapshot.profile.carriedOverDebt.toFixed(2)}</strong></div>
        <div><span>Taux de couverture</span><strong>${financeSnapshot.profile.completionRate.toFixed(1)}%</strong></div>
      </div>
    </section>` : "";

  return `<!DOCTYPE html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(brand.schoolName)} - Rapport parent - ${escapeHtml(parent.fullName)}</title>
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
        body {
          position: relative;
          font-family: "Segoe UI", Arial, sans-serif;
          margin: 0;
          padding: 28px;
          color: var(--ink);
          background:
            radial-gradient(circle at top right, rgba(143, 183, 232, 0.32), transparent 24%),
            linear-gradient(180deg, #ffffff, var(--brand-surface));
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, rgba(11, 46, 89, 0.03), rgba(31, 79, 143, 0.01));
          pointer-events: none;
        }
        .watermark {
          position: fixed;
          right: 18px;
          bottom: 28px;
          width: 220px;
          opacity: 0.06;
          filter: grayscale(100%);
          pointer-events: none;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }
        .topbar strong { color: var(--brand-primary); }
        h1, h2, h3, p { margin: 0; }
        .header {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          padding: 20px 22px;
          border-radius: 20px;
          background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
          color: white;
          box-shadow: 0 20px 45px rgba(11, 46, 89, 0.18);
          overflow: hidden;
        }
        .header::after {
          content: "";
          position: absolute;
          inset: auto -40px -60px auto;
          width: 200px;
          height: 200px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
        }
        .header-brand {
          display: flex;
          gap: 16px;
          align-items: center;
          position: relative;
          z-index: 1;
        }
        .header-logo {
          width: 76px;
          height: 76px;
          object-fit: contain;
          border-radius: 22px;
          background: white;
          padding: 8px;
          border: 1px solid rgba(255,255,255,0.25);
          box-shadow: 0 8px 22px rgba(0,0,0,0.16);
        }
        .eyebrow {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.72);
          margin-bottom: 6px;
        }
        .school-name { font-size: 28px; font-weight: 800; line-height: 1.1; }
        .school-meta { margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.86); }
        .report-box {
          min-width: 220px;
          position: relative;
          z-index: 1;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.16);
          backdrop-filter: blur(10px);
        }
        .report-box strong { display: block; font-size: 20px; margin-top: 8px; }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 18px;
        }
        .panel {
          position: relative;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 18px;
          padding: 18px;
          margin-top: 18px;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }
        .panel h2 {
          font-size: 15px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--brand-primary);
          margin-bottom: 12px;
        }
        .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .summary-grid div {
          border: 1px solid rgba(143, 183, 232, 0.42);
          border-radius: 14px;
          padding: 12px;
          background: linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(232, 241, 252, 0.88));
        }
        .summary-grid span { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; }
        .summary-grid strong { display: block; margin-top: 6px; font-size: 16px; }
        .muted { color: var(--muted); font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid var(--line); padding: 9px; text-align: left; font-size: 12px; vertical-align: top; }
        th {
          background: linear-gradient(180deg, rgba(11, 46, 89, 0.08), rgba(31, 79, 143, 0.04));
          color: var(--brand-primary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 11px;
        }
        .footer {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 11px;
          color: var(--muted);
        }
        .compliance {
          margin-top: 16px;
          border: 1px solid rgba(15, 118, 110, 0.2);
          border-left: 5px solid #0f766e;
          border-radius: 14px;
          background: rgba(240, 253, 250, 0.96);
          padding: 12px 14px;
          color: #134e4a;
          font-size: 11px;
          line-height: 1.5;
        }
        .signatures {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .signature-box {
          min-height: 82px;
          border: 1px dashed rgba(11, 46, 89, 0.24);
          border-radius: 14px;
          background: rgba(255,255,255,0.88);
          padding: 12px;
        }
        .signature-title {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-weight: 800;
          color: var(--muted);
        }
        .signature-line {
          margin-top: 38px;
          border-top: 1px solid rgba(11, 46, 89, 0.24);
          padding-top: 6px;
          font-size: 11px;
          color: var(--brand-primary);
          font-weight: 700;
        }
        @media print {
          body { padding: 12px; }
          .panel, .header { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <img class="watermark" src="${logoSrc}" alt="" />
      <div class="topbar">
        <span><strong>${escapeHtml(brand.shortName)}</strong> · dossier administratif parent</span>
        <span>Référence ${documentReference}</span>
      </div>
      <div class="header">
        <div class="header-brand">
          <img class="header-logo" src="${logoSrc}" alt="Logo ${escapeHtml(brand.schoolName)}" />
          <div>
            <p class="eyebrow">Rapport administratif parent</p>
            <h1 class="school-name">${escapeHtml(brand.schoolName)}</h1>
            <p class="school-meta">${escapeHtml(brand.tagline)} · ${escapeHtml(brand.appName)} · ${escapeHtml(brand.shortName)}</p>
          </div>
        </div>
        <div class="report-box">
          <span class="eyebrow">Dossier parent</span>
          <strong>${escapeHtml(parent.fullName)}</strong>
          <p class="school-meta">ID ${escapeHtml(parent.displayId || parent.id)}</p>
          <p class="school-meta">Émis le ${escapeHtml(generatedAt.toLocaleString("fr-FR"))}</p>
        </div>
      </div>
      <section class="panel">
        <h2>Identité parent</h2>
        <div class="meta-grid">
          <div>
            <p class="muted">Téléphone</p>
            <strong>${escapeHtml(parent.phone || "-")}</strong>
          </div>
          <div>
            <p class="muted">Email</p>
            <strong>${escapeHtml(parent.email || "-")}</strong>
          </div>
          <div>
            <p class="muted">Inscription</p>
            <strong>${escapeHtml(formatDateTimeLabel(parent.createdAt))}</strong>
          </div>
          <div>
            <p class="muted">Nombre d'enfants liés</p>
            <strong>${parent.students.length}</strong>
          </div>
        </div>
      </section>
      ${summarySection}
      <section class="panel">
        <h2>Enfants rattachés</h2>
        <table>
          <thead>
            <tr>
              <th>Élève</th>
              <th>Classe</th>
              <th>Plan</th>
              <th>Inscrit le</th>
              <th>Frais saisis</th>
              <th>Total attendu</th>
              <th>Payé</th>
              <th>Solde</th>
            </tr>
          </thead>
          <tbody>${studentRows || `<tr><td colspan="8">Aucun enfant rattaché.</td></tr>`}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Dettes et reports</h2>
        <table>
          <thead>
            <tr>
              <th>Ligne</th>
              <th>Année</th>
              <th>Montant initial</th>
              <th>Reste à payer</th>
              <th>Statut</th>
              <th>Échéance</th>
            </tr>
          </thead>
          <tbody>${debtRows}</tbody>
        </table>
      </section>
      <div class="compliance">
        Ce rapport reprend les informations d'identité, d'inscription et de situation financière visibles dans EduPay pour ce parent. Il est généré selon la charte ${escapeHtml(brand.shortName)} pour archivage administratif.
      </div>
      <div class="signatures">
        <div class="signature-box">
          <div class="signature-title">Validation administrative</div>
          <div class="signature-line">Gestion des parents</div>
        </div>
        <div class="signature-box">
          <div class="signature-title">Visa financier</div>
          <div class="signature-line">Service comptable</div>
        </div>
      </div>
      <div class="footer">
        <span>Document officiel ${escapeHtml(brand.appName)} généré pour ${escapeHtml(brand.schoolName)}.</span>
        <span>Charte ${escapeHtml(brand.shortName)} · ${escapeHtml(generatedAt.toLocaleString("fr-FR"))}</span>
      </div>
    </body>
  </html>`;
}

function mountParentReportFrame(parent: Parent, financeSnapshot: ParentFinanceSnapshot | null) {
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
      reject(new Error("Impossible de préparer le document PDF."));
    };
    frame.srcdoc = buildParentReportHtml(parent, financeSnapshot);
  });
}

async function exportParentReportPdf(parent: Parent, financeSnapshot: ParentFinanceSnapshot | null) {
  const frame = await mountParentReportFrame(parent, financeSnapshot);

  try {
    const body = frame.contentDocument?.body;
    if (!body) {
      throw new Error("Document PDF introuvable.");
    }
    await exportElementToPdf(body, {
      filename: `rapport-parent-${slugify(parent.fullName)}-${new Date().toISOString().slice(0, 10)}.pdf`,
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

function printParentReport(parent: Parent, financeSnapshot: ParentFinanceSnapshot | null) {
  printHtmlDocument(buildParentReportHtml(parent, financeSnapshot));
}

function exportParentReportExcel(parent: Parent, financeSnapshot: ParentFinanceSnapshot | null) {
  const financeStudents = new Map((financeSnapshot?.students ?? []).map((student) => [student.id, student]));
  exportWorkbook(`rapport-parent-${slugify(parent.fullName)}-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Parent",
      rows: [{
        "ID Parent": parent.displayId || parent.id,
        "Nom complet": parent.fullName,
        "Nom": parent.nom,
        "Postnom": parent.postnom,
        "Prenom": parent.prenom,
        "Téléphone": parent.phone,
        "Email": parent.email,
        "Date inscription exacte": formatDateTimeLabel(parent.createdAt),
        "Enfants liés": parent.students.length,
        "Année académique": financeSnapshot?.academicYear.name ?? "-",
        "Total payé": financeSnapshot?.profile.totalPaid ?? null,
        "Dette totale": financeSnapshot?.profile.totalDebt ?? null,
        "Réductions": financeSnapshot?.profile.totalReduction ?? null,
        "Dette reportée": financeSnapshot?.profile.carriedOverDebt ?? null,
      }]
    },
    {
      name: "Enfants",
      rows: parent.students.map((student) => {
        const financeRow = financeStudents.get(student.id);
        return {
          "ID Élève": student.displayId || student.id,
          "Nom complet": student.fullName,
          "Classe": student.className || student.classId,
          "Plan": student.tuitionPlanName || student.paymentOptionLabel || "-",
          "Date inscription exacte": formatDateTimeLabel(student.createdAt),
          "Frais annuels": student.annualFee,
          "Total attendu": financeRow?.expectedTotal ?? null,
          "Payé": financeRow?.paid ?? null,
          "Solde": financeRow?.balance ?? null,
          "Échéances en retard": financeRow?.overdueInstallments ?? null,
          "Taux de completion": financeRow?.completionRate ?? null,
        };
      })
    },
    {
      name: "Dettes",
      rows: (financeSnapshot?.debts ?? []).map((debt) => ({
        "Ligne": debt.title,
        "Motif": debt.reason || "-",
        "Année de référence": getDebtReferenceYear(debt),
        "Imputée sur": debt.academicYearName || debt.academicYearId,
        "Reportée depuis": debt.carriedOverFromYearName || debt.carriedOverFromYearId || "-",
        "Montant initial": debt.originalAmount,
        "Reste à payer": debt.amountRemaining,
        "Statut": getDebtStatusLabel(debt.status),
        "Échéance": formatDateLabel(debt.dueDate),
        "Créée le": formatDateLabel(debt.createdAt),
      }))
    }
  ]);
}

function resolveGradeGroup(className?: string) {
  const normalized = (className || "").trim().toLowerCase();
  if (!normalized) return "CUSTOM";
  if (/^k\d?/.test(normalized) || normalized.includes("kindergarten")) return "K";
  const gradeMatch = normalized.match(/\b(?:grade|g)\s*(\d{1,2})\b/i);
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

function getPaymentOptionSelectLabel(plan: TuitionPlan) {
  if (plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT") {
    return "Accord spécial parent-école";
  }

  return `${getPaymentOptionLabel(plan.paymentOptionType)} · ${formatMoney(plan.finalAmount)}`;
}

function formatAmountInput(amount?: number) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function parseAmount(value?: string | number) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
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

function normalizeSpecialAgreementDraft(student: StudentFormState): SpecialAgreementDraft {
  const current = student.specialAgreement || EMPTY_SPECIAL_AGREEMENT;
  return {
    title: current.title || (student.fullName.trim() ? `Accord spécial - ${student.fullName.trim()}` : "Accord spécial parent-école"),
    customTotal: current.customTotal || student.annualFee || "",
    reductionAmount: current.reductionAmount || "0",
    notes: current.notes || "",
    installmentMode: current.installmentMode || "THREE_INSTALLMENTS"
  };
}

function buildAgreementSchedule(total: number, reductionAmount: number, installmentMode: SpecialAgreementInstallmentMode): PlanScheduleItem[] {
  const balance = roundCurrency(Math.max(total - reductionAmount, 0));
  if (balance <= 0) return [];

  if (installmentMode === "ONE_TIME") {
    return [{ label: "Versement unique", amount: balance, dueDate: buildAcademicDueDate(8, 31), windowLabel: "Avant la rentrée" }];
  }

  if (installmentMode === "TWO_INSTALLMENTS") {
    const first = roundCurrency(balance * 0.6);
    const second = roundCurrency(balance - first);
    return [
      { label: "Premier versement", amount: first, dueDate: buildAcademicDueDate(8, 31), windowLabel: "Avant septembre" },
      { label: "Solde", amount: second, dueDate: buildAcademicDueDate(1, 31), windowLabel: "Avant fin janvier" }
    ];
  }

  const [initialAmount, midYearAmount, finalAmount] = splitOwnerAgreementTotal(balance);
  return [
    { label: "Engagement initial", amount: initialAmount, dueDate: buildAcademicDueDate(8, 31), windowLabel: "Avant septembre" },
    { label: "Régularisation mi-année", amount: midYearAmount, dueDate: buildAcademicDueDate(1, 31), windowLabel: "Avant fin janvier" },
    { label: "Solde final", amount: finalAmount, dueDate: buildAcademicDueDate(5, 31), windowLabel: "Avant fin mai" }
  ];
}

function buildSpecialOwnerAgreementPlan(student: StudentFormState, className: string, officialPlans: TuitionPlan[]): TuitionPlan | null {
  const gradeGroup = resolveGradeGroup(className);
  const agreement = normalizeSpecialAgreementDraft(student);
  const customTotal = Math.max(parseAmount(agreement.customTotal), 0);
  const reductionAmount = roundCurrency(Math.max(parseAmount(agreement.reductionAmount), 0));
  const finalAmount = roundCurrency(Math.max(customTotal - reductionAmount, 0));
  const schedule = buildAgreementSchedule(customTotal, reductionAmount, agreement.installmentMode);

  return {
    id: `special-owner-${gradeGroup}`,
    name: agreement.title.trim() || (customTotal > 0 ? "Accord spécial parent-école" : "Accord spécial parent-école à définir"),
    paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
    gradeGroup,
    discountRate: 0,
    originalAmount: customTotal,
    finalAmount,
    reductionAmount,
    scheduleJson: schedule
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
      <div className="edupay-dialog-panel-sm relative w-full glass rounded-2xl p-8 space-y-5 animate-fadeInUp sm:p-9" onClick={(e) => e.stopPropagation()}>
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
      <div className="edupay-dialog-panel-sm relative w-full glass rounded-2xl p-7 space-y-5 animate-fadeInUp sm:p-8" onClick={(e) => e.stopPropagation()}>
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
  const [pdfExporting, setPdfExporting] = useState(false);
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
  const financeStudentsById = useMemo(
    () => new Map((financeSnapshot?.students ?? []).map((student) => [student.id, student])),
    [financeSnapshot]
  );

  const exportDisabled = financeLoading || Boolean(financeError) || pdfExporting;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-5 sm:py-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="edupay-parent-modal relative flex max-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col overflow-hidden glass rounded-2xl animate-fadeInUp" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300">{t("pmParentId")}: {parent.displayId || parent.id}</p>
            <h2 className="mt-1 truncate font-display text-xl font-bold text-white sm:text-2xl">{parent.fullName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPdfExporting(true);
                void exportParentReportPdf(parent, financeSnapshot)
                  .finally(() => setPdfExporting(false));
              }}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              title="Télécharger le rapport en PDF"
            >
              <PrintIcon /> {pdfExporting ? "PDF..." : "PDF"}
            </button>
            <button
              type="button"
              onClick={() => printParentReport(parent, financeSnapshot)}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              title="Imprimer le rapport"
            >
              <PrintIcon /> Impression
            </button>
            <button
              type="button"
              onClick={() => exportParentReportExcel(parent, financeSnapshot)}
              disabled={exportDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              title="Exporter le rapport en Excel"
            >
              <ExcelIcon /> Excel
            </button>
            <button onClick={onClose} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-dim transition-colors hover:text-white">
              <XIcon />
            </button>
          </div>
        </div>
        <div className="edupay-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="space-y-6">
            <div>
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
                  <p className="text-xs text-ink-dim mt-1">{t("pmRegisteredOn")} {formatDateTimeLabel(parent.createdAt)}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("pmPhone")}</p>
                <p className="text-sm font-semibold text-white mt-1">{parent.phone || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3">
                <p className="text-xs text-ink-dim">{t("email")}</p>
                <p className="text-sm font-semibold text-white mt-1 truncate">{parent.email || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-700/50 p-3 sm:col-span-2">
                <p className="text-xs text-ink-dim">Adresse physique</p>
                <p className="text-sm font-semibold text-white mt-1">{parent.physicalAddress || "—"}</p>
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
                  {parent.students.map((st) => {
                    const financeRow = financeStudentsById.get(st.id);
                    const expectedAmount = Number(financeRow?.expectedTotal ?? st.annualFee ?? 0);
                    const enrolledAt = st.createdAt || parent.createdAt;

                    return (
                      <div key={st.id} className="flex flex-col gap-3 rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-white">{st.fullName}</p>
                          <p className="text-xs text-ink-dim">{financeRow?.className || st.className || st.classId || "Classe non renseignée"}</p>
                          <p className="mt-1 text-xs text-ink-dim">Inscrit le {formatDateTimeLabel(enrolledAt)}</p>
                          {(st.tuitionPlanName || st.paymentOptionLabel) && (
                            <p className="mt-1 text-xs text-cyan-300">{st.tuitionPlanName || st.paymentOptionLabel}</p>
                          )}
                          {financeRow ? (
                            <p className="mt-1 text-xs text-ink-dim">
                              Payé {formatMoney(financeRow.paid)} · Reste {formatMoney(financeRow.balance)}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Montant attendu</p>
                          <p className="mt-1 text-sm font-bold text-emerald-300">{formatMoney(expectedAmount)}</p>
                        </div>
                      </div>
                    );
                  })}
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
      <div className="edupay-dialog-panel-sm relative w-full glass rounded-2xl p-8 space-y-6 animate-fadeInUp sm:p-9" onClick={(e) => e.stopPropagation()}>
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

function DuplicateParentDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-md" />
      <section className="edupay-dialog-panel-sm relative w-full rounded-2xl border border-amber-400/30 bg-slate-950 p-7 shadow-2xl animate-fadeInUp sm:p-8" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-dim hover:text-white transition-colors" aria-label="Fermer">
          <XIcon />
        </button>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-200">
            !
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Famille deja existante</p>
            <h3 className="mt-2 font-display text-2xl font-bold text-white">Enregistrement refuse</h3>
            <p className="mt-3 text-sm leading-6 text-ink-dim">{message}</p>
          </div>
        </div>
        <button onClick={onClose} className="mt-6 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400">
          Compris
        </button>
      </section>
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
      physicalAddress: initial.physicalAddress || "",
      photoUrl: initial.photoUrl || "",
      preferredLanguage: initial.preferredLanguage || "fr",
      defaultPaymentOptionType: initial.students[0]?.paymentOptionType || "STANDARD_MONTHLY",
      notifyEmail: true,
      notifySms: true,
      students: initial.students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        gender: s.gender || "",
        classId: s.classId,
        annualFee: String(s.annualFee),
        paymentOptionType: s.paymentOptionType || "STANDARD_MONTHLY",
        specialAgreement: s.paymentOptionType === "SPECIAL_OWNER_AGREEMENT"
          ? {
            ...EMPTY_SPECIAL_AGREEMENT,
            title: `Accord spécial - ${s.fullName}`,
            customTotal: String(s.annualFee),
            reductionAmount: "0"
          }
          : undefined
      }))
    };
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [specialAgreementTarget, setSpecialAgreementTarget] = useState<number | null>(null);
  const classOptions = useMemo(() => getSchoolClassOptions(classes), [classes]);

  const getClassName = (classId: string) => classOptions.find((entry) => entry.id === classId)?.name || "";

  const getMatchingPlans = (classId: string, student?: StudentFormState) => {
    if (!catalog?.plans?.length) return [];
    const gradeGroup = resolveGradeGroup(getClassName(classId));
    const officialPlans = catalog.plans.filter((plan) => (
      plan.gradeGroup === gradeGroup
      && plan.paymentOptionType !== "SPECIAL_OWNER_AGREEMENT"
      && PAYMENT_OPTION_LABELS[plan.paymentOptionType]
    ));
    if (!classId) return officialPlans;
    const specialPlan = buildSpecialOwnerAgreementPlan(student ?? { ...EMPTY_STUDENT, classId, paymentOptionType: "SPECIAL_OWNER_AGREEMENT" }, getClassName(classId), officialPlans);
    return [...officialPlans, ...(specialPlan ? [specialPlan] : [])].sort(
      (left, right) => TUITION_OPTION_ORDER.indexOf(left.paymentOptionType) - TUITION_OPTION_ORDER.indexOf(right.paymentOptionType)
    );
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

  const setStudentSpecialAgreement = (idx: number, key: keyof SpecialAgreementDraft, value: string) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      const draft = normalizeSpecialAgreementDraft(student);
      const nextDraft = { ...draft, [key]: value };
      students[idx] = {
        ...student,
        paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
        annualFee: nextDraft.customTotal,
        specialAgreement: nextDraft
      };
      return { ...current, defaultPaymentOptionType: "SPECIAL_OWNER_AGREEMENT", students };
    });
    setErrors((current) => ({ ...current, [`studentAnnualFee-${idx}`]: "" }));
  };

  const applyStudentPlanSelection = (student: StudentFormState, paymentOptionType: string) => {
    const matchingPlan = getMatchingPlans(student.classId, student).find((plan) => plan.paymentOptionType === paymentOptionType);
    if (paymentOptionType === "SPECIAL_OWNER_AGREEMENT") {
      const specialAgreement = normalizeSpecialAgreementDraft(student);
      return {
        ...student,
        paymentOptionType,
        annualFee: specialAgreement.customTotal || student.annualFee,
        specialAgreement
      };
    }

    return {
      ...student,
      paymentOptionType,
      annualFee: matchingPlan ? formatAmountInput(matchingPlan.finalAmount) : student.annualFee,
      specialAgreement: student.specialAgreement
    };
  };

  const openSpecialAgreementDialog = (idx: number) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      const specialAgreement = normalizeSpecialAgreementDraft(student);
      students[idx] = {
        ...student,
        paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
        annualFee: specialAgreement.customTotal || student.annualFee,
        specialAgreement
      };
      return { ...current, defaultPaymentOptionType: "SPECIAL_OWNER_AGREEMENT", students };
    });
    setSpecialAgreementTarget(idx);
  };

  const updateStudentClass = (idx: number, classId: string) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      const nextStudent = { ...student, classId };
      const paymentOptionType = getPreferredOption(classId, student.paymentOptionType, nextStudent);
      students[idx] = {
        ...applyStudentPlanSelection({ ...student, classId }, paymentOptionType),
        classId
      };
      return { ...current, students };
    });
  };

  const updateStudentPlan = (idx: number, paymentOptionType: string) => {
    setForm((current) => {
      const students = [...current.students];
      const student = students[idx] || { ...EMPTY_STUDENT };
      students[idx] = applyStudentPlanSelection(student, paymentOptionType);
      return { ...current, defaultPaymentOptionType: paymentOptionType, students };
    });
    if (paymentOptionType === "SPECIAL_OWNER_AGREEMENT") {
      setSpecialAgreementTarget(idx);
    }
  };

  const updateFamilyTuitionPlan = (paymentOptionType: string) => {
    setForm((current) => {
      const students = current.students.map((student) => {
        if (!student.classId) {
          return paymentOptionType === "SPECIAL_OWNER_AGREEMENT"
            ? applyStudentPlanSelection(student, paymentOptionType)
            : { ...student, paymentOptionType };
        }

        return applyStudentPlanSelection(student, paymentOptionType);
      });

      return { ...current, defaultPaymentOptionType: paymentOptionType, students };
    });
    if (paymentOptionType === "SPECIAL_OWNER_AGREEMENT" && form.students.length > 0) {
      const firstTarget = form.students.findIndex((student) => student.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" || !student.paymentOptionType);
      setSpecialAgreementTarget(firstTarget >= 0 ? firstTarget : 0);
    }
  };

  const moveToNextSpecialAgreementTarget = (currentIndex: number) => {
    const nextIndex = form.students.findIndex((student, index) => index > currentIndex && student.paymentOptionType === "SPECIAL_OWNER_AGREEMENT");
    setSpecialAgreementTarget(nextIndex >= 0 ? nextIndex : null);
  };

  const addStudent = () => setForm((f) => ({
    ...f,
    students: [
      ...f.students,
      {
        ...EMPTY_STUDENT,
        paymentOptionType: f.defaultPaymentOptionType,
        specialAgreement: f.defaultPaymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? { ...EMPTY_SPECIAL_AGREEMENT } : undefined
      }
    ]
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
    form.students.forEach((student, idx) => {
      if (student.paymentOptionType === "SPECIAL_OWNER_AGREEMENT") {
        const agreement = normalizeSpecialAgreementDraft(student);
        const amount = parseAmount(agreement.customTotal);
        const reductionAmount = parseAmount(agreement.reductionAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          e[`studentAnnualFee-${idx}`] = "Pour l'accord spécial, le montant convenu doit être saisi dans la boîte de dialogue.";
        }
        if (reductionAmount < 0 || reductionAmount > amount) {
          e[`studentAnnualFee-${idx}`] = "La réduction spéciale doit rester comprise entre 0 et le montant convenu.";
        }
      }
    });
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const normalizedForm: FormState = {
      ...form,
      students: form.students.map((student) => {
        if (student.paymentOptionType !== "SPECIAL_OWNER_AGREEMENT") {
          return { ...student, specialAgreement: undefined };
        }

        const specialAgreement = normalizeSpecialAgreementDraft(student);
        return {
          ...student,
          annualFee: specialAgreement.customTotal,
          specialAgreement: {
            ...specialAgreement,
            title: specialAgreement.title.trim(),
            notes: specialAgreement.notes.trim()
          }
        };
      })
    };
    await onSave(normalizedForm, initial?.id);
    setSaving(false);
  };

  return (
    <div className="edupay-scrollbar fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="edupay-scrollbar relative my-4 max-h-[92vh] w-full max-w-5xl overflow-y-auto glass rounded-2xl p-5 space-y-6 animate-fadeInUp sm:p-7">
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
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-ink-dim uppercase tracking-[0.1em]">Adresse physique</label>
            <input value={form.physicalAddress} onChange={(e) => set("physicalAddress", e.target.value)} className="w-full" placeholder="Avenue, quartier, commune, ville" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
          <p className="text-sm font-bold text-white">Langue des messages EduPay</p>
          <p className="mt-1 text-xs text-ink-dim">Les SMS, emails et messages dans le compte parent suivront cette langue.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { value: "fr", label: "Francais", detail: "Messages en francais" },
              { value: "en", label: "English", detail: "Messages in English" }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => set("preferredLanguage", option.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  form.preferredLanguage === option.value
                    ? "border-brand-400/50 bg-brand-500/15 text-white"
                    : "border-slate-700/50 bg-slate-950/30 text-ink-dim hover:border-brand-300/30 hover:text-white"
                }`}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs">{option.detail}</span>
              </button>
            ))}
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
              Choisissez l'un des 5 plans. Les 4 plans officiels gardent leur montant automatique selon la classe. Le 5e plan ouvre une fiche dédiée pour saisir l'accord spécial de chaque enfant.
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
                      <span className="block break-words text-sm font-black leading-snug text-white">{getPaymentOptionLabel(optionType)}</span>
                      <span className="mt-1 block break-words text-[11px] leading-relaxed text-ink-dim">
                        {optionType === "FULL_PRESEPTEMBER" && "Remise maximale pour paiement complet avant septembre."}
                        {optionType === "TWO_INSTALLMENTS" && "Deux grandes tranches avec réduction partielle."}
                        {optionType === "THREE_INSTALLMENTS" && "Trois tranches et remise légère."}
                        {optionType === "STANDARD_MONTHLY" && "Plan mensuel standard sans réduction."}
                        {optionType === "SPECIAL_OWNER_AGREEMENT" && "Accord spécial parent-école: une boîte de dialogue dédiée s'ouvre pour définir le montant, la remise et l'échéancier."}
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
            <div key={idx} className="min-w-0 space-y-4 rounded-2xl border border-slate-700/50 bg-slate-900/30 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Élève {idx + 1}</p>
                  <p className="text-xs leading-relaxed text-ink-dim">Choisissez une classe puis un plan adapté. Les plans officiels remplissent le montant automatiquement; l'accord spécial parent-école se configure dans sa propre fiche.</p>
                </div>
                <button type="button" onClick={() => removeStudent(idx)}
                  className="p-2 rounded-lg bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30 transition-all active:scale-95">
                  <TrashIcon />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.1fr_0.55fr_0.9fr]">
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">{t("pmChildName")}</label>
                  <input value={st.fullName} onChange={(e) => setStudent(idx, "fullName", e.target.value)} className="w-full" placeholder={t("pmChildNamePlaceholder")} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">Sexe</label>
                  <select value={st.gender} onChange={(e) => setStudent(idx, "gender", e.target.value)} className="w-full">
                    <option value="">Choisir</option>
                    <option value="F">Fille</option>
                    <option value="M">Garcon</option>
                    <option value="O">Autre / non precise</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">{t("pmChildClass")}</label>
                  <select value={st.classId} onChange={(e) => updateStudentClass(idx, e.target.value)} className="w-full">
                    <option value="">{t("pmSelectClass")}</option>
                    <optgroup label="Maternelle">
                      {classOptions.filter((c) => c.name.startsWith("K")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    <optgroup label="G1 - G12">
                      {classOptions.filter((c) => c.name.startsWith("G")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-1">
                  <label className="text-xs text-ink-dim">Plan de scolarité</label>
                  <select value={st.paymentOptionType} onChange={(e) => updateStudentPlan(idx, e.target.value)} className="w-full">
                    {getMatchingPlans(st.classId, st).length > 0 ? getMatchingPlans(st.classId, st).map((plan) => (
                      <option key={`${plan.gradeGroup}-${plan.paymentOptionType}`} value={plan.paymentOptionType}>
                        {getPaymentOptionSelectLabel(plan)}
                      </option>
                    )) : TUITION_OPTION_ORDER.map((value) => (
                      <option key={value} value={value}>{getPaymentOptionLabel(value)}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-ink-dim">
                    {st.classId
                      ? `Segment : ${GRADE_GROUP_LABELS[resolveGradeGroup(getClassName(st.classId))] || "À définir"}`
                      : "Sélectionnez d'abord la classe de l'enfant pour filtrer les plans compatibles."}
                  </p>
                  {st.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" && (
                    <p className="text-[11px] leading-relaxed text-amber-100/90">Option 5 sélectionnée : la configuration détaillée s'ouvre dans une fenêtre dédiée afin d'éviter les libellés trop longs dans la liste.</p>
                  )}
                </div>
                {st.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? (
                  <div className="space-y-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">Fiche d'accord spécial</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-100/90">
                          Définissez ici le montant convenu, le nom du plan spécial, la remise éventuelle et le rythme de paiement pour cet enfant.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSpecialAgreementDialog(idx)}
                        className="shrink-0 self-start whitespace-nowrap rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
                      >
                        Configurer
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Montant convenu</p>
                        <p className="mt-1 text-sm font-black text-white">
                          {parseAmount(normalizeSpecialAgreementDraft(st).customTotal) > 0 ? formatMoney(parseAmount(normalizeSpecialAgreementDraft(st).customTotal)) : "À définir"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Réduction spéciale</p>
                        <p className="mt-1 text-sm font-black text-emerald-300">{formatMoney(parseAmount(normalizeSpecialAgreementDraft(st).reductionAmount))}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Cadence</p>
                        <p className="mt-1 text-sm font-black text-cyan-200">
                          {normalizeSpecialAgreementDraft(st).installmentMode === "ONE_TIME" ? "Versement unique" : normalizeSpecialAgreementDraft(st).installmentMode === "TWO_INSTALLMENTS" ? "2 tranches" : "3 tranches"}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-100/90">{normalizeSpecialAgreementDraft(st).title || "Accord spécial parent-école"}</p>
                    {errors[`studentAnnualFee-${idx}`] && <p className="text-xs text-danger">{errors[`studentAnnualFee-${idx}`]}</p>}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs text-ink-dim">{t("pmAnnualFee")} (USD)</label>
                    <input type="number" value={st.annualFee} onChange={(e) => setStudent(idx, "annualFee", e.target.value)} className="w-full" placeholder="500" />
                    <p className="text-[11px] leading-relaxed text-ink-dim">Montant pré-rempli depuis le plan choisi, modifiable si nécessaire.</p>
                    {errors[`studentAnnualFee-${idx}`] && <p className="text-xs text-danger">{errors[`studentAnnualFee-${idx}`]}</p>}
                  </div>
                )}
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
                            className={`min-w-0 rounded-2xl border p-4 text-left transition-all ${isActive ? "border-brand-300 bg-brand-500/12 shadow-[0_0_0_1px_rgba(125,232,255,0.2)]" : "border-slate-700/60 bg-slate-900/50 hover:border-brand-400/50 hover:bg-slate-900/70"}`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-black leading-snug text-white">{getPaymentOptionLabel(plan.paymentOptionType)}</p>
                                <p className="mt-1 break-words text-[11px] leading-relaxed text-ink-dim">{plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? "Accord spécial parent-école: ouvrez la fiche dédiée pour définir le montant, la réduction et l'échéancier propres à cet enfant." : plan.name}</p>
                              </div>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isActive ? "bg-brand-300 text-slate-950" : "bg-white/10 text-ink-dim"}`}>
                                {isActive ? "Choisi" : "Choisir"}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                              <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Montant initial</p>
                                <p className="mt-1 break-words font-bold text-white">{Number(plan.originalAmount || plan.finalAmount) > 0 ? formatMoney(Number(plan.originalAmount || plan.finalAmount)) : "À saisir"}</p>
                              </div>
                              <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Réduction</p>
                                <p className="mt-1 break-words font-bold text-emerald-300">{plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? "Selon accord" : formatMoney(Number(plan.reductionAmount || 0))}</p>
                              </div>
                              <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Remise</p>
                                <p className="mt-1 break-words font-bold text-white">{plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? "Manuelle" : `${Number(plan.discountRate || 0).toFixed(0)}%`}</p>
                              </div>
                              <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Net à payer</p>
                                <p className="mt-1 break-words font-black text-brand-200">{plan.finalAmount > 0 ? formatMoney(plan.finalAmount) : "À saisir"}</p>
                              </div>
                            </div>

                            {schedule.length > 0 ? (
                              <div className="mt-4 space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-dim">Échéancier exact</p>
                                <div className="space-y-2">
                                  {schedule.map((row, scheduleIdx) => (
                                    <div key={`${plan.paymentOptionType}-${scheduleIdx}`} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white">{row.label}</p>
                                        <p className="text-[11px] text-ink-dim">{getScheduleCaption(row)}</p>
                                      </div>
                                      <p className="text-sm font-black text-cyan-200">{formatMoney(row.amount)}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : plan.paymentOptionType === "SPECIAL_OWNER_AGREEMENT" ? (
                              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                                La fiche dédiée de l'accord spécial génère automatiquement l'échéancier détaillé après saisie du montant convenu.
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

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-white/10 bg-slate-950/90 px-4 pt-4 sm:-mx-6 sm:flex-row sm:px-6">
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

        {specialAgreementTarget !== null && form.students[specialAgreementTarget] && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <button type="button" className="absolute inset-0 cursor-default" onClick={() => setSpecialAgreementTarget(null)} aria-label="Fermer la boîte de dialogue de l'accord spécial" />
            <div className="edupay-scrollbar relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-300/20 bg-slate-950/95 p-6 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Accord spécial parent-école</p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-white">{form.students[specialAgreementTarget].fullName || `Élève ${specialAgreementTarget + 1}`}</h3>
                  <p className="mt-2 text-sm text-ink-dim">Saisissez ici les détails spécifiques de l'accord: total convenu, nom du plan, remise éventuelle et structure de paiement.</p>
                </div>
                <button type="button" onClick={() => setSpecialAgreementTarget(null)} className="text-ink-dim hover:text-white transition-colors">
                  <XIcon />
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Nom du plan spécial</label>
                  <input
                    value={normalizeSpecialAgreementDraft(form.students[specialAgreementTarget]).title}
                    onChange={(event) => setStudentSpecialAgreement(specialAgreementTarget, "title", event.target.value)}
                    className="w-full"
                    placeholder="Accord spécial parent-école"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Montant convenu (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={normalizeSpecialAgreementDraft(form.students[specialAgreementTarget]).customTotal}
                    onChange={(event) => setStudentSpecialAgreement(specialAgreementTarget, "customTotal", event.target.value)}
                    className="w-full"
                    placeholder="650"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Réduction spéciale (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={normalizeSpecialAgreementDraft(form.students[specialAgreementTarget]).reductionAmount}
                    onChange={(event) => setStudentSpecialAgreement(specialAgreementTarget, "reductionAmount", event.target.value)}
                    className="w-full"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Cadence de paiement</label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: "ONE_TIME", label: "Versement unique", detail: "Un seul règlement avant la rentrée" },
                      { value: "TWO_INSTALLMENTS", label: "2 tranches", detail: "Répartition début et milieu d'année" },
                      { value: "THREE_INSTALLMENTS", label: "3 tranches", detail: "Cadence recommandée pour un accord manuel" }
                    ].map((option) => {
                      const selected = normalizeSpecialAgreementDraft(form.students[specialAgreementTarget]).installmentMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setStudentSpecialAgreement(specialAgreementTarget, "installmentMode", option.value)}
                          className={`rounded-2xl border px-4 py-3 text-left transition-all ${selected ? "border-amber-300 bg-amber-400/15 text-white" : "border-white/10 bg-slate-900/60 text-ink-dim hover:border-amber-300/40 hover:text-white"}`}
                        >
                          <span className="block text-sm font-black">{option.label}</span>
                          <span className="mt-1 block text-[11px] leading-relaxed">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Notes internes</label>
                  <textarea
                    value={normalizeSpecialAgreementDraft(form.students[specialAgreementTarget]).notes}
                    onChange={(event) => setStudentSpecialAgreement(specialAgreementTarget, "notes", event.target.value)}
                    className="min-h-24 w-full"
                    placeholder="Ex: accord approuvé par la direction, parent en mission, échéancier dérogatoire..."
                  />
                </div>
              </div>

              {(() => {
                const student = form.students[specialAgreementTarget];
                const draft = normalizeSpecialAgreementDraft(student);
                const total = parseAmount(draft.customTotal);
                const reduction = parseAmount(draft.reductionAmount);
                const balance = roundCurrency(Math.max(total - reduction, 0));
                const previewSchedule = buildAgreementSchedule(total, reduction, draft.installmentMode);

                return (
                  <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Montant convenu</p>
                        <p className="mt-1 text-lg font-black text-white">{formatMoney(total)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Réduction retenue</p>
                        <p className="mt-1 text-lg font-black text-emerald-300">{formatMoney(reduction)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">Net à payer</p>
                        <p className="mt-1 text-lg font-black text-cyan-200">{formatMoney(balance)}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/80">Aperçu de l'échéancier</p>
                      {previewSchedule.length > 0 ? previewSchedule.map((row, scheduleIdx) => (
                        <div key={`special-preview-${scheduleIdx}`} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">{row.label}</p>
                            <p className="text-[11px] text-cyan-100/75">{getScheduleCaption(row)}</p>
                          </div>
                          <p className="text-sm font-black text-cyan-200">{formatMoney(row.amount)}</p>
                        </div>
                      )) : (
                        <p className="text-sm text-ink-dim">Le montant convenu doit être renseigné pour générer l'échéancier.</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {errors[`studentAnnualFee-${specialAgreementTarget}`] && <p className="mt-3 text-sm text-danger">{errors[`studentAnnualFee-${specialAgreementTarget}`]}</p>}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setSpecialAgreementTarget(null)} className="flex-1 rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-ink-dim hover:text-white">
                  Fermer
                </button>
                <button type="button" onClick={() => moveToNextSpecialAgreementTarget(specialAgreementTarget)} className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-400 px-4 py-3 text-sm font-bold text-slate-950">
                  Valider l'accord spécial
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
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
  const [duplicateParentMessage, setDuplicateParentMessage] = useState<string | null>(null);

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
        parent.physicalAddress || "",
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
      if (!id && /existe deja|already exists|PARENT_ALREADY_EXISTS|famille existe/i.test(message)) {
        setDuplicateParentMessage(message);
      }
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
      {duplicateParentMessage && <DuplicateParentDialog message={duplicateParentMessage} onClose={() => setDuplicateParentMessage(null)} />}
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
                      <div className="flex flex-nowrap items-center justify-center gap-2">
                        <button onClick={() => setViewTarget(parent)}
                          className="inline-flex h-9 w-9 min-h-9 min-w-9 flex-none items-center justify-center rounded-lg bg-slate-700/50 text-ink-dim transition-all hover:bg-slate-600/50 hover:text-white active:scale-90" title={t("pmView")}>
                          <EyeIcon />
                        </button>
                        <button onClick={() => openEdit(parent)}
                          className="inline-flex h-9 w-9 min-h-9 min-w-9 flex-none items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 transition-all hover:bg-brand-500/30 active:scale-90" title={t("pmEdit")}>
                          <EditIcon />
                        </button>
                        <button onClick={() => setNotificationTarget(parent)}
                          className="inline-flex h-9 w-9 min-h-9 min-w-9 flex-none items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 transition-all hover:bg-amber-500/30 active:scale-90" title="Envoyer les accès">
                          <KeyIcon />
                        </button>
                        <button onClick={() => setDeleteTarget(parent)}
                          className="inline-flex h-9 w-9 min-h-9 min-w-9 flex-none items-center justify-center rounded-lg bg-danger/20 text-danger transition-all hover:bg-danger/30 active:scale-90" title={t("pmDelete")}>
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
