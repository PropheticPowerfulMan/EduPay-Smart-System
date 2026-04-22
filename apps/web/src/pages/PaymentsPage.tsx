import { useMemo, useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

/* ─── Transaction number generator ──────────────────────────────────────── */
function generateTxNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `TXN-${date}-${rand}`;
}

/* ─── French number to words (70/80/90 corrects) ────────────────────────── */
function n2wFr(n: number): string {
  if (n === 0) return "zéro";
  if (n < 0) return "moins " + n2wFr(-n);
  const u = [
    "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
    "dix-sept", "dix-huit", "dix-neuf",
  ];
  const t = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];
  if (n < 20) return u[n];
  if (n < 70) {
    const tens = Math.floor(n / 10), ones = n % 10;
    if (ones === 0) return t[tens];
    if (ones === 1) return `${t[tens]} et un`;
    return `${t[tens]}-${u[ones]}`;
  }
  if (n < 80) {
    const ones = n - 60;
    if (ones === 11) return "soixante et onze";
    return `soixante-${n2wFr(ones)}`;
  }
  if (n < 100) {
    const ones = n - 80;
    if (ones === 0) return "quatre-vingts";
    return `quatre-vingt-${u[ones] || n2wFr(ones)}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    const head = h === 1 ? "cent" : `${u[h]} cent`;
    if (rest === 0) return h === 1 ? "cent" : `${u[h]} cents`;
    return `${head} ${n2wFr(rest)}`;
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000), rest = n % 1000;
    const head = k === 1 ? "mille" : `${n2wFr(k)} mille`;
    return rest ? `${head} ${n2wFr(rest)}` : head;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000), rest = n % 1_000_000;
    const head = m === 1 ? "un million" : `${n2wFr(m)} millions`;
    return rest ? `${head} ${n2wFr(rest)}` : head;
  }
  const b = Math.floor(n / 1_000_000_000), rest = n % 1_000_000_000;
  const head = b === 1 ? "un milliard" : `${n2wFr(b)} milliards`;
  return rest ? `${head} ${n2wFr(rest)}` : head;
}

/* ─── English number to words ────────────────────────────────────────────── */
function n2wEn(n: number): string {
  if (n === 0) return "zero";
  const u = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return u[n];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return o ? `${tens[t]}-${u[o]}` : tens[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return r ? `${u[h]} hundred ${n2wEn(r)}` : `${u[h]} hundred`;
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000), r = n % 1000;
    return r ? `${n2wEn(k)} thousand ${n2wEn(r)}` : `${n2wEn(k)} thousand`;
  }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  return r ? `${n2wEn(m)} million ${n2wEn(r)}` : `${n2wEn(m)} million`;
}

/* ─── Amount → words (5 décimales) ─────────────────────────────────────── */
function amountToWords(amount: number, lang: "fr" | "en"): string {
  const intPart = Math.floor(amount);
  const decStr = amount.toFixed(5).split(".")[1] ?? "00000";
  const decNum = parseInt(decStr, 10);
  const fn = lang === "fr" ? n2wFr : n2wEn;
  const intWords = fn(intPart);
  const dollarLabel = intPart <= 1 ? "dollar" : "dollars";
  if (decNum === 0) return `${intWords} ${dollarLabel}`;
  const decWords = fn(decNum);
  const centLabel = lang === "fr" ? "cent-millièmes" : "hundred-thousandths";
  return `${intWords} ${dollarLabel} et ${decWords} ${centLabel}`;
}

/* ─── Format USD ─────────────────────────────────────────────────────────── */
function fmtUsd(n: number): string {
  return `$ ${n.toFixed(5)}`;
}

/* ─── Reçu individuel HTML (A4) ─────────────────────────────────────────── */
function buildReceiptHtml(r: PaymentRecord, lang: string): string {
  const methodLabel: Record<string, string> = {
    CASH: "Cash / Espèces",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money",
  };
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé ✔",
    PENDING: "En attente ⏳",
    FAILED: "Échoué ✖",
  };
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Reçu ${r.transactionNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 20mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #0d1b2a; background: #fff; font-size: 13px; }
    .page { max-width: 760px; margin: 0 auto; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px double #1e3a5f; padding-bottom:14px; margin-bottom:20px; }
    .school-name { font-size:20px; font-weight:bold; color:#1e3a5f; letter-spacing:1px; }
    .school-sub  { font-size:11px; color:#64748b; margin-top:3px; }
    .tx-badge { border:2px solid #1e3a5f; padding:8px 14px; text-align:center; border-radius:4px; }
    .tx-badge-label { font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; }
    .tx-badge-value { font-size:15px; font-weight:bold; color:#1e3a5f; margin-top:4px; font-family:monospace; }
    .receipt-title { text-align:center; font-size:18px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; border:2px solid #0d1b2a; padding:10px 0; margin-bottom:24px; }
    .field { display:flex; align-items:flex-start; border-bottom:1px dotted #cbd5e1; padding:9px 0; }
    .field-label { width:210px; flex-shrink:0; font-weight:bold; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#475569; padding-right:12px; padding-top:2px; }
    .field-value { flex:1; font-size:14px; color:#0d1b2a; }
    .field-value.accent { font-size:17px; font-weight:bold; color:#1e3a5f; }
    .amount-block { border:2px solid #1e3a5f; border-radius:6px; padding:16px 20px; margin:20px 0; background:#f8fafc; }
    .amount-block-top { font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; margin-bottom:8px; }
    .amount-figure { font-size:30px; font-weight:bold; color:#1e3a5f; font-family:'Courier New', monospace; }
    .amount-words-line { margin-top:10px; padding-top:10px; border-top:1px solid #e2e8f0; font-style:italic; font-size:13px; color:#334155; }
    .amount-words-line strong { font-style:normal; font-weight:bold; }
    .sig-section { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:44px; }
    .sig-box { border:1px solid #475569; padding:14px; min-height:110px; display:flex; flex-direction:column; }
    .sig-box-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#475569; font-weight:bold; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:8px; }
    .footer { margin-top:28px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px; }
    .footer strong { color:#475569; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="school-name">EduPay Smart School</div>
      <div class="school-sub">Système de gestion des paiements scolaires</div>
    </div>
    <div class="tx-badge">
      <div class="tx-badge-label">N° de Transaction</div>
      <div class="tx-badge-value">${r.transactionNumber}</div>
    </div>
  </div>
  <div class="receipt-title">Reçu de Paiement Officiel</div>
  <div class="field">
    <span class="field-label">Date &amp; Heure</span>
    <span class="field-value">${r.date}</span>
  </div>
  <div class="field">
    <span class="field-label">Nom du Parent</span>
    <span class="field-value accent">${r.parentFullName}</span>
  </div>
  <div class="field">
    <span class="field-label">Motif du Paiement</span>
    <span class="field-value">${r.reason}</span>
  </div>
  <div class="field">
    <span class="field-label">Mode de Paiement</span>
    <span class="field-value">${methodLabel[r.method] ?? r.method}</span>
  </div>
  <div class="field">
    <span class="field-label">Statut</span>
    <span class="field-value">${statusLabel[r.status] ?? r.status}</span>
  </div>
  <div class="amount-block">
    <div class="amount-block-top">Montant réglé — Dollars Américains (USD)</div>
    <div class="amount-figure">$ ${r.amount.toFixed(5)}</div>
    <div class="amount-words-line">
      <strong>En toutes lettres :</strong> ${r.amountWords}
    </div>
  </div>
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-box-title">Signature du Responsable</div>
    </div>
    <div class="sig-box">
      <div class="sig-box-title">Cachet de l'École</div>
    </div>
  </div>
  <div class="footer">
    Ce reçu a été généré officiellement par le système <strong>EduPay Smart System</strong> &bull;
    Réf. <strong>${r.transactionNumber}</strong> &bull;
    ${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
  </div>
</div>
</body>
</html>`;
}

