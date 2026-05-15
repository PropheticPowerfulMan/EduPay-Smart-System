import { useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { SearchField } from "../components/SearchField";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { buildReceiptVerificationUrl } from "../utils/receiptVerification";
import { exportWorkbook } from "../utils/financeExcel";

/* --- Transaction number generator ---------------------------------------- */
function generateTxNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `TXN-${date}-${rand}`;
}

/* --- French number to words (70/80/90 corrects) -------------------------- */
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

/* --- English number to words ---------------------------------------------- */
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

/* --- Amount to words (5 decimals) ---------------------------------------- */
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

/* --- Format USD ----------------------------------------------------------- */
function fmtUsd(n: number): string {
  return `$ ${n.toFixed(5)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainPrintText(value: string): string {
  return escapeHtml(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
  );
}

function makeSecurityHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function buildReceiptSecurity(r: Pick<PaymentRecord, "transactionNumber" | "date" | "parentFullName" | "paymentSubjectName" | "studentNames" | "reason" | "amount" | "method" | "status">) {
  const payload = [
    r.transactionNumber,
    r.date,
    getPaymentSubjectName(r).trim().toUpperCase(),
    r.reason.trim().toUpperCase(),
    r.amount.toFixed(5),
    r.method,
    r.status
  ].join("|");
  const hash = makeSecurityHash(payload);
  return {
    hash,
    verificationCode: `EDP-${hash.slice(0, 4)}-${hash.slice(4, 8)}`,
    sealCode: makeSecurityHash(`${hash}|EduPay|A5|Official`).slice(0, 6)
  };
}

function buildReceiptQrPayload(r: PaymentRecord): string {
  return buildReceiptVerificationUrl(r);
}

async function generateReceiptQrSvgMarkup(r: PaymentRecord): Promise<string> {
  const payload = buildReceiptQrPayload(r);
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: {
      dark: "#0f172a",
      light: "#ffffff"
    }
  });

  return svg
    .replace(/<\?xml[^>]*\?>\s*/i, "")
    .replace(
      "<svg ",
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code de transaction EduPay" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;max-width:100%;max-height:100%;" '
    );
}

function analyzeReceiptRisk(r: Pick<PaymentRecord, "parentFullName" | "paymentSubjectName" | "studentNames" | "reason" | "amount" | "status" | "method">) {
  const flags: string[] = [];
  if (r.amount >= 5000) flags.push("Montant élevé : double validation conseillée");
  if (r.status !== "COMPLETED") flags.push("Statut non réglé : ne pas libérer de quittance définitive");
  if (getPaymentSubjectName(r).trim().split(/\s+/).length < 2) flags.push("Identité courte : vérifier le dossier eleve");
  if (r.reason.trim().length < 8) flags.push("Motif trop court pour un audit robuste");
  if (r.method !== "CASH") flags.push("Paiement mobile : vérifier la référence opérateur");
  const score = Math.min(100, flags.length * 22 + (r.amount >= 10000 ? 18 : 0));
  return {
    score,
    level: score >= 60 ? "Vérification renforcée" : score >= 25 ? "Contrôle standard" : "Faible risque",
    flags
  };
}

function getMethodLabel(method: string) {
  const methodLabel: Record<string, string> = {
    CASH: "Cash / Espèces",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money",
  };
  return methodLabel[method] ?? method;
}

function getStatusLabel(status: string) {
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué",
  };
  return statusLabel[status] ?? status;
}

function buildReceiptMicroText(r: PaymentRecord) {
  const sec = buildReceiptSecurity(r);
  return `EDUPAY-OFFICIAL ${r.transactionNumber} ${sec.verificationCode} ${r.amount.toFixed(5)}USD ${r.status}`;
}

type ReceiptPrintFonts = {
  body: string;
  serif: string;
  mono: string;
  bodyLetterSpacing: string;
  serifLetterSpacing: string;
  bodyWeight: string;
  serifWeight: string;
};

function getReceiptPrintFonts(): ReceiptPrintFonts {
  if (typeof window === "undefined") {
    return {
      body: '"Manrope", ui-sans-serif, system-ui, sans-serif',
      serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      bodyLetterSpacing: "normal",
      serifLetterSpacing: "0.02em",
      bodyWeight: "500",
      serifWeight: "900"
    };
  }

  const root = document.querySelector<HTMLElement>("[data-receipt-preview-root]");
  const school = document.querySelector<HTMLElement>("[data-receipt-preview-school]");
  const mono = document.querySelector<HTMLElement>("[data-receipt-preview-mono]");
  const bodyStyles = window.getComputedStyle(root ?? document.body);
  const schoolStyles = window.getComputedStyle(school ?? root ?? document.body);
  const monoStyles = window.getComputedStyle(mono ?? root ?? document.body);

  return {
    body: bodyStyles.fontFamily || '"Manrope", ui-sans-serif, system-ui, sans-serif',
    serif: schoolStyles.fontFamily || 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: monoStyles.fontFamily || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    bodyLetterSpacing: bodyStyles.letterSpacing || "normal",
    serifLetterSpacing: schoolStyles.letterSpacing || "0.02em",
    bodyWeight: bodyStyles.fontWeight || "500",
    serifWeight: schoolStyles.fontWeight || "900"
  };
}

/* --- Reçu individuel HTML (A5 paysage) ------------------------------------ */
async function buildReceiptHtml(r: PaymentRecord, lang: string): Promise<string> {
  const fonts = getReceiptPrintFonts();
  const parentCaption = getPaymentParentCaption(r);
  const safe = {
    tx: escapeHtml(r.transactionNumber),
    date: escapeHtml(r.date),
    parent: escapeHtml(r.parentFullName),
    parentCaption: escapeHtml(parentCaption),
    paymentSubject: escapeHtml(getPaymentSubjectName(r)),
    reason: escapeHtml(r.reason),
    amountWords: escapeHtml(r.amountWords),
    method: escapeHtml(getMethodLabel(r.method)),
    status: escapeHtml(getStatusLabel(r.status)),
    schoolName: escapeHtml(schoolBranding.schoolName),
    shortName: escapeHtml(schoolBranding.shortName),
    appName: escapeHtml(schoolBranding.appName),
    tagline: escapeHtml(schoolBranding.tagline),
    logoSrc: escapeHtml(schoolBranding.logoSrc)
  };
  const security = buildReceiptSecurity(r);
  const risk = analyzeReceiptRisk(r);
  const qrMarkup = await generateReceiptQrSvgMarkup(r).catch(() => "");
  const microText = escapeHtml(buildReceiptMicroText(r));
  const parentSecondaryLine = safe.parentCaption
    ? `<div class="value-sub"><span class="value-sub-badge">Parent concerne</span><span>${safe.parentCaption}</span></div>`
    : "";
  const allocationSummaryHtml = r.tuitionAllocationSummary
    ? `<div class="allocation">
        <div class="allocation-title">Repartition ${escapeHtml(r.tuitionAllocationSummary.mode === "AUTO" ? "automatique executee par le systeme" : "manuelle executee par le financier")}</div>
        <div class="allocation-message">${escapeHtml(r.tuitionAllocationSummary.message)}</div>
        <table>
          <thead><tr><th>Eleve</th><th>Applique</th><th>Reste</th><th>Details</th></tr></thead>
          <tbody>${r.tuitionAllocationSummary.perChild.map((child) => `<tr>
            <td>${escapeHtml(child.studentName)}</td>
            <td>$ ${child.allocated.toFixed(5)}</td>
            <td>$ ${child.remaining.toFixed(5)}</td>
            <td>${child.lines.map((line) => `${escapeHtml(line.label)}: avant $ ${line.outstandingBefore.toFixed(5)}, applique $ ${line.allocated.toFixed(5)}, reste $ ${line.outstandingAfter.toFixed(5)} (${escapeHtml(getDueBucketLabel(line.dueBucket))})`).join("<br/>")}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Reçu ${safe.tx}</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500&family=IBM+Plex+Mono:wght@400;500;600;700&family=Manrope:wght@300;400;500;600;700;800&family=Sora:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap");
    @page { size: A5 landscape; margin: 4mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: ${fonts.body}; font-weight:${fonts.bodyWeight}; letter-spacing:${fonts.bodyLetterSpacing}; color:#101827; background:#fff; font-size:9.5px; }
    .receipt { position:relative; width:202mm; height:140mm; margin:0 auto; border:0.9mm double #123047; padding:4.5mm; overflow:hidden; }
    .receipt:before { content:""; position:absolute; inset:0; background:linear-gradient(135deg, rgba(18,48,71,.05), transparent 32%, rgba(180,83,9,.05)); pointer-events:none; }
    .watermark { position:absolute; inset:17mm 12mm auto; text-align:center; font-size:27mm; font-weight:900; letter-spacing:4mm; color:rgba(18,48,71,.032); transform:rotate(-10deg); pointer-events:none; }
    .seal-watermark { position:absolute; inset:28mm 0 auto; display:flex; justify-content:center; pointer-events:none; opacity:.05; }
    .seal-watermark img { width:58mm; height:58mm; object-fit:contain; transform:rotate(-9deg); }
    .micro { position:absolute; left:5mm; right:5mm; bottom:2.5mm; color:#94a3b8; font-size:5.6px; letter-spacing:.8px; white-space:nowrap; overflow:hidden; }
    .top { position:relative; display:grid; grid-template-columns:1.16fr .84fr; gap:6mm; border-bottom:1.5px solid #123047; padding-bottom:2.6mm; }
    .brand { display:flex; gap:3mm; align-items:center; }
    .logo { width:15mm; height:15mm; border:1px solid #123047; border-radius:2mm; padding:1.1mm; object-fit:contain; background:#fff; }
    .school { font-family:${fonts.serif}; font-size:15px; font-weight:${fonts.serifWeight}; color:#123047; letter-spacing:${fonts.serifLetterSpacing}; }
    .sub { margin-top:.7mm; color:#64748b; font-size:7.8px; text-transform:uppercase; letter-spacing:1px; }
    .official { margin-top:2mm; display:inline-block; border:1px solid #123047; padding:1mm 3mm; font-size:8.2px; font-weight:900; letter-spacing:1.8px; text-transform:uppercase; }
    .tx { text-align:right; }
    .tx-label { color:#64748b; font-size:7px; text-transform:uppercase; letter-spacing:1.3px; }
    .tx-value { margin-top:.7mm; font-family:${fonts.mono}; font-size:11.5px; font-weight:900; color:#123047; }
    .grid { display:grid; grid-template-columns:1.28fr .72fr; gap:4.5mm; margin-top:3.8mm; }
    .field { display:grid; grid-template-columns:30mm 1fr; gap:2mm; padding:1.55mm 0; border-bottom:1px dotted #cbd5e1; }
    .label { color:#475569; font-size:7.2px; font-weight:800; text-transform:uppercase; letter-spacing:.7px; }
    .value { font-weight:700; color:#101827; }
    .value-stack { display:flex; flex-direction:column; gap:.8mm; }
    .value-sub { display:flex; align-items:center; gap:1.2mm; font-size:7px; font-weight:700; color:#64748b; letter-spacing:.2px; }
    .value-sub-badge { display:inline-flex; align-items:center; padding:.55mm 1.7mm; border:1px solid rgba(18,48,71,.18); border-radius:999px; background:rgba(18,48,71,.06); color:#123047; font-size:6.2px; font-weight:900; text-transform:uppercase; letter-spacing:.55px; }
    .parent { font-size:11.8px; color:#123047; }
    .amount { margin-top:2.8mm; border:1.3px solid #123047; background:#f8fafc; padding:2.7mm; }
    .amount-label { color:#64748b; font-size:7.2px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; }
    .amount-value { margin-top:.7mm; font-family:${fonts.mono}; font-size:20px; font-weight:900; color:#123047; }
    .words { margin-top:1.4mm; border-top:1px solid #dbe4ef; padding-top:1.4mm; font-size:7.8px; font-style:italic; color:#334155; }
    .security { border:1px solid #123047; padding:2.2mm; }
    .security-head { display:flex; align-items:flex-start; justify-content:space-between; gap:3mm; }
    .qr { width:27mm; min-width:27mm; border:1px solid #123047; background:#fff; padding:1.2mm; }
    .qr svg { display:block; width:100%; height:auto; }
    .qr-copy { margin-top:1mm; text-align:center; font-size:6px; font-weight:800; line-height:1.35; color:#334155; }
    .qr-fallback { width:27mm; min-width:27mm; min-height:27mm; border:1px dashed #94a3b8; display:flex; align-items:center; justify-content:center; text-align:center; padding:2mm; font-size:6px; font-weight:800; color:#64748b; background:#f8fafc; }
    .seal-row { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:3.4mm; }
    .box { min-height:17mm; border:1px dashed #475569; padding:1.5mm; display:flex; flex-direction:column; justify-content:space-between; }
    .box-title { font-size:7px; font-weight:900; color:#475569; text-transform:uppercase; letter-spacing:.8px; }
    .line { border-top:1px solid #475569; padding-top:.8mm; text-align:center; font-size:6.8px; color:#64748b; }
    .stamp { align-items:center; justify-content:center; text-align:center; border-style:solid; }
    .stamp-circle { width:17mm; height:17mm; border:1px dashed #123047; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:auto; background:#fff; color:#94a3b8; font-size:5.8px; font-weight:800; text-transform:uppercase; letter-spacing:.45px; }
    .warning { margin-top:2.2mm; border-left:2.4px solid #b45309; background:#fffbeb; color:#78350f; padding:1.5mm; font-size:7px; }
    .allocation { position:relative; margin-top:2.2mm; border:1px solid #cbd5e1; background:#f8fafc; padding:1.8mm; }
    .allocation-title { font-size:7px; font-weight:900; color:#123047; text-transform:uppercase; letter-spacing:.7px; }
    .allocation-message { margin-top:.8mm; font-size:6.5px; color:#334155; line-height:1.35; }
    .allocation table { width:100%; border-collapse:collapse; margin-top:1.2mm; font-size:6.2px; }
    .allocation th, .allocation td { border-top:1px solid #e2e8f0; padding:.8mm; text-align:left; vertical-align:top; }
    .allocation th { color:#475569; text-transform:uppercase; letter-spacing:.45px; }
    .footer { margin-top:2.6mm; display:flex; justify-content:space-between; color:#64748b; font-size:7px; border-top:1px solid #dbe4ef; padding-top:1.4mm; }
    @media print { html, body { width:210mm; height:148mm; overflow:hidden; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .receipt { margin:0; page-break-inside:avoid; break-inside:avoid; } }
  </style>
</head>
<body>
<div class="receipt">
  <div class="watermark">${safe.shortName}</div>
  <div class="seal-watermark"><img src="${safe.logoSrc}" alt="${safe.shortName}"/></div>
  <div class="top">
    <div class="brand">
      <img class="logo" src="${safe.logoSrc}" alt="${safe.schoolName}"/>
      <div>
        <div class="school">${safe.schoolName}</div>
        <div class="sub">${safe.tagline} - ${safe.appName}</div>
        <div class="official">Reçu officiel</div>
      </div>
    </div>
    <div class="tx">
      <div class="tx-label">Transaction</div>
      <div class="tx-value">${safe.tx}</div>
      <div class="tx-label" style="margin-top:2mm">Vérification</div>
      <div class="tx-value">${security.verificationCode}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="field"><div class="label">Date et heure</div><div class="value">${safe.date}</div></div>
      <div class="field"><div class="label">Paiement pour</div><div class="value-stack"><div class="value parent">${safe.paymentSubject}</div>${parentSecondaryLine}</div></div>
      <div class="field"><div class="label">Motif</div><div class="value">${safe.reason}</div></div>
      <div class="field"><div class="label">Méthode</div><div class="value">${safe.method}</div></div>
      <div class="field"><div class="label">Statut</div><div class="value">${safe.status}</div></div>
      <div class="amount">
        <div class="amount-label">Montant reçu en dollars américains</div>
        <div class="amount-value">$ ${r.amount.toFixed(5)}</div>
        <div class="words"><strong>En toutes lettres:</strong> ${safe.amountWords}</div>
      </div>
      ${allocationSummaryHtml}
    </div>

    <div>
      <div class="security">
        <div class="security-head">
          <div>
            <div class="tx-label">Bloc sécurité</div>
            <div style="margin-top:1.2mm; font-size:6.6px; color:#64748b; line-height:1.4; max-width:38mm;">Scanner le QR pour ouvrir la page de vérification EduPay de cette transaction.</div>
          </div>
          ${qrMarkup
            ? `<div class="qr">${qrMarkup}<div class="qr-copy">Vérifier ce reçu<br/>${safe.tx}</div></div>`
            : `<div class="qr-fallback">QR indisponible<br/>Ref ${safe.tx}</div>`}
        </div>
        <div class="field" style="grid-template-columns:23mm 1fr"><div class="label">Hash</div><div class="value">${security.hash}</div></div>
        <div class="field" style="grid-template-columns:23mm 1fr"><div class="label">Sceau</div><div class="value">${security.sealCode}</div></div>
        <div class="field" style="grid-template-columns:23mm 1fr"><div class="label">Contrôle</div><div class="value">${risk.level}</div></div>
      </div>
      <div class="warning">
        Toute modification du montant, de l'eleve, du statut ou du motif invalide le code de vérification. Reçu valable uniquement avec signature du caissier et sceau de l'école.
      </div>
      <div class="seal-row">
        <div class="box">
          <div class="box-title">Signature du caissier</div>
          <div class="line">Nom, signature et date</div>
        </div>
        <div class="box stamp">
          <div class="box-title">Sceau de l'école</div>
          <div class="stamp-circle">Emplacement reserve</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${safe.schoolName} - ${safe.appName} - Norme interne RCT-01</span>
    <span>Ref: ${safe.tx} - ${new Date().toLocaleDateString("fr-FR")}</span>
  </div>
  <div class="micro">${microText} ${microText} ${microText}</div>
</div>
</body>
</html>`;
}
/* --- État financier HTML (général ou par parent) -------------------------- */
function buildReportHtml(payments: PaymentRecord[], filterParent?: string): string {
  const filtered = filterParent
    ? payments.filter((p) => getPaymentSubjectName(p).toLowerCase().includes(filterParent.toLowerCase()))
    : payments;

  const byParent = filtered.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
    const key = getPaymentSubjectName(p);
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const grandTotal = filtered.reduce((s, p) => s + p.amount, 0);
  const completedTotal = filtered.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0);
  const pendingTotal = filtered.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
  const failedTotal = filtered.filter((p) => p.status === "FAILED").reduce((s, p) => s + p.amount, 0);

  const methodLabel: Record<string, string> = {
    CASH: "Cash / Especes",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money"
  };
  const statusColor: Record<string, string> = {
    COMPLETED: "#16a34a",
    PENDING: "#d97706",
    FAILED: "#dc2626"
  };
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué"
  };

  const brand = {
    schoolName: plainPrintText(schoolBranding.schoolName),
    shortName: plainPrintText(schoolBranding.shortName),
    appName: plainPrintText(schoolBranding.appName),
    tagline: plainPrintText(schoolBranding.tagline),
    logoSrc: escapeHtml(schoolBranding.logoSrc)
  };

  const byMethod = filtered.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  const methodRows = Object.entries(byMethod)
    .map(([m, total]) => `<tr>
      <td style="padding:5px 10px">${methodLabel[m] ?? plainPrintText(m)}</td>
      <td style="padding:5px 10px; font-family:monospace; font-weight:bold; text-align:right; color:#1e3a5f">$ ${total.toFixed(5)}</td>
    </tr>`)
    .join("");

  const parentBlocks = Object.entries(byParent).map(([parent, recs]) => {
    const parentName = plainPrintText(parent);
    const parentCaption = plainPrintText(Array.from(new Set(recs.map((r) => getPaymentParentCaption(r)).filter(Boolean))).join(" / "));
    const total = recs.reduce((s, r) => s + r.amount, 0);
    const rows = recs.map((r) => `<tr>
      <td style="padding:6px 8px; font-family:monospace; font-size:11px; color:#475569">${plainPrintText(r.transactionNumber)}</td>
      <td style="padding:6px 8px; font-size:11px; white-space:nowrap">${plainPrintText(r.date.split(",").slice(0, 2).join(","))}</td>
      <td style="padding:6px 8px; font-size:11px">${plainPrintText(r.reason)}</td>
      <td style="padding:6px 8px; font-size:11px">${methodLabel[r.method] ?? plainPrintText(r.method)}</td>
      <td style="padding:6px 8px; text-align:right; font-family:monospace; font-weight:bold; font-size:12px">$ ${r.amount.toFixed(5)}</td>
      <td style="padding:6px 8px; text-align:center; font-size:11px; font-weight:bold; color:${statusColor[r.status] ?? "#111"}">${statusLabel[r.status] ?? plainPrintText(r.status)}</td>
    </tr>`).join("");

    return `<div style="margin-bottom:32px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1e3a5f; color:#fff; padding:10px 14px; border-radius:4px 4px 0 0;">
        <div>
          <div style="font-weight:bold; font-size:14px">${parentName}</div>
          ${parentCaption ? `<div style="margin-top:4px; font-size:11px; color:rgba(255,255,255,0.78)">Parent concerne : ${parentCaption}</div>` : ""}
        </div>
        <div style="font-family:monospace; font-weight:bold; font-size:14px">Total : $ ${total.toFixed(5)}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-top:none; font-size:12px;">
        <thead style="background:#f1f5f9;">
          <tr>
            <th style="padding:7px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.8px; color:#475569">No Transaction</th>
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

  const title = filterParent ? `Etat financier - ${plainPrintText(filterParent)}` : "Etat general des paiements";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { position:relative; font-family: Arial, Helvetica, sans-serif; color:#0d1b2a; background:#fff; font-size:12px; }
    .page-shell { position:relative; z-index:2; }
    .watermark-text {
      position:fixed;
      inset:0;
      z-index:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:104px;
      font-weight:900;
      letter-spacing:16px;
      color:rgba(30,58,95,0.055);
      text-shadow:0 0 1px rgba(30,58,95,0.08);
      transform:rotate(-22deg);
      pointer-events:none;
      user-select:none;
    }
    .watermark-logo-frame {
      position:fixed;
      left:50%;
      top:50%;
      z-index:0;
      width:430px;
      height:430px;
      max-width:66vw;
      max-height:66vw;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      border:2px solid rgba(30,58,95,0.045);
      background:radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 56%, rgba(30,58,95,0.025) 100%);
      transform:translate(-50%, -48%);
      pointer-events:none;
      user-select:none;
    }
    .watermark-logo {
      width:82%;
      height:82%;
      object-fit:contain;
      border-radius:999px;
      opacity:0.115;
      filter:grayscale(100%) contrast(1.08) saturate(0.35);
      transform:rotate(-10deg);
      pointer-events:none;
      user-select:none;
    }
    .header-logo {
      width:58px;
      height:58px;
      object-fit:contain;
      border:1px solid #cbd5e1;
      border-radius:999px;
      background:#fff;
      padding:4px;
      margin-right:14px;
    }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <div class="watermark-text">${brand.shortName}</div>
  <div class="watermark-logo-frame">
    <img class="watermark-logo" src="${brand.logoSrc}" alt=""/>
  </div>
  <div class="page-shell">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px double #1e3a5f; padding-bottom:14px; margin-bottom:20px;">
      <div style="display:flex; align-items:center;">
        <img class="header-logo" src="${brand.logoSrc}" alt="Logo ${brand.schoolName}"/>
        <div>
          <div style="font-size:20px; font-weight:bold; color:#1e3a5f; letter-spacing:1px">${brand.schoolName}</div>
          <div style="font-size:12px; font-weight:bold; color:#334155; margin-top:2px">${brand.shortName} - ${brand.tagline}</div>
          <div style="font-size:11px; color:#64748b; margin-top:3px">${brand.appName} - Tous montants en USD (dollars americains)</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px; color:#64748b">Imprime le</div>
        <div style="font-weight:bold; font-size:13px">${new Date().toLocaleDateString("fr-FR")}</div>
        <div style="font-size:11px; color:#64748b">${new Date().toLocaleTimeString("fr-FR")}</div>
      </div>
    </div>

    <div style="text-align:center; font-size:17px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; border:2px solid #0d1b2a; padding:10px 0; margin-bottom:24px;">
      ${title}
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:24px;">
      <div style="border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; background:#f8fafc;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Total encaisse (USD)</div>
        <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${grandTotal.toFixed(5)}</div>
        <div style="font-size:9px; color:#94a3b8; margin-top:2px;">${filtered.length} transaction${filtered.length > 1 ? "s" : ""}</div>
      </div>
      <div style="border:1px solid #d1fae5; border-radius:6px; padding:12px 14px; background:#f0fdf4;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Paiements regles</div>
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
      <div style="font-weight:bold; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#1e3a5f; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">Repartition par mode de paiement</div>
      <table style="border-collapse:collapse; font-size:12px; border:1px solid #e2e8f0;">
        <thead style="background:#f1f5f9;"><tr>
          <th style="padding:6px 10px; text-align:left; font-size:10px; text-transform:uppercase; color:#475569">Mode</th>
          <th style="padding:6px 10px; text-align:right; font-size:10px; text-transform:uppercase; color:#475569">Total (USD)</th>
        </tr></thead>
        <tbody>${methodRows}</tbody>
      </table>
    </div>` : ""}

    ${parentBlocks || '<p style="color:#64748b; text-align:center; padding:40px">Aucun paiement trouve.</p>'}

    <div style="border-top:3px double #1e3a5f; padding-top:16px; display:flex; justify-content:flex-end; align-items:center; gap:20px; margin-top:12px;">
      <span style="font-size:14px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">TOTAL GENERAL (USD)</span>
      <span style="font-size:22px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${grandTotal.toFixed(5)}</span>
    </div>
    <div style="margin-top:28px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px;">
      Document généré officiellement par <strong>${brand.appName}</strong> pour <strong>${brand.schoolName}</strong> -
      ${new Date().toLocaleString("fr-FR")}
    </div>
  </div>
</body>
</html>`;
}

/* --- Ouverture popup + impression ---------------------------------------- */
function printHtml(html: string) {
  const popup = window.open("", "_blank", "width=900,height=1200");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();

  const triggerPrint = () => {
    popup.focus();
    popup.print();
  };

  popup.addEventListener("load", () => {
    const fontsReady = popup.document.fonts?.ready;
    if (fontsReady) {
      fontsReady
        .catch(() => undefined)
        .finally(() => {
          window.setTimeout(triggerPrint, 150);
        });
      return;
    }

    window.setTimeout(triggerPrint, 300);
  }, { once: true });
}

async function printReceiptDocument(payment: PaymentRecord, lang: string) {
  printHtml(await buildReceiptHtml(payment, lang));
}

function exportReceiptExcel(payment: PaymentRecord) {
  exportWorkbook(`recu-${payment.transactionNumber}`, [
    {
      name: "Recu",
      rows: [{
        "No Transaction": payment.transactionNumber,
        "Date": payment.date,
        "Paiement pour": getPaymentSubjectName(payment),
        "Parent concerne": getPaymentParentCaption(payment) || payment.parentFullName,
        "Motif": payment.reason,
        "Montant USD": payment.amount,
        "Montant en lettres": payment.amountWords,
        "Mode": getMethodLabel(payment.method),
        "Statut": getStatusLabel(payment.status),
        "Code verification": buildReceiptSecurity(payment).verificationCode
      }]
    }
  ]);
}

function exportPaymentsExcel(filename: string, records: PaymentRecord[], parentFilter?: string) {
  const filtered = parentFilter
    ? records.filter((payment) => getPaymentSubjectName(payment) === parentFilter)
    : records;

  const total = filtered.reduce((sum, payment) => sum + payment.amount, 0);
  const completed = filtered.filter((payment) => payment.status === "COMPLETED");
  const pending = filtered.filter((payment) => payment.status === "PENDING");
  const failed = filtered.filter((payment) => payment.status === "FAILED");

  const byMethod = filtered.reduce<Record<string, number>>((acc, payment) => {
    const key = getMethodLabel(payment.method);
    acc[key] = (acc[key] ?? 0) + payment.amount;
    return acc;
  }, {});

  exportWorkbook(filename, [
    {
      name: "Synthese",
      rows: [{
        "Portee": parentFilter || "Globale",
        "Paiements": filtered.length,
        "Total USD": total,
        "Regles USD": completed.reduce((sum, payment) => sum + payment.amount, 0),
        "En attente USD": pending.reduce((sum, payment) => sum + payment.amount, 0),
        "Echoues USD": failed.reduce((sum, payment) => sum + payment.amount, 0)
      }]
    },
    {
      name: "Paiements",
      rows: filtered.map((payment) => ({
        "No Transaction": payment.transactionNumber,
        "Date": payment.date,
        "Paiement pour": getPaymentSubjectName(payment),
        "Parent concerne": getPaymentParentCaption(payment) || payment.parentFullName,
        "Motif": payment.reason,
        "Mode": getMethodLabel(payment.method),
        "Montant USD": payment.amount,
        "Statut": getStatusLabel(payment.status),
        "Code verification": buildReceiptSecurity(payment).verificationCode
      }))
    },
    {
      name: "Par mode",
      rows: Object.entries(byMethod).map(([method, amount]) => ({
        "Mode": method,
        "Total USD": amount
      }))
    }
  ]);
}

/* --- Types ---------------------------------------------------------------- */
type PaymentRecord = {
  id: string;
  transactionNumber: string;
  date: string;
  parentId?: string;
  parentFullName: string;
  paymentSubjectName?: string;
  studentNames?: string[];
  reason: string;
  amount: number;
  amountWords: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
  status: "COMPLETED" | "PENDING" | "FAILED";
  tuitionAllocationSummary?: {
    mode: "AUTO" | "MANUAL";
    message: string;
    totalReceived: number;
    allocatedTotal: number;
    missingAmount: number;
    advanceBalance: number;
    perChild: Array<{
      studentName: string;
      allocated: number;
      remaining: number;
      lines: Array<{
        label: string;
        dueBucket: string;
        outstandingBefore: number;
        allocated: number;
        outstandingAfter: number;
      }>;
    }>;
  };
};

type FormState = {
  parentId: string;
  studentIds: string[];
  parentFullName: string;
  reason: string;
  amount: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY";
  status: "COMPLETED" | "PENDING" | "FAILED";
};

type ParentStudentOption = {
  id: string;
  externalStudentId?: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

type ParentOption = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  students?: ParentStudentOption[];
};

type FinanceParentSnapshot = {
  profile: {
    activeTuitionPlan: string;
    totalPaid: number;
    totalDebt: number;
    totalReduction: number;
    overdueInstallments: number;
    completionRate: number;
  };
  students: Array<{
    id: string;
    fullName: string;
    paymentOptionLabel: string;
    planName: string;
    paid: number;
    balance: number;
    installments: Array<{
      id: string;
      label: string;
      dueDate: string;
      amountDue: number;
      balance: number;
      status: string;
      isOverdue: boolean;
    }>;
  }>;
};

type PaymentOptionType = "FULL_PRESEPTEMBER" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS" | "STANDARD_MONTHLY";
type AllocationMode = "AUTO" | "MANUAL";

type TuitionEngineCalculation = {
  studentId: string;
  studentName: string;
  gradeGroup: string;
  paymentOptionType: PaymentOptionType;
  baseAnnualTuition: number;
  familyDiscountRate: number;
  familyDiscountAmount: number;
  familyAdjustedTuition: number;
  planDiscountRate: number;
  planDiscountAmount: number;
  finalTuition: number;
  monthlyAmount: number | null;
  schedule: Array<{ sequence: number; label: string; dueDate: string; amountDue: number }>;
};

type TuitionAllocationPreview = {
  totalReceived: number;
  allocatedTotal: number;
  advanceBalance: number;
  missingAmount: number;
  message: string;
  warnings: string[];
  lines: Array<{
    installmentId: string;
    studentId: string | null;
    studentName: string;
    label: string;
    dueDate: string;
    dueBucket: "OVERDUE" | "CURRENT" | "FUTURE";
    amountDue: number;
    alreadyPaid: number;
    outstandingBefore: number;
    allocated: number;
    outstandingAfter: number;
  }>;
};

type TuitionEngineResponse = {
  parent: { id: string; fullName: string };
  calculations: TuitionEngineCalculation[];
  allocationPreview: TuitionAllocationPreview;
  payment?: { id: string; transactionNumber: string; amount: number; status: PaymentRecord["status"]; method: PaymentRecord["method"]; createdAt?: string };
  receipt?: { receiptNumber: string };
};

function getDueBucketLabel(bucket: string): string {
  const labels: Record<string, string> = {
    OVERDUE: "Retard",
    CURRENT: "Echeance actuelle",
    FUTURE: "Echeance future"
  };
  return labels[bucket] ?? bucket;
}

function buildAllocationChildSummaries(preview: TuitionAllocationPreview) {
  return Object.values(preview.lines.reduce<Record<string, {
    studentName: string;
    allocated: number;
    remaining: number;
    before: number;
    details: TuitionAllocationPreview["lines"];
  }>>((acc, line) => {
    const current = acc[line.studentName] ?? {
      studentName: line.studentName,
      allocated: 0,
      remaining: 0,
      before: 0,
      details: []
    };
    current.allocated += line.allocated;
    current.remaining += line.outstandingAfter;
    current.before += line.outstandingBefore;
    current.details.push(line);
    acc[line.studentName] = current;
    return acc;
  }, {})).map((child) => ({
    ...child,
    allocated: Number(child.allocated.toFixed(5)),
    remaining: Number(child.remaining.toFixed(5)),
    before: Number(child.before.toFixed(5))
  }));
}

function buildAllocationNarrative(preview: TuitionAllocationPreview, mode: AllocationMode): string[] {
  if (mode === "MANUAL") {
    return [
      `Le financier a choisi la repartition manuelle pour ${fmtUsd(preview.totalReceived)}.`,
      `Le systeme controle que le total reparti est egal au paiement recu: ${fmtUsd(preview.allocatedTotal)} applique.`,
      preview.missingAmount > 0
        ? `Il reste ${fmtUsd(preview.missingAmount)} non couvert sur les echeances selectionnees.`
        : "Toutes les lignes couvertes par cette repartition sont soldees."
    ];
  }

  const overdue = preview.lines.filter((line) => line.dueBucket === "OVERDUE" && line.allocated > 0);
  const current = preview.lines.filter((line) => line.dueBucket === "CURRENT" && line.allocated > 0);
  const future = preview.lines.filter((line) => line.dueBucket === "FUTURE" && line.allocated > 0);
  const children = buildAllocationChildSummaries(preview)
    .map((child) => `${child.studentName}: ${fmtUsd(child.allocated)} applique, ${fmtUsd(child.remaining)} reste`)
    .join(" | ");

  return [
    `Montant recu: ${fmtUsd(preview.totalReceived)}. Le systeme paie d'abord les retards, puis l'echeance actuelle, puis les futures echeances par date.`,
    overdue.length > 0
      ? `Retards payes en premier: ${overdue.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucun retard ouvert n'a ete trouve pour ce paiement.",
    current.length > 0
      ? `Echeance actuelle traitee ensuite: ${current.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucune echeance actuelle ouverte n'a ete trouvee.",
    future.length > 0
      ? `Futures echeances traitees par ordre de date: ${future.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucune future echeance n'a recu d'argent apres les priorites.",
    children,
    preview.advanceBalance > 0
      ? `Excedent conserve comme avance: ${fmtUsd(preview.advanceBalance)}.`
      : `Montant encore requis apres allocation: ${fmtUsd(preview.missingAmount)}.`
  ].filter(Boolean);
}

type View = "form" | "receipt" | "history" | "report";

const EMPTY_FORM: FormState = {
  parentId: "", studentIds: [], parentFullName: "", reason: "", amount: "", method: "CASH", status: "COMPLETED",
};

const PAYMENT_NOTIFICATION_STORAGE_KEY = "edupay-payment-notifications-enabled";
const PAYMENT_PARENT_NOTIFICATION_STORAGE_KEY = "edupay-parent-payment-notifications-v1";

const STORAGE_KEY = "edupay_payments_v2";

function loadPayments(): PaymentRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function savePayments(ps: PaymentRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ps));
}