/* ─── État financier HTML (général ou par parent) ───────────────────────── */
function buildReportHtml(payments: PaymentRecord[], filterParent?: string): string {
  const filtered = filterParent
    ? payments.filter((p) => p.parentFullName.toLowerCase().includes(filterParent.toLowerCase()))
    : payments;

  const byParent = filtered.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
    if (!acc[p.parentFullName]) acc[p.parentFullName] = [];
    acc[p.parentFullName].push(p);
    return acc;
  }, {});

  const grandTotal     = filtered.reduce((s, p) => s + p.amount, 0);
  const completedTotal = filtered.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0);
  const pendingTotal   = filtered.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
  const failedTotal    = filtered.filter((p) => p.status === "FAILED").reduce((s, p) => s + p.amount, 0);

  const methodLabel: Record<string, string> = {
    CASH: "Cash / Espèces", AIRTEL_MONEY: "Airtel Money", MPESA: "M-Pesa", ORANGE_MONEY: "Orange Money",
  };
  const statusColor: Record<string, string> = {
    COMPLETED: "#16a34a", PENDING: "#d97706", FAILED: "#dc2626",
  };
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé", PENDING: "En attente", FAILED: "Échoué",
  };

  const byMethod = filtered.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  const methodRows = Object.entries(byMethod)
    .map(([m, total]) => `<tr>
      <td style="padding:5px 10px">${methodLabel[m] ?? m}</td>
      <td style="padding:5px 10px; font-family:monospace; font-weight:bold; text-align:right; color:#1e3a5f">$ ${total.toFixed(5)}</td>
    </tr>`)
    .join("");

  const parentBlocks = Object.entries(byParent).map(([parent, recs]) => {
    const total = recs.reduce((s, r) => s + r.amount, 0);
    const rows = recs.map((r) => `<tr>
      <td style="padding:6px 8px; font-family:monospace; font-size:11px; color:#475569">${r.transactionNumber}</td>
      <td style="padding:6px 8px; font-size:11px; white-space:nowrap">${r.date.split(",").slice(0, 2).join(",")}</td>
      <td style="padding:6px 8px; font-size:11px">${r.reason}</td>
      <td style="padding:6px 8px; font-size:11px">${methodLabel[r.method] ?? r.method}</td>
      <td style="padding:6px 8px; text-align:right; font-family:monospace; font-weight:bold; font-size:12px">$ ${r.amount.toFixed(5)}</td>
      <td style="padding:6px 8px; text-align:center; font-size:11px; font-weight:bold; color:${statusColor[r.status] ?? "#111"}">${statusLabel[r.status] ?? r.status}</td>
    </tr>`).join("");

    return `<div style="margin-bottom:32px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1e3a5f; color:#fff; padding:10px 14px; border-radius:4px 4px 0 0;">
        <div style="font-weight:bold; font-size:14px">${parent}</div>
        <div style="font-family:monospace; font-weight:bold; font-size:14px">Total : $ ${total.toFixed(5)}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-top:none; font-size:12px;">
        <thead style="background:#f1f5f9;">
          <tr>
            <th style="padding:7px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">N° Transaction</th>
            <th style="padding:7px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">Date</th>
            <th style="padding:7px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">Motif</th>
            <th style="padding:7px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">Mode</th>
            <th style="padding:7px 8px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">Montant (USD)</th>
            <th style="padding:7px 8px; text-align:center; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">Statut</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc; border-top:2px solid #1e3a5f">
            <td colspan="4" style="padding:8px; font-weight:bold; font-size:12px; text-align:right">Sous-total :</td>
            <td style="padding:8px; text-align:right; font-family:monospace; font-weight:bold; font-size:13px; color:#1e3a5f">$ ${total.toFixed(5)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }).join("");

  const title = filterParent ? `État Financier — ${filterParent}` : "État Général des Paiements";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0d1b2a; background: #fff; font-size: 12px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px double #1e3a5f; padding-bottom:14px; margin-bottom:20px;">
    <div>
      <div style="font-size:20px; font-weight:bold; color:#1e3a5f; letter-spacing:1px">EduPay Smart School</div>
      <div style="font-size:11px; color:#64748b; margin-top:3px">Système de gestion des paiements — Tous montants en USD (Dollars Américains)</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px; color:#64748b">Imprimé le</div>
      <div style="font-weight:bold; font-size:13px">${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}</div>
      <div style="font-size:11px; color:#64748b">${new Date().toLocaleTimeString("fr-FR")}</div>
    </div>
  </div>

  <div style="text-align:center; font-size:17px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; border:2px solid #0d1b2a; padding:10px 0; margin-bottom:24px;">
    ${title}
  </div>

  <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:24px;">
    <div style="border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; background:#f8fafc;">
      <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Total encaissé (USD)</div>
      <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${grandTotal.toFixed(5)}</div>
      <div style="font-size:9px; color:#94a3b8; margin-top:2px;">${filtered.length} transaction${filtered.length > 1 ? "s" : ""}</div>
    </div>
    <div style="border:1px solid #d1fae5; border-radius:6px; padding:12px 14px; background:#f0fdf4;">
      <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Paiements réglés</div>
      <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#16a34a;">$ ${completedTotal.toFixed(5)}</div>
    </div>
    <div style="border:1px solid #fef3c7; border-radius:6px; padding:12px 14px; background:#fffbeb;">
      <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">En attente</div>
      <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#d97706;">$ ${pendingTotal.toFixed(5)}</div>
    </div>
    <div style="border:1px solid #fee2e2; border-radius:6px; padding:12px 14px; background:#fef2f2;">
      <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Échoués</div>
      <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#dc2626;">$ ${failedTotal.toFixed(5)}</div>
    </div>
  </div>

  ${Object.keys(byMethod).length > 0 ? `
  <div style="margin-bottom:24px;">
    <div style="font-weight:bold; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#1e3a5f; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">Répartition par mode de paiement</div>
    <table style="border-collapse:collapse; font-size:12px; border:1px solid #e2e8f0;">
      <thead style="background:#f1f5f9;"><tr>
        <th style="padding:6px 10px; text-align:left; font-size:10px; text-transform:uppercase; color:#475569">Mode</th>
        <th style="padding:6px 10px; text-align:right; font-size:10px; text-transform:uppercase; color:#475569">Total (USD)</th>
      </tr></thead>
      <tbody>${methodRows}</tbody>
    </table>
  </div>` : ""}

  ${parentBlocks || '<p style="color:#64748b; text-align:center; padding:40px">Aucun paiement trouvé.</p>'}

  <div style="border-top:3px double #1e3a5f; padding-top:16px; display:flex; justify-content:flex-end; align-items:center; gap:20px; margin-top:12px;">
    <span style="font-size:14px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">TOTAL GÉNÉRAL (USD)</span>
    <span style="font-size:22px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${grandTotal.toFixed(5)}</span>
  </div>
  <div style="margin-top:28px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px;">
    Document généré officiellement par <strong>EduPay Smart System</strong> &bull;
    ${new Date().toLocaleString("fr-FR")}
  </div>
</body>
</html>`;
}

/* ─── Ouverture popup + impression ──────────────────────────────────────── */
function printHtml(html: string) {
  const popup = window.open("", "_blank", "width=900,height=1200");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => { popup.print(); }, 600);
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
type PaymentRecord = {
  id: string;
  transactionNumber: string;
  date: string;
  parentFullName: string;
  reason: string;
  amount: number;
  amountWords: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
  status: "COMPLETED" | "PENDING" | "FAILED";
};

type FormState = {
  parentFullName: string;
  reason: string;
  amount: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
  status: "COMPLETED" | "PENDING" | "FAILED";
};

type View = "form" | "receipt" | "history" | "report";

const EMPTY_FORM: FormState = {
  parentFullName: "", reason: "", amount: "", method: "CASH", status: "COMPLETED",
};

const STORAGE_KEY = "edupay_payments_v2";

function loadPayments(): PaymentRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function savePayments(ps: PaymentRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ps));
}