function loadParentNotificationPreferences(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PAYMENT_PARENT_NOTIFICATION_STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveParentNotificationPreferences(preferences: Record<string, boolean>) {
  localStorage.setItem(PAYMENT_PARENT_NOTIFICATION_STORAGE_KEY, JSON.stringify(preferences));
}

function getPaymentSubjectName(payment: Pick<PaymentRecord, "paymentSubjectName" | "studentNames" | "parentFullName">) {
  if (payment.paymentSubjectName?.trim()) return payment.paymentSubjectName;
  if ((payment.studentNames?.length ?? 0) > 0) return payment.studentNames!.join(" / ");
  return payment.parentFullName;
}

function getPaymentParentCaption(payment: Pick<PaymentRecord, "paymentSubjectName" | "studentNames" | "parentFullName">) {
  const parentName = payment.parentFullName.trim();
  if (!parentName) return "";
  const subjectName = getPaymentSubjectName(payment).trim();
  return parentName.localeCompare(subjectName, undefined, { sensitivity: "accent" }) === 0 ? "" : parentName;
}

function getPaymentAudienceText(payment: Pick<PaymentRecord, "paymentSubjectName" | "studentNames" | "parentFullName">) {
  const subjectName = getPaymentSubjectName(payment);
  const parentCaption = getPaymentParentCaption(payment);
  return parentCaption ? `${subjectName} · Parent: ${parentCaption}` : subjectName;
}

function buildReasonForStudents(baseReason: string, studentDisplayName: string) {
  const cleanReason = baseReason.trim();
  const cleanStudents = studentDisplayName.trim();
  if (!cleanReason) return cleanStudents ? `Paiement scolaire - ${cleanStudents}` : "";
  if (!cleanStudents) return cleanReason;
  return `${cleanReason} - ${cleanStudents}`;
}

const METHOD_OPTIONS = [
  { value: "CASH",         label: "Cash / Espèces" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "MPESA",        label: "M-Pesa" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
];

const STATUS_OPTIONS = [
  { value: "COMPLETED", label: "Réglé" },
  { value: "PENDING",   label: "En attente" },
  { value: "FAILED",    label: "Échoué" },
];

const PAYMENT_REASON_SUGGESTIONS = [
  "Frais scolaires - 1er trimestre",
  "Frais scolaires - 2e trimestre",
  "Frais scolaires - 3e trimestre",
  "Inscription annuelle",
  "Réinscription annuelle",
  "Frais d'examen",
  "Frais de bulletin",
  "Frais d'uniforme",
  "Frais de transport scolaire",
  "Frais de cantine",
  "Frais de bibliothèque",
  "Frais d'activités parascolaires",
  "Sortie pédagogique",
  "Rattrapage des arriérés",
  "Avance sur frais scolaires",
];

const TUITION_PLAN_OPTIONS: Array<{ value: PaymentOptionType; label: string; detail: string }> = [
  { value: "FULL_PRESEPTEMBER", label: "Full Annual", detail: "10% plan discount after family discount" },
  { value: "TWO_INSTALLMENTS", label: "Two Installments", detail: "5% plan discount after family discount" },
  { value: "THREE_INSTALLMENTS", label: "Three Installments", detail: "2% plan discount after family discount" },
  { value: "STANDARD_MONTHLY", label: "Monthly", detail: "No plan discount, 4 months due upfront" }
];

const HISTORY_PRODUCT_FILTERS = [
  "frais scolaires",
  "inscription",
  "reinscription",
  "uniforme",
  "transport",
  "cantine",
  "bibliotheque",
  "examen"
];

const SCHOOL_PRODUCT_ALIASES: Record<string, string[]> = {
  "frais scolaires": ["frais scolaires", "frais scolaire", "scolarite", "scolarité", "trimestre", "tuition"],
  inscription: ["inscription", "admission", "nouvelle inscription"],
  reinscription: ["reinscription", "réinscription", "renouvellement"],
  uniforme: ["uniforme", "tenue", "kit scolaire"],
  transport: ["transport", "bus", "ramassage"],
  cantine: ["cantine", "restauration", "repas"],
  bibliotheque: ["bibliotheque", "bibliothèque", "livre", "manuels"],
  examen: ["examen", "epreuve", "épreuve", "test"],
  bulletin: ["bulletin", "rapport scolaire"],
  activites: ["activites", "activités", "parascolaire", "club", "sport"],
  sortie: ["sortie", "pedagogique", "pédagogique", "voyage"],
  arrieres: ["arrieres", "arriérés", "retard", "rattrapage"],
};

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getProductSearchTags(reason: string) {
  const normalizedReason = normalizeSearchText(reason);
  return Object.entries(SCHOOL_PRODUCT_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalizedReason.includes(normalizeSearchText(alias))))
    .map(([product]) => product);
}

/* --- Badge statut --------------------------------------------------------- */
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

/* --- Icone imprimante ----------------------------------------------------- */
function PrintIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M6 9V2h12v7" />
      <rect x="3" y="9" width="18" height="10" rx="2" />
      <path d="M6 19v-5h12v5" />
    </svg>
  );
}

function ExcelIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 10 4 6" />
      <path d="m13 10-4 6" />
    </svg>
  );
}

function ReceiptA5Preview({ receipt, compact = false }: { receipt: PaymentRecord; compact?: boolean }) {
  const security = buildReceiptSecurity(receipt);
  const risk = analyzeReceiptRisk(receipt);
  const parentCaption = getPaymentParentCaption(receipt);
  const [qrMarkup, setQrMarkup] = useState("");
  const riskTone = risk.score >= 60
    ? "border-red-500/40 bg-red-500/10 text-red-200"
    : risk.score >= 25
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";

  useEffect(() => {
    let active = true;

    generateReceiptQrSvgMarkup(receipt)
      .then((svg) => {
        if (active) setQrMarkup(svg);
      })
      .catch(() => {
        if (active) setQrMarkup("");
      });

    return () => {
      active = false;
    };
  }, [receipt]);

  return (
    <div data-receipt-preview-root className={`relative mx-auto w-full max-w-4xl overflow-hidden rounded-xl border-[3px] border-double border-slate-300 bg-white p-4 text-slate-950 shadow-2xl ${compact ? "scale-[0.98]" : ""}`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(18,48,71,0.05),transparent_35%,rgba(180,83,9,0.06))]" />
      <div className="pointer-events-none absolute inset-x-8 top-20 -rotate-6 text-center text-7xl font-black tracking-[0.28em] text-slate-900/[0.035]">
        {schoolBranding.shortName}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center opacity-[0.055]">
        <img src={schoolBranding.logoSrc} alt="" className="h-72 w-72 -rotate-6 object-contain" />
      </div>
      <div className="relative grid gap-3 border-b-2 border-slate-800 pb-3 sm:grid-cols-[1.1fr_0.9fr]">
        <div className="flex items-center gap-3">
          <img
            src={schoolBranding.logoSrc}
            alt={`Logo ${schoolBranding.schoolName}`}
            className="h-16 w-16 rounded-lg border border-slate-900 bg-white object-contain p-1.5"
          />
          <div>
            <p data-receipt-preview-school className="font-serif text-lg font-black tracking-wide text-slate-900">{schoolBranding.schoolName}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {schoolBranding.tagline} - {schoolBranding.appName}
            </p>
            <span className="mt-2 inline-flex border border-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]">Reçu officiel</span>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Transaction</p>
          <p data-receipt-preview-mono className="mt-1 font-mono text-sm font-black text-slate-900">{receipt.transactionNumber}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Vérification</p>
          <p className="mt-1 font-mono text-sm font-black text-slate-900">{security.verificationCode}</p>
        </div>
      </div>

      <div className="relative mt-3 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-dotted border-slate-300 py-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Date et heure</span>
            <span className="text-sm font-bold text-slate-700">{receipt.date}</span>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-dotted border-slate-300 py-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Paiement pour</span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-bold text-slate-950">{getPaymentSubjectName(receipt)}</span>
              {parentCaption ? <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Parent</span>{parentCaption}</span> : null}
            </span>
          </div>
          {[
            ["Motif", receipt.reason],
            ["Méthode", getMethodLabel(receipt.method)],
            ["Statut", getStatusLabel(receipt.status)]
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[120px_1fr] gap-3 border-b border-dotted border-slate-300 py-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
              <span className="text-sm font-bold text-slate-700">{value}</span>
            </div>
          ))}
          <div className="mt-3 border-2 border-slate-900 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Montant reçu en dollars américains</p>
            <p className="mt-1 font-mono text-2xl font-black text-slate-900">$ {receipt.amount.toFixed(5)}</p>
            <p className="mt-2 border-t border-slate-300 pt-2 text-xs italic text-slate-700">
              <strong>En toutes lettres:</strong> {receipt.amountWords}
            </p>
          </div>
          {receipt.tuitionAllocationSummary && (
            <div className="mt-3 border border-slate-300 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Repartition {receipt.tuitionAllocationSummary.mode === "AUTO" ? "automatique executee par le systeme" : "manuelle executee par le financier"}
              </p>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-600">{receipt.tuitionAllocationSummary.message}</p>
              <div className="mt-2 space-y-2">
                {receipt.tuitionAllocationSummary.perChild.map((child) => (
                  <div key={child.studentName} className="rounded-md border border-slate-200 bg-white p-2 text-[11px]">
                    <div className="flex justify-between gap-3 font-bold text-slate-900">
                      <span>{child.studentName}</span>
                      <span>Applique $ {child.allocated.toFixed(5)} - Reste $ {child.remaining.toFixed(5)}</span>
                    </div>
                    <div className="mt-1 text-slate-600">
                      {child.lines.map((line) => `${line.label}: avant $ ${line.outstandingBefore.toFixed(5)}, applique $ ${line.allocated.toFixed(5)}, reste $ ${line.outstandingAfter.toFixed(5)} (${getDueBucketLabel(line.dueBucket)})`).join(" | ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="border border-slate-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Bloc sécurité</p>
                <p className="mt-1 max-w-[210px] text-[11px] font-semibold leading-5 text-slate-500">
                  Scanner le QR pour ouvrir la page de vérification EduPay de cette transaction.
                </p>
                <p className="mt-2 text-xs font-bold text-slate-700">Hash: <span className="font-mono text-slate-950">{security.hash}</span></p>
                <p className="text-xs font-bold text-slate-700">Sceau: <span className="font-mono text-slate-950">{security.sealCode}</span></p>
              </div>
              {qrMarkup ? (
                <div className="w-28 overflow-hidden border border-slate-900 bg-white p-1.5">
                  <div className="h-24 w-24 overflow-hidden [&_svg]:block [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
                  <p className="mt-1 text-center text-[10px] font-black leading-4 text-slate-700">Vérifier ce reçu<br />{receipt.transactionNumber}</p>
                </div>
              ) : (
                <div className="flex h-28 w-28 items-center justify-center border border-dashed border-slate-400 bg-slate-50 p-3 text-center text-[10px] font-bold text-slate-500">
                  Génération du QR...
                </div>
              )}
            </div>
            <div className={`mt-3 rounded-md border px-3 py-2 text-xs font-bold ${riskTone}`}>
              {risk.level} - score {risk.score}/100
            </div>
          </div>

          <div className="mt-3 border-l-4 border-amber-600 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
            Toute modification du montant, de l'eleve, du statut ou du motif invalide le code de vérification.
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex min-h-24 flex-col justify-between border border-dashed border-slate-600 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Signature du caissier</p>
              <p className="border-t border-slate-500 pt-1 text-center text-[10px] text-slate-500">Nom, signature et date</p>
            </div>
            <div className="flex min-h-24 flex-col items-center justify-between border border-slate-600 p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Sceau de l'école</p>
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-900 bg-white p-2 text-[9px] font-black uppercase tracking-wide text-slate-400">
                Emplacement reserve
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-300 pt-2 text-[10px] font-semibold text-slate-500">
        <span>{schoolBranding.schoolName} - {schoolBranding.appName} - Norme interne RCT-01</span>
        <span>{buildReceiptMicroText(receipt)}</span>
      </div>
    </div>
  );
}

/* --- Page principale ------------------------------------------------------ */
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
  const [paymentNotificationsEnabled, setPaymentNotificationsEnabled] = useState(() => {
    return localStorage.getItem(PAYMENT_NOTIFICATION_STORAGE_KEY) !== "false";
  });
  const [parentNotificationPreferences, setParentNotificationPreferences] = useState<Record<string, boolean>>(loadParentNotificationPreferences);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const [paymentDetailsDialogOpen, setPaymentDetailsDialogOpen] = useState(true);
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [selectedParentFinance, setSelectedParentFinance] = useState<FinanceParentSnapshot | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [tuitionPlan, setTuitionPlan] = useState<PaymentOptionType>("STANDARD_MONTHLY");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("AUTO");
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});
  const [tuitionPreview, setTuitionPreview] = useState<TuitionEngineResponse | null>(null);
  const [tuitionEngineBusy, setTuitionEngineBusy] = useState(false);
  // Historique
  const [searchQuery, setSearchQuery]       = useState("");
  const [filterStatus, setFilterStatus]     = useState("ALL");
  const [filterMethod, setFilterMethod]     = useState("ALL");
  // État
  const [reportSearch, setReportSearch]     = useState("");

  useEffect(() => { savePayments(payments); }, [payments]);

  useEffect(() => {
    api<{ paymentNotificationsEnabled: boolean }>("/api/payments/settings/notifications")
      .then((settings) => {
        setPaymentNotificationsEnabled(settings.paymentNotificationsEnabled);
        localStorage.setItem(PAYMENT_NOTIFICATION_STORAGE_KEY, String(settings.paymentNotificationsEnabled));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api<ParentOption[]>("/api/parents")
      .then((items) => setParents(items))
      .catch(() => setParents([]));
  }, []);

  const togglePaymentNotifications = async () => {
    const next = !paymentNotificationsEnabled;
    setPaymentNotificationsEnabled(next);
    localStorage.setItem(PAYMENT_NOTIFICATION_STORAGE_KEY, String(next));
    setNotificationStatus(next ? t("paymentNotificationsEnabled") : t("paymentNotificationsDisabled"));
    try {
      const saved = await api<{ paymentNotificationsEnabled: boolean }>("/api/payments/settings/notifications", {
        method: "PUT",
        body: JSON.stringify({ paymentNotificationsEnabled: next })
      });
      setPaymentNotificationsEnabled(saved.paymentNotificationsEnabled);
      localStorage.setItem(PAYMENT_NOTIFICATION_STORAGE_KEY, String(saved.paymentNotificationsEnabled));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("localSettingSaved");
      setNotificationStatus(t("localSettingApplied").replace("{{message}}", message));
    }
  };

  const amountNum = parseFloat(form.amount) || 0;
  const amountWords = useMemo(() => {
    if (amountNum <= 0) return "-";
    return amountToWords(amountNum, lang as "fr" | "en");
  }, [amountNum, lang]);

  useEffect(() => {
    setTuitionPreview(null);
    setManualAllocations({});
  }, [form.parentId, form.amount, tuitionPlan, allocationMode]);

  const filteredPayments = useMemo(() => payments.filter((p) => {
    const query = normalizeSearchText(searchQuery);
    const searchableText = normalizeSearchText([
      getPaymentSubjectName(p),
      p.parentFullName,
      p.reason,
      p.transactionNumber,
      ...getProductSearchTags(p.reason)
    ].join(" "));
    const matchQ = !query || query.split(/\s+/).every((token) => searchableText.includes(token));
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
    if (paymentNotificationsEnabled && !form.parentId) errs.parentId = "Choisissez le parent qui recevra l'email et le SMS.";
    if (selectedParent && (selectedParent.students?.length ?? 0) > 0 && form.studentIds.length === 0) errs.studentIds = "Selectionnez au moins un eleve pour synchroniser ce paiement.";
    if (!form.parentFullName.trim()) errs.parentFullName = t("pmRequired");
    if (!form.reason.trim())         errs.reason         = t("pmRequired");
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = t("pmRequired");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const selectedParent = useMemo(
    () => parents.find((parent) => parent.id === form.parentId) ?? null,
    [form.parentId, parents]
  );

  useEffect(() => {
    if (!form.parentId) {
      setSelectedParentFinance(null);
      return;
    }

    let active = true;
    setFinanceLoading(true);
    api<FinanceParentSnapshot>(`/api/finance/parents/${form.parentId}/profile`)
      .then((profile) => {
        if (!active) return;
        setSelectedParentFinance(profile);
      })
      .catch(() => {
        if (!active) return;
        setSelectedParentFinance(null);
      })
      .finally(() => {
        if (active) setFinanceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form.parentId]);

  const selectedParentNotificationsEnabled = selectedParent
    ? parentNotificationPreferences[selectedParent.id] !== false
    : true;
  const effectivePaymentNotificationsEnabled = paymentNotificationsEnabled && selectedParentNotificationsEnabled;

  const setParentTarget = (parentId: string) => {
    const parent = parents.find((item) => item.id === parentId);
    setForm((prev) => ({
      ...prev,
      parentId,
      studentIds: [],
      parentFullName: parent?.fullName ?? prev.parentFullName
    }));
    setFieldErrors((prev) => ({ ...prev, parentFullName: undefined, studentIds: undefined }));
  };

  const toggleParentPaymentNotifications = (parentId: string) => {
    const parent = parents.find((item) => item.id === parentId);
    setParentNotificationPreferences((current) => {
      const nextValue = current[parentId] === false;
      const next = { ...current, [parentId]: nextValue };
      saveParentNotificationPreferences(next);
      setNotificationStatus(`${parent?.fullName ?? "Parent"} - Email & SMS ${nextValue ? t("enabled") : t("disabled")}`);
      return next;
    });
  };

  const selectedStudents = useMemo(
    () => (selectedParent?.students ?? []).filter((student) => form.studentIds.includes(student.id)),
    [form.studentIds, selectedParent]
  );

  const selectedStudentDisplayName = useMemo(
    () => selectedStudents.map((student) => student.fullName).join(" / "),
    [selectedStudents]
  );

  const lastAutoReasonRef = useRef("");

  useEffect(() => {
    const nextAutoReason = selectedStudentDisplayName
      ? buildReasonForStudents("Paiement scolaire", selectedStudentDisplayName)
      : "";

    setForm((prev) => {
      const currentReason = prev.reason.trim();
      const previousAutoReason = lastAutoReasonRef.current;
      const shouldReplace = !currentReason || currentReason === previousAutoReason;

      if (!shouldReplace) return prev;

      lastAutoReasonRef.current = nextAutoReason;
      if (currentReason === nextAutoReason) return prev;
      return { ...prev, reason: nextAutoReason };
    });
  }, [selectedStudentDisplayName]);

  const financeInstallmentSuggestions = useMemo(() => {
    if (!selectedParentFinance) return [];
    const targetStudentIds = form.studentIds.length > 0 ? new Set(form.studentIds) : null;
    return selectedParentFinance.students
      .filter((student) => !targetStudentIds || targetStudentIds.has(student.id))
      .flatMap((student) =>
        student.installments
          .filter((installment) => installment.balance > 0)
          .map((installment) => ({
            studentId: student.id,
            studentName: student.fullName,
            planName: student.planName,
            paymentOptionLabel: student.paymentOptionLabel,
            label: installment.label,
            dueDate: installment.dueDate,
            amountDue: installment.amountDue,
            balance: installment.balance,
            isOverdue: installment.isOverdue,
            status: installment.status
          }))
      )
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
      .slice(0, 4);
  }, [form.studentIds, selectedParentFinance]);

  const toggleStudentTarget = (studentId: string) => {
    setForm((prev) => ({
      ...prev,
      studentIds: prev.studentIds.includes(studentId)
        ? prev.studentIds.filter((value) => value !== studentId)
        : [...prev.studentIds, studentId]
    }));
    setFieldErrors((prev) => ({ ...prev, studentIds: undefined }));
  };

  const buildManualAllocationPayload = () => Object.entries(manualAllocations)
    .map(([installmentId, amount]) => ({ installmentId, amount: Number(amount || 0) }))
    .filter((row) => row.amount > 0);

  const buildReceiptAllocationSummary = (preview: TuitionAllocationPreview, mode: AllocationMode): PaymentRecord["tuitionAllocationSummary"] => {
    type ReceiptAllocationChild = NonNullable<PaymentRecord["tuitionAllocationSummary"]>["perChild"][number];
    const grouped = preview.lines.reduce<Record<string, ReceiptAllocationChild>>((acc, line) => {
      const current = acc[line.studentName] ?? {
        studentName: line.studentName,
        allocated: 0,
        remaining: 0,
        lines: []
      };
      current.allocated += line.allocated;
      current.remaining += line.outstandingAfter;
      current.lines.push({
        label: line.label,
        dueBucket: line.dueBucket,
        outstandingBefore: line.outstandingBefore,
        allocated: line.allocated,
        outstandingAfter: line.outstandingAfter
      });
      acc[line.studentName] = current;
      return acc;
    }, {});

    return {
      mode,
      message: preview.message,
      totalReceived: preview.totalReceived,
      allocatedTotal: preview.allocatedTotal,
      missingAmount: preview.missingAmount,
      advanceBalance: preview.advanceBalance,
      perChild: Object.values(grouped).map((child) => ({
        ...child,
        allocated: Number(child.allocated.toFixed(5)),
        remaining: Number(child.remaining.toFixed(5))
      }))
    };
  };

  const previewTuitionAllocation = async () => {
    if (!form.parentId || amountNum <= 0) {
      setApiError("Choisissez un parent et entrez un montant avant la previsualisation tuition.");
      return;
    }
    setTuitionEngineBusy(true);
    setApiError(null);
    try {
      const preview = await api<TuitionEngineResponse>("/api/finance/tuition-engine/preview-allocation", {
        method: "POST",
        body: JSON.stringify({
          parentId: form.parentId,
          amount: amountNum,
          paymentOptionType: tuitionPlan,
          allocationMode,
          manualAllocations: allocationMode === "MANUAL" ? buildManualAllocationPayload() : []
        })
      });
      setTuitionPreview(preview);
      if (form.studentIds.length === 0 && selectedParent?.students?.length) {
        setForm((current) => ({ ...current, studentIds: selectedParent.students!.map((student) => student.id) }));
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible de previsualiser l'allocation tuition.");
    } finally {
      setTuitionEngineBusy(false);
    }
  };

  const confirmTuitionPayment = async () => {
    if (!form.parentId || amountNum <= 0) {
      setApiError("Choisissez un parent et entrez un montant avant de confirmer.");
      return;
    }
    if (!tuitionPreview) {
      setApiError("Previsualisez d'abord la repartition automatique ou manuelle avant de confirmer le paiement tuition.");
      return;
    }
    setTuitionEngineBusy(true);
    setSaving(true);
    setApiError(null);
    try {
      const result = await api<TuitionEngineResponse>("/api/finance/tuition-engine/payments", {
        method: "POST",
        body: JSON.stringify({
          parentId: form.parentId,
          amount: amountNum,
          paymentOptionType: tuitionPlan,
          allocationMode,
          method: form.method,
          status: form.status,
          transactionNumber: txNumber,
          notes: form.reason || "Tuition payment recorded through EduPay Tuition Payment Engine",
          manualAllocations: allocationMode === "MANUAL" ? buildManualAllocationPayload() : []
        })
      });
      const parentName = selectedParent?.fullName ?? result.parent.fullName;
      const subjectName = result.calculations.map((row) => row.studentName).join(" / ") || parentName;
      const record: PaymentRecord = {
        id: result.payment?.id ?? `tuition-${Date.now()}`,
        transactionNumber: result.payment?.transactionNumber ?? txNumber,
        date: new Date().toLocaleString(lang === "fr" ? "fr-FR" : "en-US"),
        parentId: form.parentId,
        parentFullName: parentName,
        paymentSubjectName: subjectName,
        studentNames: result.calculations.map((row) => row.studentName),
        reason: form.reason || `Tuition - ${TUITION_PLAN_OPTIONS.find((plan) => plan.value === tuitionPlan)?.label ?? tuitionPlan}`,
        amount: amountNum,
        amountWords: amountToWords(amountNum, lang as "fr" | "en"),
        method: form.method,
        status: form.status,
        tuitionAllocationSummary: buildReceiptAllocationSummary(result.allocationPreview, allocationMode)
      };
      setPayments((prev) => [record, ...prev]);
      setCurrentReceipt(record);
      setTuitionPreview(result);
      setNotificationStatus("Tuition allocation saved, alerts/audit log generated when required.");
      setView("receipt");
      setForm(EMPTY_FORM);
      setFieldErrors({});
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement tuition.");
    } finally {
      setSaving(false);
      setTuitionEngineBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (tuitionPreview) {
      await confirmTuitionPayment();
      return;
    }
    setSaving(true);
    setApiError(null);

    const finalAmount = parseFloat(parseFloat(form.amount).toFixed(5));
    const now = new Date();
    const dateStr = now.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    const paymentSubjectName = selectedStudents.length > 0
      ? selectedStudents.map((student) => student.fullName).join(" / ")
      : form.parentFullName.trim();

    const record: PaymentRecord = {
      id: `demo-${Date.now()}`,
      transactionNumber: txNumber,
      date: dateStr,
      parentFullName: form.parentFullName.trim(),
      paymentSubjectName,
      studentNames: selectedStudents.map((student) => student.fullName),
      parentId: form.parentId || undefined,
      reason: form.reason.trim(),
      amount: finalAmount,
      amountWords: amountToWords(finalAmount, lang as "fr" | "en"),
      method: form.method,
      status: form.status,
    };

    try {
      const created = await api<{ payment: Partial<PaymentRecord> & { id: string }; notificationStatus?: { email?: string; sms?: string } }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          parentFullName: record.parentFullName,
          parentId: record.parentId,
          studentDisplayName: paymentSubjectName,
          studentIds: form.studentIds,
          studentExternalIds: selectedStudents.map((student) => student.externalStudentId).filter(Boolean),
          reason: record.reason,
          amount: record.amount,
          method: record.method,
          transactionNumber: txNumber,
          status: record.status,
          notifyParent: effectivePaymentNotificationsEnabled && Boolean(record.parentId),
        }),
      });
      record.id = created?.payment?.id ?? record.id;
      record.paymentSubjectName = created?.payment?.paymentSubjectName ?? record.paymentSubjectName;
      record.studentNames = created?.payment?.studentNames ?? record.studentNames;
      record.parentFullName = created?.payment?.parentFullName ?? record.parentFullName;
      if (created?.notificationStatus) {
        setNotificationStatus(`${record.parentFullName} - Email: ${created.notificationStatus.email ?? "SKIPPED"} | SMS: ${created.notificationStatus.sms ?? "SKIPPED"}`);
      }
    } catch { /* Mode démo - reçu généré même sans base de données */ }

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

  /* -- Barre de navigation ----------------------------------------------- */
  const NavBar = () => (
    <div className="flex flex-wrap gap-2 mb-6">
      {(["form", "history", "report"] as View[]).map((v) => {
        const labels: Record<string, string> = {
          form:    "+ " + t("newPaymentBtn"),
          history: "Historique (" + payments.length + ")",
          report:  "État des paiements",
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
          Dernier reçu
        </button>
      )}
    </div>
  );

  /* -- Bandeau de statistiques ------------------------------------------- */
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

  const NotificationSettingsPanel = () => (
    <div className={`card relative overflow-hidden border ${
      paymentNotificationsEnabled
        ? "border-emerald-500/30 bg-emerald-500/10"
        : "border-amber-500/30 bg-amber-500/10"
    }`}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-200">
              {t("paymentNotificationsAdminTitle")}
            </p>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
              paymentNotificationsEnabled
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                : "border-amber-400/40 bg-amber-400/15 text-amber-200"
            }`}>
              {paymentNotificationsEnabled ? t("paymentNotificationsOnBadge") : t("paymentNotificationsOffBadge")}
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t("paymentNotificationsTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-dim">{t("paymentNotificationsAdminSubtitle")}</p>
          <p className="mt-2 text-xs font-semibold text-cyan-200">{t("paymentNotificationsChannels")}</p>
          {selectedParent && (
            <p className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
              selectedParentNotificationsEnabled
                ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                : "border-amber-400/30 bg-amber-400/10 text-amber-100"
            }`}>
              Parent cible : {selectedParent.fullName} - Email & SMS {selectedParentNotificationsEnabled ? t("enabled") : t("disabled")}
              {selectedParent.email ? ` - ${selectedParent.email}` : ""}
              {selectedParent.phone ? ` - ${selectedParent.phone}` : ""}
            </p>
          )}
          {notificationStatus && <p className="mt-2 text-xs font-semibold text-white/85">{notificationStatus}</p>}
          {parents.length > 0 && (
            <div className="edupay-scrollbar mt-4 grid max-h-64 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {parents.map((parent) => {
                const active = parentNotificationPreferences[parent.id] !== false;
                return (
                  <button
                    key={parent.id}
                    type="button"
                    onClick={() => toggleParentPaymentNotifications(parent.id)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                        : "border-slate-600/80 bg-slate-950/40 text-ink-dim hover:border-amber-400/40 hover:text-amber-100"
                    }`}
                  >
                    <span className="block truncate text-xs font-black uppercase tracking-wide">{parent.fullName}</span>
                    <span className="mt-1 block text-[11px] font-semibold">
                      Email & SMS {active ? t("enabled") : t("disabled")}
                      {!paymentNotificationsEnabled && active ? " - en attente globale" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void togglePaymentNotifications()}
          className={`shrink-0 rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-wide transition-all active:scale-95 ${
            paymentNotificationsEnabled
              ? "border border-emerald-400/50 bg-emerald-500/25 text-emerald-100 shadow-lg shadow-emerald-500/10 hover:bg-emerald-500/35"
              : "border border-amber-400/50 bg-amber-500/20 text-amber-100 shadow-lg shadow-amber-500/10 hover:bg-amber-500/30"
          }`}
        >
          {paymentNotificationsEnabled ? t("enabled") : t("disabled")}
        </button>
      </div>
    </div>
  );

  /* ------------------------------------------------------------------------
     VUE RECU
  ------------------------------------------------------------------------ */
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
            + {t("newPaymentBtn")}
          </button>
        </div>

        <ReceiptA5Preview receipt={r} />

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void printReceiptDocument(r, lang)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            <PrintIcon className="w-5 h-5" /> {t("printPdf")}
          </button>
          <button
            onClick={() => exportReceiptExcel(r)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 font-bold transition-all active:scale-95"
          >
            <ExcelIcon className="w-5 h-5" /> Exporter en Excel
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

  /* ------------------------------------------------------------------------
     VUE HISTORIQUE
  ------------------------------------------------------------------------ */
  if (view === "history") {
    return (
      <div className="space-y-6 pb-10">
        <div className="animate-fadeInDown">
          <h1 className="font-display text-3xl font-bold text-white">Historique des Paiements</h1>
          <p className="text-ink-dim mt-2 text-sm">Tous les paiements enregistrés - Montants en dollars américains (USD)</p>
        </div>
        <NavBar />
        <StatsBanner />
        <NotificationSettingsPanel />

        {/* Filtres */}
        <div className="card">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Recherche</label>
              <SearchField
                placeholder="Nom, produit, motif, numero..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                inputClassName="text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {HISTORY_PRODUCT_FILTERS.map((product) => (
                  <button
                    key={product}
                    type="button"
                    onClick={() => setSearchQuery(product)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      normalizeSearchText(searchQuery) === normalizeSearchText(product)
                        ? "border-brand-500 bg-brand-500/20 text-white"
                        : "border-slate-600 text-ink-dim hover:border-brand-400 hover:text-white"
                    }`}
                  >
                    {product}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-dim">
                Recherche intelligente par eleve, parent, numero, motif ou produit scolaire: inscription, uniforme, frais scolaires, transport, cantine...
              </p>
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
        <div className="card edupay-scrollbar overflow-x-auto">
          {filteredPayments.length === 0 ? (
            <p className="text-center text-ink-dim py-12">Aucun paiement trouvé.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {["No Transaction", "Date", "Paiement pour", "Motif", "Mode", "Montant (USD)", "Statut", "Actions"].map((h) => (
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
                    <td className="py-3 px-3">
                      <div className="min-w-[220px]">
                        <p className="font-semibold text-white">{getPaymentSubjectName(p)}</p>
                        {getPaymentParentCaption(p) ? <p className="mt-0.5 text-xs text-ink-dim">Parent: {getPaymentParentCaption(p)}</p> : null}
                        {p.tuitionAllocationSummary && (
                          <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-2 text-xs text-emerald-50">
                            <p className="font-black uppercase tracking-[0.12em]">Repartition {p.tuitionAllocationSummary.mode}</p>
                            {p.tuitionAllocationSummary.perChild.slice(0, 4).map((child) => (
                              <p key={child.studentName} className="mt-1">
                                {child.studentName}: applique {fmtUsd(child.allocated)} - reste {fmtUsd(child.remaining)}
                              </p>
                            ))}
                            {p.tuitionAllocationSummary.perChild.length > 4 && (
                              <p className="mt-1 text-emerald-100/80">+ {p.tuitionAllocationSummary.perChild.length - 4} autre(s) enfant(s)</p>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
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
                          onClick={() => {
                            setCurrentReceipt(p);
                            setView("receipt");
                          }}
                          className="p-1.5 rounded bg-brand-600/20 text-brand-300 hover:bg-brand-600/40 transition-colors"
                        >
                          <PrintIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Exporter le recu en Excel"
                          onClick={() => exportReceiptExcel(p)}
                          className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 transition-colors"
                        >
                          <ExcelIcon className="w-3.5 h-3.5" />
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
            <button
              onClick={() => exportPaymentsExcel(`historique-paiements-${new Date().toISOString().slice(0, 10)}`, filteredPayments)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-all text-sm font-semibold"
            >
              <ExcelIcon /> Exporter la liste filtrée
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------------------
     VUE ÉTAT DES PAIEMENTS
  ------------------------------------------------------------------------ */
  if (view === "report") {
    const reportPayments = reportSearch
      ? payments.filter((p) => getPaymentSubjectName(p).toLowerCase().includes(reportSearch.toLowerCase()))
      : payments;

    const bySubject = reportPayments.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
      const key = getPaymentSubjectName(p);
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    const reportTotal = reportPayments.reduce((s, p) => s + p.amount, 0);

    return (
      <div className="space-y-6 pb-10">
        <div className="animate-fadeInDown">
          <h1 className="font-display text-3xl font-bold text-white">État des paiements</h1>
          <p className="text-ink-dim mt-2 text-sm">
            Situation financière {reportSearch ? `- ${reportSearch}` : "générale"} - Tous les montants en USD
          </p>
        </div>
        <NavBar />
        <StatsBanner />
        <NotificationSettingsPanel />

        {/* Recherche + impression */}
        <div className="card flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">
              Filtrer par eleve (laisser vide = état général)
            </label>
            <input
              type="text"
              placeholder="Nom de l'eleve..."
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
          <button
            onClick={() => exportPaymentsExcel(`etat-paiements-${(reportSearch || "general").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}`, payments, reportSearch || undefined)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 font-bold transition-all active:scale-95 whitespace-nowrap"
          >
            <ExcelIcon className="w-5 h-5" />
            {reportSearch ? `Exporter ${reportSearch} en Excel` : "Exporter l'état général en Excel"}
          </button>
        </div>

        {/* Cartes par eleve */}
        {Object.keys(bySubject).length === 0 ? (
          <div className="card text-center py-12 text-ink-dim">Aucun paiement enregistré.</div>
        ) : (
          Object.entries(bySubject).map(([subject, recs]) => {
            const parentTotal  = recs.reduce((s, r) => s + r.amount, 0);
            const completedAmt = recs.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
            const pendingAmt   = recs.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
            const failedAmt    = recs.filter((r) => r.status === "FAILED").reduce((s, r) => s + r.amount, 0);
            const parentCaptions = Array.from(new Set(recs.map((r) => getPaymentParentCaption(r)).filter(Boolean)));

            return (
              <div key={subject} className="card">
                {/* En-tete eleve */}
                <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-600/30 flex items-center justify-center text-brand-300 font-bold text-lg">
                      {subject[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">{subject}</p>
                      {parentCaptions.length > 0 ? <p className="mt-1 text-xs text-ink-dim">Parent: {parentCaptions.join(" / ")}</p> : null}
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
                <div className="edupay-scrollbar overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {["No Transaction", "Date", "Motif", "Mode", "Montant USD", "Statut", ""].map((h) => (
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
                              onClick={() => void printReceiptDocument(r, lang)}
                              className="p-1.5 rounded bg-brand-600/20 text-brand-300 hover:bg-brand-600/40 transition-colors"
                            >
                              <PrintIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Exporter le recu en Excel"
                              onClick={() => exportReceiptExcel(r)}
                              className="ml-1 p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 transition-colors"
                            >
                              <ExcelIcon className="w-3.5 h-3.5" />
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
                    onClick={() => exportPaymentsExcel(`etat-${subject.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}`, payments, subject)}
                    className="mr-3 flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-all text-sm font-semibold"
                  >
                    <ExcelIcon /> Exporter l'état de {subject}
                  </button>
                  <button
                    onClick={() => printHtml(buildReportHtml(payments, subject))}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-500/40 text-brand-300 hover:bg-brand-600/20 transition-all text-sm font-semibold"
                  >
                    <PrintIcon /> Imprimer l'état de {subject}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Total general */}
        {Object.keys(bySubject).length > 0 && (
          <div className="card flex items-center justify-between border-2 border-brand-500/30">
            <p className="text-sm font-bold text-ink-dim uppercase tracking-widest">
              {reportSearch ? `Total - ${reportSearch}` : "TOTAL GENERAL"}
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

  /* ------------------------------------------------------------------------
     VUE FORMULAIRE (nouveau paiement)
  ------------------------------------------------------------------------ */
  return (
    <div className="space-y-8 pb-10">
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("newPayment")}</h1>
        <p className="text-ink-dim mt-2 text-sm">{t("paymentFormSubtitle")}</p>
      </div>

      <NavBar />
      <StatsBanner />
      <NotificationSettingsPanel />

      <div className="card flex flex-col gap-4 border-brand-500/20 bg-brand-500/5 animate-fadeInUp sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-200">{t("paymentDetails")}</p>
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t("newPaymentBtn")}</h2>
          <p className="mt-1 text-sm text-ink-dim">Le formulaire de paiement s'ouvre dans une boite dediee au centre de l'ecran.</p>
        </div>
        <button
          type="button"
          onClick={() => setPaymentDetailsDialogOpen(true)}
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-700 active:scale-95"
        >
          Ouvrir Payment details
        </button>
      </div>

      {paymentDetailsDialogOpen ? createPortal((
        <div className="edupay-payment-modal-backdrop edupay-scrollbar fixed inset-0 z-[999] grid place-items-center overflow-y-auto px-4 py-8">
          <div className="edupay-payment-modal-panel edupay-scrollbar w-full max-w-5xl overflow-y-auto p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-200">{t("paymentDetails")}</p>
                <h2 className="mt-1 font-display text-xl font-bold text-white">{t("newPaymentBtn")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPaymentDetailsDialogOpen(false)}
                className="rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-ink-dim transition-all hover:border-slate-400 hover:text-white"
              >
                Fermer
              </button>
            </div>

        {/* Numero de transaction auto */}
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                Parent destinataire email/SMS
              </label>
              <select
                value={form.parentId}
                onChange={(event) => setParentTarget(event.target.value)}
                className="w-full"
              >
                <option value="">Choisir un parent inscrit</option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.fullName} {parent.phone ? `- ${parent.phone}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-dim">
                Les notifications partent uniquement vers ce parent cible.
              </p>
              {fieldErrors.parentId && <p className="text-xs text-danger">{fieldErrors.parentId}</p>}
            </div>

            {selectedParent && (selectedParent.students?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                  Eleves concernes <span className="text-danger">*</span>
                </label>
                <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  {selectedParent.students?.map((student) => {
                    const active = form.studentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => toggleStudentTarget(student.id)}
                        className={`flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-brand-500 bg-brand-500/15 text-white"
                            : "border-slate-700 bg-slate-900/70 text-ink-dim hover:border-brand-400/50 hover:text-white"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">{student.fullName}</span>
                          <span className="block text-xs">{student.className} · Frais annuels $ {student.annualFee.toFixed(2)}</span>
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wide">{active ? "Selectionne" : "Choisir"}</span>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.studentIds && <p className="text-xs text-danger">{fieldErrors.studentIds}</p>}
              </div>
            )}

            {selectedParentFinance && (
              <div className="lg:col-span-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Finance context</p>
                    <h3 className="mt-1 text-lg font-bold text-white">{selectedParentFinance.profile.activeTuitionPlan}</h3>
                    <p className="mt-1 text-sm text-cyan-100">
                      Paid {fmtUsd(selectedParentFinance.profile.totalPaid)} · Debt {fmtUsd(selectedParentFinance.profile.totalDebt)} · Reductions {fmtUsd(selectedParentFinance.profile.totalReduction)}
                    </p>
                    <p className="mt-1 text-xs text-cyan-100/85">
                      Completion {selectedParentFinance.profile.completionRate.toFixed(1)}% · {selectedParentFinance.profile.overdueInstallments} echeance(s) en retard.
                    </p>
                  </div>
                  {financeLoading && <p className="text-xs font-semibold text-cyan-100">Actualisation du profil finance...</p>}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {financeInstallmentSuggestions.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 text-sm text-cyan-100">Aucune echeance ouverte pour la selection actuelle.</div>
                  ) : financeInstallmentSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.studentId}-${suggestion.label}-${suggestion.dueDate}`}
                      type="button"
                      onClick={() => {
                        setField("amount", suggestion.balance.toFixed(5));
                        const nextReason = buildReasonForStudents(suggestion.label, suggestion.studentName);
                        lastAutoReasonRef.current = nextReason;
                        setField("reason", nextReason);
                      }}
                      className={`rounded-xl border p-3 text-left transition-all ${suggestion.isOverdue ? "border-red-500/30 bg-red-500/10" : "border-white/10 bg-slate-950/30 hover:border-cyan-400/40"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{suggestion.studentName}</p>
                          <p className="mt-1 text-xs text-cyan-100/85">{suggestion.label}</p>
                          <p className="mt-1 text-[11px] text-ink-dim">{suggestion.planName} · {suggestion.paymentOptionLabel}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${suggestion.isOverdue ? "bg-red-500/15 text-red-200" : "bg-cyan-500/15 text-cyan-100"}`}>
                          {suggestion.isOverdue ? "Retard" : suggestion.status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-cyan-100/85">
                        <span>Due {new Date(suggestion.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</span>
                        <span className="font-mono font-bold text-white">{fmtUsd(suggestion.balance)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedParent && (
              <div className="lg:col-span-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">EduPay Tuition Payment Engine</p>
                    <h3 className="mt-1 text-lg font-bold text-white">Family discount first, plan discount second</h3>
                    <p className="mt-1 text-sm text-emerald-100/85">
                      {selectedParent.students?.length ?? 0} child account{(selectedParent.students?.length ?? 0) > 1 ? "s" : ""}. Family discount applies when there are 2 or more linked children.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void previewTuitionAllocation()}
                      disabled={tuitionEngineBusy || !form.parentId || amountNum <= 0}
                      className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {tuitionEngineBusy ? "Calcul..." : allocationMode === "MANUAL" && tuitionPreview ? "Recalculer manuel" : "Previsualiser la repartition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmTuitionPayment()}
                      disabled={tuitionEngineBusy || !form.parentId || amountNum <= 0 || !tuitionPreview}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Confirmer le paiement tuition
                    </button>
                    {!tuitionPreview && (
                      <p className="w-full text-xs font-semibold text-emerald-100/80">
                        La confirmation est active seulement apres la previsualisation, pour que le financier voie la repartition avant l'enregistrement.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-100">Payment plan</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TUITION_PLAN_OPTIONS.map((plan) => (
                        <button
                          key={plan.value}
                          type="button"
                          onClick={() => setTuitionPlan(plan.value)}
                          className={`rounded-xl border px-3 py-2 text-left transition-all ${
                            tuitionPlan === plan.value
                              ? "border-emerald-300 bg-emerald-400/20 text-white"
                              : "border-white/10 bg-slate-950/30 text-ink-dim hover:border-emerald-300/40 hover:text-white"
                          }`}
                        >
                          <span className="block text-sm font-bold">{plan.label}</span>
                          <span className="mt-1 block text-[11px]">{plan.detail}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-100">Allocation mode</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      {(["AUTO", "MANUAL"] as AllocationMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setAllocationMode(mode)}
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition-all ${
                            allocationMode === mode
                              ? "border-cyan-300 bg-cyan-400/20 text-white"
                              : "border-white/10 bg-slate-950/30 text-ink-dim hover:border-cyan-300/40 hover:text-white"
                          }`}
                        >
                          {mode === "AUTO" ? "Automatic scientific allocation" : "Manual finance split"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {tuitionPreview && (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Tuition calculation</p>
                      <div className="mt-3 space-y-3">
                        {tuitionPreview.calculations.map((row) => (
                          <div key={row.studentId} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-white">{row.studentName}</p>
                                <p className="mt-1 text-xs text-ink-dim">{row.gradeGroup} · {row.paymentOptionType}</p>
                              </div>
                              <p className="font-mono text-sm font-bold text-emerald-100">{fmtUsd(row.finalTuition)}</p>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-emerald-50/85 sm:grid-cols-2">
                              <span>Base {fmtUsd(row.baseAnnualTuition)}</span>
                              <span>Family -{fmtUsd(row.familyDiscountAmount)}</span>
                              <span>After family {fmtUsd(row.familyAdjustedTuition)}</span>
                              <span>Plan -{fmtUsd(row.planDiscountAmount)}</span>
                              {row.monthlyAmount ? <span>Monthly {fmtUsd(row.monthlyAmount)}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Allocation preview</p>
                          <p className="mt-1 text-xs text-ink-dim">{tuitionPreview.allocationPreview.message}</p>
                          {allocationMode === "AUTO" && (
                            <div className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs font-semibold text-cyan-50">
                              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100">Comment le systeme a reparti</p>
                              <ol className="mt-2 list-decimal space-y-1 pl-4">
                                {buildAllocationNarrative(tuitionPreview.allocationPreview, allocationMode).map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {allocationMode === "MANUAL" && (
                            <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-xs font-semibold text-amber-50">
                              Saisissez les montants par ligne, puis cliquez sur Recalculer manuel avant de confirmer.
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-mono font-bold text-white">Allocated {fmtUsd(tuitionPreview.allocationPreview.allocatedTotal)}</p>
                          <p className="font-mono text-amber-100">Missing {fmtUsd(tuitionPreview.allocationPreview.missingAmount)}</p>
                          {tuitionPreview.allocationPreview.advanceBalance > 0 && <p className="font-mono text-emerald-100">Advance {fmtUsd(tuitionPreview.allocationPreview.advanceBalance)}</p>}
                        </div>
                      </div>

                      {tuitionPreview.allocationPreview.warnings.length > 0 && (
                        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold text-amber-100">
                          {tuitionPreview.allocationPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                      )}

                      <div className="edupay-scrollbar mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                        {tuitionPreview.allocationPreview.lines.length > 0 && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Detail unitaire par enfant</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {buildAllocationChildSummaries(tuitionPreview.allocationPreview).map((summary) => {
                                return (
                                  <div key={summary.studentName} className="rounded-md border border-white/10 bg-slate-950/40 p-2 text-xs">
                                    <p className="font-semibold text-white">{summary.studentName}</p>
                                    <p className="mt-1 text-cyan-100">Du avant paiement {fmtUsd(summary.before)}</p>
                                    <p className="mt-1 text-emerald-100">Applique {fmtUsd(summary.allocated)}</p>
                                    <p className="text-amber-100">Reste {fmtUsd(summary.remaining)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {tuitionPreview.allocationPreview.lines.map((line) => (
                          <div key={line.installmentId} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">{line.studentName}</p>
                                <p className="mt-1 text-xs text-ink-dim">{line.label} · {new Date(line.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")} · {getDueBucketLabel(line.dueBucket)}</p>
                              </div>
                              <div className="text-right text-xs">
                                <p className="font-mono text-cyan-100">Avant {fmtUsd(line.outstandingBefore)}</p>
                                <p className="font-mono text-emerald-100">Applique {fmtUsd(line.allocated)}</p>
                                <p className="font-mono text-ink-dim">Reste {fmtUsd(line.outstandingAfter)}</p>
                              </div>
                            </div>
                            {allocationMode === "MANUAL" && (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={line.outstandingBefore}
                                value={manualAllocations[line.installmentId] ?? ""}
                                onChange={(event) => setManualAllocations((current) => ({ ...current, [line.installmentId]: event.target.value }))}
                                placeholder={`Manual amount up to ${line.outstandingBefore.toFixed(2)}`}
                                className="mt-2 w-full"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nom complet du parent */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                {t("parentFullName")} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.parentFullName}
                onChange={(e) => {
                  setField("parentFullName", e.target.value);
                  if (form.parentId && e.target.value !== selectedParent?.fullName) {
                    setField("parentId", "");
                  }
                }}
                placeholder="Ex. Kabila wa Muzuri Jean"
                className={`w-full ${fieldErrors.parentFullName ? "border-danger" : ""}`}
              />
              {fieldErrors.parentFullName && (
                <p className="text-xs text-danger">{fieldErrors.parentFullName}</p>
              )}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 via-slate-950/60 to-transparent p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-200">Identite du paiement</p>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Paiement pour</p>
                  <p className="mt-1 truncate font-display text-2xl font-bold text-white">
                    {selectedStudentDisplayName || "Selectionnez l'eleve concerne"}
                  </p>
                  <p className="mt-2 text-sm text-ink-dim">
                    {form.parentFullName.trim()
                      ? `Parent concerne: ${form.parentFullName.trim()}`
                      : "Le parent lie au paiement apparaitra ici comme information secondaire."}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-ink-dim">
                  <p className="font-semibold text-white">Rendu du reçu</p>
                  <p className="mt-1">{getPaymentAudienceText({
                    paymentSubjectName: selectedStudentDisplayName,
                    studentNames: selectedStudents.map((student) => student.fullName),
                    parentFullName: form.parentFullName
                  })}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Motif */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
              {t("reason")} <span className="text-danger">*</span>
            </label>
            <input
              list="payment-reason-suggestions"
              type="text"
              value={form.reason}
              onChange={(e) => setField("reason", e.target.value)}
              placeholder="Ex. Frais scolaires 1er trimestre 2026"
              className={`w-full ${fieldErrors.reason ? "border-danger" : ""}`}
            />
            <datalist id="payment-reason-suggestions">
              {PAYMENT_REASON_SUGGESTIONS.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2 pt-1">
              {PAYMENT_REASON_SUGGESTIONS.slice(0, 8).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    const nextReason = buildReasonForStudents(reason, selectedStudentDisplayName);
                    lastAutoReasonRef.current = nextReason;
                    setField("reason", nextReason);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.reason === reason
                      ? "border-brand-500 bg-brand-500/20 text-white"
                      : "border-slate-600 text-ink-dim hover:border-brand-400 hover:text-white"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {fieldErrors.reason && <p className="text-xs text-danger">{fieldErrors.reason}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Montant USD */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                {t("amountUsd")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm font-bold text-brand-300">$</span>
                <input
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0.00000"
                  className={`w-full !pl-11 font-mono tabular-nums ${fieldErrors.amount ? "border-danger" : ""}`}
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

          {/* Montant en toutes lettres - temps reel */}
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
      ), document.body) : null}
    </div>
  );
}