const METHOD_OPTIONS = [
  { value: "CASH",         label: "💵 Cash / Espèces" },
  { value: "AIRTEL_MONEY", label: "📱 Airtel Money" },
  { value: "MPESA",        label: "📲 M-Pesa" },
  { value: "ORANGE_MONEY", label: "🟠 Orange Money" },
];

const STATUS_OPTIONS = [
  { value: "COMPLETED", label: "✔ Réglé" },
  { value: "PENDING",   label: "⏳ En attente" },
  { value: "FAILED",    label: "✖ Échoué" },
];

/* ─── Badge statut ───────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    PENDING:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
    FAILED:    "bg-red-500/15 text-red-300 border-red-500/30",
  };
  const lbl: Record<string, string> = {
    COMPLETED: "Réglé", PENDING: "En attente", FAILED: "Échoué",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg[status] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {lbl[status] ?? status}
    </span>
  );
}

/* ─── Icône imprimante ───────────────────────────────────────────────────── */
function PrintIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M6 9V2h12v7" />
      <rect x="3" y="9" width="18" height="10" rx="2" />
      <path d="M6 19v-5h12v5" />
    </svg>
  );
}

/* ─── Page principale ────────────────────────────────────────────────────── */
export function PaymentsPage() {
  const { t, lang } = useI18n();
  const [view, setView]                     = useState<View>("form");
  const [payments, setPayments]             = useState<PaymentRecord[]>(loadPayments);
  const [form, setForm]                     = useState<FormState>(EMPTY_FORM);
  const [txNumber]                          = useState<string>(generateTxNumber);
  const [fieldErrors, setFieldErrors]       = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError]             = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<PaymentRecord | null>(null);
  // Historique
  const [searchQuery, setSearchQuery]       = useState("");
  const [filterStatus, setFilterStatus]     = useState("ALL");
  const [filterMethod, setFilterMethod]     = useState("ALL");
  // État
  const [reportSearch, setReportSearch]     = useState("");

  useEffect(() => { savePayments(payments); }, [payments]);

  const amountNum = parseFloat(form.amount) || 0;
  const amountWords = useMemo(() => {
    if (amountNum <= 0) return "—";
    return amountToWords(amountNum, lang as "fr" | "en");
  }, [amountNum, lang]);

  const filteredPayments = useMemo(() => payments.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q
      || p.parentFullName.toLowerCase().includes(q)
      || p.reason.toLowerCase().includes(q)
      || p.transactionNumber.toLowerCase().includes(q);
    return matchQ
      && (filterStatus === "ALL" || p.status === filterStatus)
      && (filterMethod === "ALL" || p.method === filterMethod);
  }), [payments, searchQuery, filterStatus, filterMethod]);

  const stats = useMemo(() => ({
    total:     payments.reduce((s, p) => s + p.amount, 0),
    completed: payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0),
    pending:   payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0),
    count:     payments.length,
  }), [payments]);

  const validate = () => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.parentFullName.trim()) errs.parentFullName = t("pmRequired");
    if (!form.reason.trim())         errs.reason         = t("pmRequired");
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = t("pmRequired");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setApiError(null);

    const finalAmount = parseFloat(parseFloat(form.amount).toFixed(5));
    const now = new Date();
    const dateStr = now.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    const record: PaymentRecord = {
      id: `demo-${Date.now()}`,
      transactionNumber: txNumber,
      date: dateStr,
      parentFullName: form.parentFullName.trim(),
      reason: form.reason.trim(),
      amount: finalAmount,
      amountWords: amountToWords(finalAmount, lang as "fr" | "en"),
      method: form.method,
      status: form.status,
    };

    try {
      const created = await api<{ payment: { id: string } }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          parentFullName: record.parentFullName,
          reason: record.reason,
          amount: record.amount,
          method: record.method,
          transactionNumber: txNumber,
          status: record.status,
        }),
      });
      record.id = created?.payment?.id ?? record.id;
    } catch { /* Mode démo — reçu généré même sans base de données */ }

    setPayments((prev) => [record, ...prev]);
    setSaving(false);
    setCurrentReceipt(record);
    setView("receipt");
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  const deletePayment = (id: string) =>
    setPayments((prev) => prev.filter((p) => p.id !== id));

  const changeStatus = (id: string, status: PaymentRecord["status"]) =>
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  /* ── Barre de navigation ─────────────────────────────────────────────── */
  const NavBar = () => (
    <div className="flex flex-wrap gap-2 mb-6">
      {(["form", "history", "report"] as View[]).map((v) => {
        const labels: Record<string, string> = {
          form:    "＋ " + t("newPaymentBtn"),
          history: "📋 Historique (" + payments.length + ")",
          report:  "📊 État des Paiements",
        };
        return (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === v
                ? "bg-brand-600 text-white shadow-lg shadow-brand-500/20"
                : "border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400"
            }`}
          >
            {labels[v]}
          </button>
        );
      })}
      {currentReceipt && (
        <button
          onClick={() => setView("receipt")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            view === "receipt"
              ? "bg-brand-600 text-white shadow-lg shadow-brand-500/20"
              : "border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400"
          }`}
        >
          🧾 Dernier reçu
        </button>
      )}
    </div>
  );

  /* ── Bandeau de statistiques ─────────────────────────────────────────── */
  const StatsBanner = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { label: "Total encaissé",   value: fmtUsd(stats.total),     color: "text-brand-300"   },
        { label: "Réglés",           value: fmtUsd(stats.completed), color: "text-emerald-300" },
        { label: "En attente",       value: fmtUsd(stats.pending),   color: "text-amber-300"   },
        { label: "Transactions",     value: String(stats.count),     color: "text-white"       },
      ].map((s) => (
        <div key={s.label} className="card py-4 px-5">
          <p className="text-xs text-ink-dim uppercase tracking-wide mb-1">{s.label}</p>
          <p className={`font-mono text-lg font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-ink-dim mt-0.5">USD</p>
        </div>
      ))}
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════
     VUE REÇU
  ════════════════════════════════════════════════════════════════════════ */
  if (view === "receipt" && currentReceipt) {
    const r = currentReceipt;
    return (
      <div className="space-y-6 pb-10 animate-fadeInUp">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">{t("receiptTitle")}</h1>
            <p className="text-ink-dim mt-1 text-sm">{t("receiptSuccess")}</p>
          </div>
          <button
            onClick={() => setView("form")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400 transition-all text-sm font-semibold"
          >
            ＋ {t("newPaymentBtn")}
          </button>
        </div>

        <div className="card overflow-hidden">
          {/* En-tête */}
          <div className="flex items-start justify-between border-b border-slate-700 pb-6 mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-white">EduPay Smart School</h2>
              <p className="text-xs text-ink-dim mt-1">{t("paymentsSubtitle")}</p>
            </div>
            <div className="text-right border border-brand-500/50 rounded-lg px-4 py-2 bg-brand-500/10">
              <p className="text-xs text-ink-dim uppercase tracking-widest mb-1">{t("txNumber")}</p>
              <p className="font-mono text-sm font-bold text-brand-300">{r.transactionNumber}</p>
            </div>
          </div>

          <div className="text-center py-3 mb-6 border border-slate-600 rounded-lg">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-white">Reçu de Paiement Officiel</p>
          </div>

          {/* Champs */}
          <div className="space-y-0 divide-y divide-slate-800">
            {([
              { label: t("date"),           value: r.date },
              { label: t("parentFullName"), value: r.parentFullName, accent: true },
              { label: t("reason"),         value: r.reason },
              { label: t("method"),         value: r.method.replace(/_/g, " ") },
              { label: "Statut",            value: r.status, badge: true },
            ] as { label: string; value: string; accent?: boolean; badge?: boolean }[]).map((row) => (
              <div key={row.label} className="flex items-start gap-4 py-3">
                <span className="w-44 flex-shrink-0 text-xs font-bold uppercase tracking-wide text-ink-dim pt-0.5">
                  {row.label}
                </span>
                {row.badge
                  ? <StatusBadge status={row.value} />
                  : <span className={`flex-1 ${row.accent ? "text-lg font-bold text-white" : "text-sm text-slate-200"}`}>{row.value}</span>
                }
              </div>
            ))}
          </div>

          {/* Montant */}
          <div className="mt-6 rounded-xl border-2 border-brand-500/50 bg-brand-500/5 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-3">{t("amountUsd")}</p>
            <p className="font-mono text-4xl font-bold text-brand-300">$ {r.amount.toFixed(5)}</p>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-ink-dim uppercase tracking-wide mb-1">{t("amountInWords")}</p>
              <p className="text-sm font-semibold text-emerald-300 italic">{r.amountWords}</p>
            </div>
          </div>

          {/* Signature / Cachet */}
          <div className="mt-8 grid grid-cols-2 gap-6">
            {[t("signature"), t("schoolStamp")].map((label) => (
              <div key={label} className="border-2 border-dashed border-slate-600 rounded-xl min-h-32 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-dim px-4 pt-3 pb-2 border-b border-slate-700">
                  {label}
                </p>
                <div className="flex-1" />
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-ink-dim">
            {t("receiptFooter")} • {r.transactionNumber} • {new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => printHtml(buildReceiptHtml(r, lang))}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            <PrintIcon className="w-5 h-5" /> {t("printPdf")}
          </button>
          <button
            onClick={() => setView("history")}
            className="px-5 py-3 rounded-xl border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400 transition-all font-semibold text-sm"
          >
            Voir l'historique
          </button>
          <button
            onClick={() => setView("report")}
            className="px-5 py-3 rounded-xl border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400 transition-all font-semibold text-sm"
          >
            État des paiements
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     VUE HISTORIQUE
  ════════════════════════════════════════════════════════════════════════ */
  if (view === "history") {
    return (
      <div className="space-y-6 pb-10">
        <div className="animate-fadeInDown">
          <h1 className="font-display text-3xl font-bold text-white">Historique des Paiements</h1>
          <p className="text-ink-dim mt-2 text-sm">Tous les paiements enregistrés — Montants en dollars américains (USD)</p>
        </div>
        <NavBar />
        <StatsBanner />

        {/* Filtres */}
        <div className="card">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Recherche</label>
              <input
                type="text"
                placeholder="Nom, motif, numéro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Statut</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full">
                <option value="ALL">Tous les statuts</option>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Mode de paiement</label>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="w-full">
                <option value="ALL">Tous les modes</option>
                {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="card overflow-x-auto">
          {filteredPayments.length === 0 ? (
            <p className="text-center text-ink-dim py-12">Aucun paiement trouvé.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {["N° Transaction", "Date", "Parent", "Motif", "Mode", "Montant (USD)", "Statut", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-bold uppercase tracking-wide text-ink-dim py-3 px-3 first:pl-0 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="py-3 px-3 first:pl-0 font-mono text-xs text-brand-300">{p.transactionNumber}</td>
                    <td className="py-3 px-3 text-xs text-ink-dim whitespace-nowrap">
                      {p.date.split(",").slice(0, 2).join(",")}
                    </td>
                    <td className="py-3 px-3 font-semibold text-white">{p.parentFullName}</td>
                    <td className="py-3 px-3 text-ink-dim max-w-[140px] truncate" title={p.reason}>{p.reason}</td>
                    <td className="py-3 px-3 text-xs text-ink-dim">{p.method.replace(/_/g, " ")}</td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-300 whitespace-nowrap">
                      $ {p.amount.toFixed(5)}
                    </td>
                    <td className="py-3 px-3"><StatusBadge status={p.status} /></td>
                    <td className="py-3 px-3 last:pr-0">
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title="Imprimer le reçu"
                          onClick={() => printHtml(buildReceiptHtml(p, lang))}
                          className="p-1.5 rounded bg-brand-600/20 text-brand-300 hover:bg-brand-600/40 transition-colors"
                        >
                          <PrintIcon className="w-3.5 h-3.5" />
                        </button>
                        <select
                          value={p.status}
                          onChange={(e) => changeStatus(p.id, e.target.value as PaymentRecord["status"])}
                          className="text-xs rounded px-1.5 py-1 bg-slate-700 border-slate-600 text-white"
                          title="Changer le statut"
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <button
                          title="Supprimer"
                          onClick={() => { if (window.confirm("Supprimer ce paiement ?")) deletePayment(p.id); }}
                          className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-500/30">
                  <td colSpan={5} className="py-4 pl-0 text-sm font-bold text-ink-dim uppercase tracking-wide">
                    Total ({filteredPayments.length} paiement{filteredPayments.length > 1 ? "s" : ""})
                  </td>
                  <td className="py-4 font-mono font-bold text-xl text-brand-300">
                    $ {filteredPayments.reduce((s, p) => s + p.amount, 0).toFixed(5)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {filteredPayments.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={() => printHtml(buildReportHtml(filteredPayments))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-brand-500/40 text-brand-300 hover:bg-brand-600/20 transition-all text-sm font-semibold"
            >
              <PrintIcon /> Imprimer la liste filtrée
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     VUE ÉTAT DES PAIEMENTS
  ════════════════════════════════════════════════════════════════════════ */
  if (view === "report") {
    const reportPayments = reportSearch
      ? payments.filter((p) => p.parentFullName.toLowerCase().includes(reportSearch.toLowerCase()))
      : payments;

    const byParent = reportPayments.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
      if (!acc[p.parentFullName]) acc[p.parentFullName] = [];
      acc[p.parentFullName].push(p);
      return acc;
    }, {});

    const reportTotal = reportPayments.reduce((s, p) => s + p.amount, 0);

    return (
      <div className="space-y-6 pb-10">
        <div className="animate-fadeInDown">
          <h1 className="font-display text-3xl font-bold text-white">État des Paiements</h1>
          <p className="text-ink-dim mt-2 text-sm">
            Situation financière {reportSearch ? `— ${reportSearch}` : "générale"} • Tous les montants en USD
          </p>
        </div>
        <NavBar />
        <StatsBanner />

        {/* Recherche + impression */}
        <div className="card flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">
              Filtrer par parent (laisser vide = état général)
            </label>
            <input
              type="text"
              placeholder="Nom du parent..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <button
            onClick={() => printHtml(buildReportHtml(payments, reportSearch || undefined))}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20 whitespace-nowrap"
          >
            <PrintIcon className="w-5 h-5" />
            {reportSearch ? `Imprimer l'état de ${reportSearch}` : "Imprimer l'état général"}
          </button>
        </div>

        {/* Cartes par parent */}
        {Object.keys(byParent).length === 0 ? (
          <div className="card text-center py-12 text-ink-dim">Aucun paiement enregistré.</div>
        ) : (
          Object.entries(byParent).map(([parent, recs]) => {
            const parentTotal  = recs.reduce((s, r) => s + r.amount, 0);
            const completedAmt = recs.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
            const pendingAmt   = recs.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
            const failedAmt    = recs.filter((r) => r.status === "FAILED").reduce((s, r) => s + r.amount, 0);

            return (
              <div key={parent} className="card">
                {/* En-tête parent */}
                <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-600/30 flex items-center justify-center text-brand-300 font-bold text-lg">
                      {parent[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{parent}</p>
                      <p className="text-xs text-ink-dim">{recs.length} transaction{recs.length > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim uppercase tracking-wide">Total payé</p>
                    <p className="font-mono font-bold text-xl text-brand-300">$ {parentTotal.toFixed(5)}</p>
                  </div>
                </div>

                {/* Mini stats parent */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">Réglé</p>
                    <p className="font-mono text-sm font-bold text-emerald-300">$ {completedAmt.toFixed(5)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">En attente</p>
                    <p className="font-mono text-sm font-bold text-amber-300">$ {pendingAmt.toFixed(5)}</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">Échoués</p>
                    <p className="font-mono text-sm font-bold text-red-300">$ {failedAmt.toFixed(5)}</p>
                  </div>
                </div>

                {/* Tableau des transactions */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {["N° Transaction", "Date", "Motif", "Mode", "Montant USD", "Statut", ""].map((h) => (
                          <th key={h} className="text-left text-xs font-bold uppercase tracking-wide text-ink-dim py-2 px-2 first:pl-0 last:pr-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {recs.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-2 first:pl-0 font-mono text-xs text-brand-300">{r.transactionNumber}</td>
                          <td className="py-2.5 px-2 text-xs text-ink-dim whitespace-nowrap">
                            {r.date.split(",").slice(0, 2).join(",")}
                          </td>
                          <td className="py-2.5 px-2 text-ink-dim">{r.reason}</td>
                          <td className="py-2.5 px-2 text-xs text-ink-dim">{r.method.replace(/_/g, " ")}</td>
                          <td className="py-2.5 px-2 font-mono font-bold text-emerald-300">$ {r.amount.toFixed(5)}</td>
                          <td className="py-2.5 px-2"><StatusBadge status={r.status} /></td>
                          <td className="py-2.5 px-2 last:pr-0">
                            <button
                              title="Imprimer le reçu"
                              onClick={() => printHtml(buildReceiptHtml(r, lang))}
                              className="p-1.5 rounded bg-brand-600/20 text-brand-300 hover:bg-brand-600/40 transition-colors"
                            >
                              <PrintIcon className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-brand-500/30">
                        <td colSpan={4} className="py-3 pl-0 text-xs font-bold text-ink-dim uppercase">Sous-total</td>
                        <td className="py-3 font-mono font-bold text-brand-300">$ {parentTotal.toFixed(5)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Bouton impression par parent */}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => printHtml(buildReportHtml(payments, parent))}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-500/40 text-brand-300 hover:bg-brand-600/20 transition-all text-sm font-semibold"
                  >
                    <PrintIcon /> Imprimer l'état de {parent}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Total général */}
        {Object.keys(byParent).length > 0 && (
          <div className="card flex items-center justify-between border-2 border-brand-500/30">
            <p className="text-sm font-bold text-ink-dim uppercase tracking-widest">
              {reportSearch ? `Total — ${reportSearch}` : "TOTAL GÉNÉRAL"}
            </p>
            <div className="text-right">
              <p className="font-mono text-2xl font-bold text-brand-300">$ {reportTotal.toFixed(5)}</p>
              <p className="text-xs text-ink-dim mt-0.5">Dollars américains (USD)</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     VUE FORMULAIRE (nouveau paiement)
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-8 pb-10">
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("newPayment")}</h1>
        <p className="text-ink-dim mt-2 text-sm">{t("paymentFormSubtitle")}</p>
      </div>

      <NavBar />
      <StatsBanner />

      <div className="card animate-fadeInUp">
        <h2 className="font-display text-xl font-bold text-white mb-6">{t("paymentDetails")}</h2>

        {/* Numéro de transaction auto */}
        <div className="mb-6 p-4 rounded-xl bg-slate-900/60 border border-brand-500/30 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-1">{t("txNumber")}</p>
            <p className="font-mono text-base font-bold text-brand-300">{txNumber}</p>
          </div>
          <p className="text-xs text-ink-dim italic">{t("txAutoGenerated")}</p>
        </div>

        {apiError && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nom complet du parent */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
              {t("parentFullName")} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.parentFullName}
              onChange={(e) => setField("parentFullName", e.target.value)}
              placeholder="Ex. Kabila wa Muzuri Jean"
              className={`w-full ${fieldErrors.parentFullName ? "border-danger" : ""}`}
            />
            {fieldErrors.parentFullName && (
              <p className="text-xs text-danger">{fieldErrors.parentFullName}</p>
            )}
          </div>

          {/* Motif */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
              {t("reason")} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setField("reason", e.target.value)}
              placeholder="Ex. Frais scolaires 1er trimestre 2026"
              className={`w-full ${fieldErrors.reason ? "border-danger" : ""}`}
            />
            {fieldErrors.reason && <p className="text-xs text-danger">{fieldErrors.reason}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Montant USD */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                {t("amountUsd")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300 font-bold text-sm">$</span>
                <input
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0.00000"
                  className={`w-full pl-7 font-mono ${fieldErrors.amount ? "border-danger" : ""}`}
                />
              </div>
              {fieldErrors.amount && <p className="text-xs text-danger">{fieldErrors.amount}</p>}
            </div>

            {/* Mode de paiement */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">{t("method")}</label>
              <select
                value={form.method}
                onChange={(e) => setField("method", e.target.value as FormState["method"])}
                className="w-full"
              >
                {METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Statut */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Statut du paiement</label>
            <div className="flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all text-sm font-semibold ${
                    form.status === o.value
                      ? "border-brand-500 bg-brand-500/15 text-white"
                      : "border-slate-600 text-ink-dim hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={o.value}
                    checked={form.status === o.value}
                    onChange={() => setField("status", o.value as FormState["status"])}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {/* Montant en toutes lettres — temps réel */}
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-2">{t("amountInWords")}</p>
            {amountNum > 0 ? (
              <p className="text-sm font-semibold text-emerald-300 italic">{amountWords}</p>
            ) : (
              <p className="text-xs text-ink-dim italic">{t("amountEnterToSee")}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-base transition-all active:scale-[.98] shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Enregistrement..." : t("saveAndGenerateReceipt")}
          </button>
        </form>
      </div>
    </div>
  );
}
import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

/* â”€â”€â”€ Transaction number generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function generateTxNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `TXN-${date}-${rand}`;
}

/* â”€â”€â”€ French number to words (70/80/90 correct) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function n2wFr(n: number): string {
  if (n === 0) return "zÃ©ro";
  if (n < 0) return "moins " + n2wFr(-n);
  const u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
    "dix-sept", "dix-huit", "dix-neuf"];
  const t = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];
  if (n < 20) return u[n];
  if (n < 70) {
    const tens = Math.floor(n / 10), ones = n % 10;
    if (ones === 0) return t[tens];
    if (ones === 1) return `${t[tens]} et un`;
    return `${t[tens]}-${u[ones]}`;
  }
  if (n < 80) {
    const ones = n - 60;
    if (ones === 11) return "soixante et onze";
    return `soixante-${n2wFr(ones)}`;
  }
  if (n < 100) {
    const ones = n - 80;
    if (ones === 0) return "quatre-vingts";
    return `quatre-vingt-${u[ones] || n2wFr(ones)}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    const head = h === 1 ? "cent" : `${u[h]} cent`;
    if (rest === 0) return h === 1 ? "cent" : `${u[h]} cents`;
    return `${head} ${n2wFr(rest)}`;
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000), rest = n % 1000;
    const head = k === 1 ? "mille" : `${n2wFr(k)} mille`;
    return rest ? `${head} ${n2wFr(rest)}` : head;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000), rest = n % 1_000_000;
    const head = m === 1 ? "un million" : `${n2wFr(m)} millions`;
    return rest ? `${head} ${n2wFr(rest)}` : head;
  }
  const b = Math.floor(n / 1_000_000_000), rest = n % 1_000_000_000;
  const head = b === 1 ? "un milliard" : `${n2wFr(b)} milliards`;
  return rest ? `${head} ${n2wFr(rest)}` : head;
}

/* â”€â”€â”€ English number to words â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function n2wEn(n: number): string {
  if (n === 0) return "zero";
  const u = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return u[n];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return o ? `${tens[t]}-${u[o]}` : tens[t]; }
  if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return r ? `${u[h]} hundred ${n2wEn(r)}` : `${u[h]} hundred`; }
  if (n < 1_000_000) { const k = Math.floor(n / 1000), r = n % 1000; return r ? `${n2wEn(k)} thousand ${n2wEn(r)}` : `${n2wEn(k)} thousand`; }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  return r ? `${n2wEn(m)} million ${n2wEn(r)}` : `${n2wEn(m)} million`;
}

/* â”€â”€â”€ Amount to words with 5-decimal support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function amountToWords(amount: number, lang: "fr" | "en"): string {
  const intPart = Math.floor(amount);
  const decStr = amount.toFixed(5).split(".")[1] ?? "00000";
  const decNum = parseInt(decStr, 10);
  const fn = lang === "fr" ? n2wFr : n2wEn;
  const intWords = fn(intPart);
  const dollarLabel = intPart <= 1 ? "dollar" : "dollars";
  if (decNum === 0) return `${intWords} ${dollarLabel}`;
  const decWords = fn(decNum);
  const centLabel = lang === "fr" ? "cent-milliÃ¨mes" : "hundred-thousandths";
  return `${intWords} ${dollarLabel} et ${decWords} ${centLabel}`;
}

/* â”€â”€â”€ Receipt print HTML (A4, official) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function buildReceiptHtml(r: ReceiptData, lang: string): string {
  const methodLabel: Record<string, string> = {
    CASH: "Cash / EspÃ¨ces", AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa", ORANGE_MONEY: "Orange Money"
  };
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>ReÃ§u ${r.transactionNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 20mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #0d1b2a; background: #fff; font-size: 13px; }
    .page { max-width: 760px; margin: 0 auto; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px double #1e3a5f; padding-bottom:14px; margin-bottom:20px; }
    .school-name { font-size:20px; font-weight:bold; color:#1e3a5f; letter-spacing:1px; }
    .school-sub  { font-size:11px; color:#64748b; margin-top:3px; }
    .tx-badge { border:2px solid #1e3a5f; padding:8px 14px; text-align:center; border-radius:4px; }
    .tx-badge-label { font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; }
    .tx-badge-value { font-size:15px; font-weight:bold; color:#1e3a5f; margin-top:4px; font-family:monospace; }
    .receipt-title { text-align:center; font-size:18px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; border:2px solid #0d1b2a; padding:10px 0; margin-bottom:24px; }
    .field { display:flex; align-items:flex-start; border-bottom:1px dotted #cbd5e1; padding:9px 0; }
    .field-label { width:210px; flex-shrink:0; font-weight:bold; font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#475569; padding-right:12px; padding-top:2px; }
    .field-value { flex:1; font-size:14px; color:#0d1b2a; }
    .field-value.accent { font-size:17px; font-weight:bold; color:#1e3a5f; }
    .amount-block { border:2px solid #1e3a5f; border-radius:6px; padding:16px 20px; margin:20px 0; background:#f8fafc; }
    .amount-block-top { font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; margin-bottom:8px; }
    .amount-figure { font-size:30px; font-weight:bold; color:#1e3a5f; font-family:'Courier New', monospace; }
    .amount-words-line { margin-top:10px; padding-top:10px; border-top:1px solid #e2e8f0; font-style:italic; font-size:13px; color:#334155; }
    .amount-words-line strong { font-style:normal; font-weight:bold; }
    .sig-section { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:44px; }
    .sig-box { border:1px solid #475569; padding:14px; min-height:110px; display:flex; flex-direction:column; }
    .sig-box-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#475569; font-weight:bold; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:8px; }
    .footer { margin-top:28px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px; }
    .footer strong { color:#475569; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="school-name">EduPay Smart School</div>
      <div class="school-sub">SystÃ¨me de gestion des paiements scolaires</div>
    </div>
    <div class="tx-badge">
      <div class="tx-badge-label">NÂ° de Transaction</div>
      <div class="tx-badge-value">${r.transactionNumber}</div>
    </div>
  </div>
  <div class="receipt-title">ReÃ§u de Paiement Officiel</div>
  <div class="field">
    <span class="field-label">Date &amp; Heure</span>
    <span class="field-value">${r.date}</span>
  </div>
  <div class="field">
    <span class="field-label">Nom du Parent</span>
    <span class="field-value accent">${r.parentFullName}</span>
  </div>
  <div class="field">
    <span class="field-label">Motif du Paiement</span>
    <span class="field-value">${r.reason}</span>
  </div>
  <div class="field">
    <span class="field-label">Mode de Paiement</span>
    <span class="field-value">${methodLabel[r.method] ?? r.method}</span>
  </div>
  <div class="amount-block">
    <div class="amount-block-top">Montant rÃ©glÃ© (USD)</div>
    <div class="amount-figure">$ ${r.amount.toFixed(5)}</div>
    <div class="amount-words-line">
      <strong>En toutes lettres :</strong> ${r.amountWords}
    </div>
  </div>
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-box-title">Signature du Responsable</div>
    </div>
    <div class="sig-box">
      <div class="sig-box-title">Cachet de l'Ã‰cole</div>
    </div>
  </div>
  <div class="footer">
    Ce reÃ§u a Ã©tÃ© gÃ©nÃ©rÃ© officiellement par le systÃ¨me <strong>EduPay</strong> &bull;
    RÃ©f. <strong>${r.transactionNumber}</strong> &bull;
    ${new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
  </div>
</div>
</body></html>`;
}

/* â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type FormState = {
  parentFullName: string;
  reason: string;
  amount: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
};

type ReceiptData = {
  transactionNumber: string;
  date: string;
  parentFullName: string;
  reason: string;
  amount: number;
  amountWords: string;
  method: string;
  paymentId: string;
};

const EMPTY_FORM: FormState = { parentFullName: "", reason: "", amount: "", method: "CASH" };

const METHOD_OPTIONS = [
  { value: "CASH",         label: "ðŸ’° Cash / EspÃ¨ces" },
  { value: "AIRTEL_MONEY", label: "ðŸ“± Airtel Money" },
  { value: "MPESA",        label: "ðŸ“² M-Pesa" },
  { value: "ORANGE_MONEY", label: "ðŸŸ  Orange Money" }
];

/* â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export function PaymentsPage() {
  const { t, lang } = useI18n();
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [txNumber]                      = useState<string>(generateTxNumber);
  const [fieldErrors, setFieldErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [apiError, setApiError]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [receipt, setReceipt]           = useState<ReceiptData | null>(null);
  const receiptRef                      = useRef<HTMLDivElement>(null);

  const amountNum = parseFloat(form.amount) || 0;
  const amountWords = useMemo(() => {
    if (amountNum <= 0) return "â€”";
    return amountToWords(amountNum, lang as "fr" | "en");
  }, [amountNum, lang]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.parentFullName.trim()) errs.parentFullName = t("pmRequired");
    if (!form.reason.trim())         errs.reason         = t("pmRequired");
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = t("pmRequired");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setApiError(null);

    const finalAmount = parseFloat(parseFloat(form.amount).toFixed(5));
    const now = new Date();
    const dateStr = now.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    const receiptData: ReceiptData = {
      transactionNumber: txNumber,
      date: dateStr,
      parentFullName: form.parentFullName.trim(),
      reason: form.reason.trim(),
      amount: finalAmount,
      amountWords,
      method: form.method,
      paymentId: `demo-${Date.now()}`
    };

    try {
      const created = await api<{ payment: { id: string } }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          parentFullName: form.parentFullName.trim(),
          reason: form.reason.trim(),
          amount: finalAmount,
          method: form.method,
          transactionNumber: txNumber,
          status: "COMPLETED"
        })
      });
      receiptData.paymentId = created?.payment?.id ?? receiptData.paymentId;
    } catch {
      // Mode dÃ©mo : reÃ§u gÃ©nÃ©rÃ© mÃªme sans base de donnÃ©es
    }

    setSaving(false);
    setReceipt(receiptData);
  };

  const printPdf = () => {
    if (!receipt) return;
    const popup = window.open("", "_blank", "width=900,height=1200");
    if (!popup) return;
    popup.document.write(buildReceiptHtml(receipt, lang));
    popup.document.close();
    popup.focus();
    setTimeout(() => { popup.print(); }, 600);
  };

  const resetForm = () => {
    setReceipt(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setApiError(null);
  };

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  /* â”€â”€â”€ RECEIPT VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  if (receipt) {
    return (
      <div className="space-y-6 pb-10 animate-fadeInUp">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">{t("receiptTitle")}</h1>
            <p className="text-ink-dim mt-1 text-sm">{t("receiptSuccess")}</p>
          </div>
          <button
            onClick={resetForm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400 transition-all text-sm font-semibold"
          >
            ï¼‹ {t("newPaymentBtn")}
          </button>
        </div>

        <div ref={receiptRef} className="card overflow-hidden">
          {/* Official header */}
          <div className="flex items-start justify-between border-b border-slate-700 pb-6 mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-white">EduPay Smart School</h2>
              <p className="text-xs text-ink-dim mt-1">{t("paymentsSubtitle")}</p>
            </div>
            <div className="text-right border border-brand-500/50 rounded-lg px-4 py-2 bg-brand-500/10">
              <p className="text-xs text-ink-dim uppercase tracking-widest mb-1">{t("txNumber")}</p>
              <p className="font-mono text-sm font-bold text-brand-300">{receipt.transactionNumber}</p>
            </div>
          </div>

          {/* Title strip */}
          <div className="text-center py-3 mb-6 border border-slate-600 rounded-lg">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-white">{t("receiptTitle")}</p>
          </div>

          {/* Fields */}
          <div className="space-y-0 divide-y divide-slate-800">
            {([
              { label: t("date"),           value: receipt.date },
              { label: t("parentFullName"), value: receipt.parentFullName, accent: true },
              { label: t("reason"),         value: receipt.reason },
              { label: t("method"),         value: receipt.method.replace(/_/g, " ") }
            ] as { label: string; value: string; accent?: boolean }[]).map((row) => (
              <div key={row.label} className="flex items-start gap-4 py-3">
                <span className="w-44 flex-shrink-0 text-xs font-bold uppercase tracking-wide text-ink-dim pt-0.5">
                  {row.label}
                </span>
                <span className={`flex-1 ${row.accent ? "text-lg font-bold text-white" : "text-sm text-slate-200"}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Amount block */}
          <div className="mt-6 rounded-xl border-2 border-brand-500/50 bg-brand-500/5 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-3">{t("amountUsd")}</p>
            <p className="font-mono text-4xl font-bold text-brand-300">
              $ {receipt.amount.toFixed(5)}
            </p>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-ink-dim uppercase tracking-wide mb-1">{t("amountInWords")}</p>
              <p className="text-sm font-semibold text-emerald-300 italic">{receipt.amountWords}</p>
            </div>
          </div>

          {/* Signature & stamp */}
          <div className="mt-8 grid grid-cols-2 gap-6">
            {[t("signature"), t("schoolStamp")].map((label) => (
              <div key={label} className="border-2 border-dashed border-slate-600 rounded-xl min-h-32 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-dim px-4 pt-3 pb-2 border-b border-slate-700">
                  {label}
                </p>
                <div className="flex-1" />
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-ink-dim">
            {t("receiptFooter")} â€¢ {receipt.transactionNumber} â€¢ {new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={printPdf}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9V2h12v7" /><rect x="3" y="9" width="18" height="10" rx="2" />
              <path d="M6 19v-5h12v5" />
            </svg>
            {t("printPdf")}
          </button>
        </div>
      </div>
    );
  }

  /* â”€â”€â”€ FORM VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <div className="space-y-8 pb-10">
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("newPayment")}</h1>
        <p className="text-ink-dim mt-2 text-sm">{t("paymentFormSubtitle")}</p>
      </div>

      <div className="card animate-fadeInUp">
        <h2 className="font-display text-xl font-bold text-white mb-6">{t("paymentDetails")}</h2>

        {/* Transaction number â€” read only */}
        <div className="mb-6 p-4 rounded-xl bg-slate-900/60 border border-brand-500/30 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-1">{t("txNumber")}</p>
            <p className="font-mono text-base font-bold text-brand-300">{txNumber}</p>
          </div>
          <p className="text-xs text-ink-dim italic">{t("txAutoGenerated")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Parent full name */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
              {t("parentFullName")} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.parentFullName}
              onChange={(e) => setField("parentFullName", e.target.value)}
              placeholder="Ex. Kabila wa Muzuri Jean"
              className={`w-full ${fieldErrors.parentFullName ? "border-danger" : ""}`}
            />
            {fieldErrors.parentFullName && <p className="text-xs text-danger">{fieldErrors.parentFullName}</p>}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
              {t("reason")} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setField("reason", e.target.value)}
              placeholder="Ex. Frais scolaires 1er trimestre 2026"
              className={`w-full ${fieldErrors.reason ? "border-danger" : ""}`}
            />
            {fieldErrors.reason && <p className="text-xs text-danger">{fieldErrors.reason}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                {t("amountUsd")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300 font-bold text-sm">$</span>
                <input
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0.00000"
                  className={`w-full pl-7 font-mono ${fieldErrors.amount ? "border-danger" : ""}`}
                />
              </div>
              {fieldErrors.amount && <p className="text-xs text-danger">{fieldErrors.amount}</p>}
            </div>

            {/* Method */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                {t("method")}
              </label>
              <select
                value={form.method}
                onChange={(e) => setField("method", e.target.value as FormState["method"])}
                className="w-full"
              >
                {METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount in words â€” live */}
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-dim mb-2">{t("amountInWords")}</p>
            <p className={`font-semibold text-sm ${amountNum > 0 ? "text-emerald-300 italic" : "text-slate-600"}`}>
              {amountNum > 0 ? amountWords : t("amountEnterToSee")}
            </p>
          </div>

          {apiError && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
              {apiError}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-primary font-bold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("processing")}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4" /><rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {t("saveAndGenerateReceipt")}
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

