import { useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { SearchField } from "../components/SearchField";
import { schoolBranding } from "../config/branding";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { buildReceiptAllocationSnapshot } from "../utils/receiptAllocation";
import { buildReceiptVerificationQrUrl, buildReceiptVerificationUrl } from "../utils/receiptVerification";
import { exportWorkbook } from "../utils/financeExcel";
import { printHtmlDocument } from "../utils/printDocument";

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
    "ten", "élèven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
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
  const normalizedAmount = roundMoney(amount);
  const intPart = Math.floor(normalizedAmount);
  const decStr = normalizedAmount.toFixed(5).split(".")[1] ?? "00000";
  const decNum = parseInt(decStr, 10);
  const fn = lang === "fr" ? n2wFr : n2wEn;
  const intWords = fn(intPart);
  const dollarLabel = intPart <= 1 ? "dollar" : "dollars";
  if (decNum === 0) return `${intWords} ${dollarLabel}`;
  const decWords = fn(decNum);
  const centLabel = lang === "fr" ? "cent-millièmes" : "hundred-thousandths";
  return `${intWords} ${dollarLabel} et ${decWords} ${centLabel}`;
}

function roundMoney(n: number): number {
  const rounded = Math.round((Number(n || 0) + Number.EPSILON) * 100000) / 100000;
  const nearestInteger = Math.round(rounded);
  return Math.abs(rounded - nearestInteger) <= 0.00001 ? nearestInteger : rounded;
}

function formatMoney(n: number): string {
  const rounded = roundMoney(n);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

/* --- Format USD ----------------------------------------------------------- */
function fmtUsd(n: number): string {
  return `$ ${formatMoney(n)}`;
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
    roundMoney(r.amount).toFixed(5),
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
  return buildReceiptVerificationQrUrl(r);
}

const receiptQrMarkupCache = new Map<string, string>();

function getReceiptQrCacheKey(r: PaymentRecord) {
  return `${r.id}:${r.transactionNumber}:${r.status}:${roundMoney(r.amount).toFixed(5)}`;
}

async function generateReceiptQrSvgMarkup(r: PaymentRecord): Promise<string> {
  const cacheKey = getReceiptQrCacheKey(r);
  const cachedMarkup = receiptQrMarkupCache.get(cacheKey);
  if (cachedMarkup) return cachedMarkup;

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

  const markup = svg
    .replace(/<\?xml[^>]*\?>\s*/i, "")
    .replace(
      "<svg ",
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code de transaction EduPay" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;max-width:100%;max-height:100%;" '
    );

  receiptQrMarkupCache.set(cacheKey, markup);
  return markup;
}

function analyzeReceiptRisk(r: Pick<PaymentRecord, "parentFullName" | "paymentSubjectName" | "studentNames" | "reason" | "amount" | "status" | "method">) {
  const flags: string[] = [];
  if (r.amount >= 5000) flags.push("Montant élevé : double validation conseillée");
  if (r.status !== "COMPLETED") flags.push("Statut non réglé : ne pas libérer de quittance définitive");
  if (getPaymentSubjectName(r).trim().split(/\s+/).length < 2) flags.push("Identité courte : vérifier le dossier élève");
  if (r.reason.trim().length < 8) flags.push("Motif trop court pour un audit robuste");
  if (r.method === "BANK_TRANSFER") flags.push("Virement bancaire : vérifier la référence et le compte bénéficiaire");
  else if (r.method !== "CASH") flags.push("Paiement mobile : vérifier la référence opérateur");
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
    BANK_TRANSFER: "Virement bancaire",
  };
  return methodLabel[method] ?? method;
}

type BankTransferDetails = {
  bankName: string;
  referenceNumber: string;
  transferDate: string;
  senderAccountNumber?: string;
  beneficiaryAccountNumber: string;
};

function getBankTransferDetailRows(details?: BankTransferDetails | null) {
  if (!details) return [];
  const transferDateLabel = details.transferDate
    ? new Date(`${details.transferDate}T00:00:00`).toLocaleDateString("fr-FR")
    : "";
  return [
    ["Banque", details.bankName],
    ["Référence bancaire", details.referenceNumber],
    ["Date du virement", transferDateLabel],
    ["Compte émetteur", details.senderAccountNumber || ""],
    ["Compte bénéficiaire", details.beneficiaryAccountNumber],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function getStatusLabel(status: string) {
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué",
    CANCELLED: "Annulé",
  };
  return statusLabel[status] ?? status;
}

function buildReceiptMicroText(r: PaymentRecord) {
  const sec = buildReceiptSecurity(r);
  return `EDUPAY-OFFICIAL ${r.transactionNumber} ${sec.verificationCode} ${formatMoney(r.amount)}USD ${r.status}`;
}

function summarizeReceiptText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getReceiptLayoutMode(r: PaymentRecord) {
  const allocationRows = r.tuitionAllocationSummary?.perChild?.length ?? 0;
  const bankRows = r.bankTransferDetails ? getBankTransferDetailRows(r.bankTransferDetails).length : 0;
  const densityScore = Math.ceil(r.reason.trim().length / 40)
    + Math.ceil(r.amountWords.trim().length / 55)
    + allocationRows * 2
    + bankRows;

  if (r.method === "BANK_TRANSFER" && (allocationRows >= 3 || bankRows >= 4) && densityScore >= 10) {
    return {
      mode: "ultra-dense",
      scale: 0.84,
      bodyFontSize: 7.95,
      qrSize: 20,
      compactReason: summarizeReceiptText(r.reason, 100),
      compactAmountWords: summarizeReceiptText(r.amountWords, 120),
      detailNote: "Version dense pour virement bancaire: le detail complet reste consultable dans EduPay avec le QR et le numero de transaction."
    };
  }

  if (densityScore >= 12) {
    return {
      mode: "ultra-dense",
      scale: 0.88,
      bodyFontSize: 8.35,
      qrSize: 22,
      compactReason: summarizeReceiptText(r.reason, 120),
      compactAmountWords: summarizeReceiptText(r.amountWords, 150),
      detailNote: "Version compacte: les détails complets restent vérifiables dans EduPay via le QR et le numéro de transaction."
    };
  }

  if (densityScore >= 8) {
    return {
      mode: "dense",
      scale: 0.94,
      bodyFontSize: 8.9,
      qrSize: 24,
      compactReason: summarizeReceiptText(r.reason, 150),
      compactAmountWords: summarizeReceiptText(r.amountWords, 190),
      detailNote: "Mise en page compacte pour conserver le reçu sur une seule feuille."
    };
  }

  return {
    mode: "standard",
    scale: 1,
    bodyFontSize: 9.5,
    qrSize: 27,
    compactReason: r.reason,
    compactAmountWords: r.amountWords,
    detailNote: ""
  };
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
  const layout = getReceiptLayoutMode(r);
  const compactAllocation = r.method === "BANK_TRANSFER" || layout.mode !== "standard";
  const parentCaption = getPaymentParentCaption(r);
  const logoSrc = escapeHtml(new URL(schoolBranding.logoSrc, window.location.href).toString());
  const safe = {
    tx: escapeHtml(r.transactionNumber),
    date: escapeHtml(r.date),
    parent: escapeHtml(r.parentFullName),
    parentCaption: escapeHtml(parentCaption),
    paymentSubject: escapeHtml(getPaymentSubjectName(r)),
    reason: escapeHtml(layout.compactReason),
    amountWords: escapeHtml(layout.compactAmountWords),
    method: escapeHtml(getMethodLabel(r.method)),
    status: escapeHtml(getStatusLabel(r.status)),
    schoolName: escapeHtml(schoolBranding.schoolName),
    shortName: escapeHtml(schoolBranding.shortName),
    appName: escapeHtml(schoolBranding.appName),
    tagline: escapeHtml(schoolBranding.tagline),
    logoSrc,
    detailNote: escapeHtml(layout.detailNote)
  };
  const security = buildReceiptSecurity(r);
  const risk = analyzeReceiptRisk(r);
  const qrMarkup = await generateReceiptQrSvgMarkup(r).catch(() => "");
  const microText = escapeHtml(buildReceiptMicroText(r));
  const parentSecondaryLine = safe.parentCaption
    ? `<div class="value-sub"><span class="value-sub-badge">Parent concerne</span><span>${safe.parentCaption}</span></div>`
    : "";
  const allocationSnapshot = r.tuitionAllocationSummary
    ? buildReceiptAllocationSnapshot(r.tuitionAllocationSummary, {
        maxVisibleChildren: compactAllocation ? (layout.mode === "ultra-dense" ? 2 : 3) : 4,
        maxVisibleMetrics: compactAllocation ? 2 : 4
      })
    : null;
  const allocationBodyHtml = allocationSnapshot
    ? compactAllocation
      ? `<div class="allocation-list">${allocationSnapshot.perChild.map((child) => `<div class="allocation-item">
            <div class="allocation-item-head">
              <strong>${escapeHtml(child.studentName)}</strong>
              <span>$ ${formatMoney(child.allocated)}</span>
            </div>
            <div class="allocation-item-sub">Reste à couvrir : $ ${formatMoney(child.remaining)}</div>
          </div>`).join("")}</div>`
      : `<table>
          <thead><tr><th>Bénéficiaire</th><th>Montant imputé</th><th>Solde restant</th></tr></thead>
          <tbody>${allocationSnapshot.perChild.map((child) => `<tr>
            <td>${escapeHtml(child.studentName)}</td>
            <td>$ ${formatMoney(child.allocated)}</td>
            <td>$ ${formatMoney(child.remaining)}</td>
          </tr>`).join("")}</tbody>
        </table>`
    : "";
  const allocationSummaryHtml = allocationSnapshot
    ? `<div class="allocation ${compactAllocation ? "compact" : ""}">
        <div class="allocation-head">
          <div class="allocation-title">Ventilation du paiement</div>
          <div class="allocation-pill">${escapeHtml(allocationSnapshot.modeLabel)}</div>
        </div>
        <div class="allocation-metrics">${allocationSnapshot.metrics.map((metric) => `<div class="allocation-metric"><span>${escapeHtml(metric.label)}</span><strong>$ ${formatMoney(metric.amount)}</strong></div>`).join("")}</div>
        <div class="allocation-note">${escapeHtml(allocationSnapshot.statusNote)}</div>
        ${allocationBodyHtml}
        ${allocationSnapshot.overflowChildCount > 0 ? `<div class="allocation-overflow">+ ${allocationSnapshot.overflowChildCount} autre(s) dossier(s) figurent dans le detail complet EduPay.</div>` : ""}
      </div>`
    : "";
  const bankTransferHtml = r.method === "BANK_TRANSFER" && r.bankTransferDetails
    ? `<div class="allocation compact allocation-bank">
        <div class="allocation-head">
          <div class="allocation-title">Détails du virement bancaire</div>
          <div class="allocation-pill">Virement</div>
        </div>
        <table>
          <tbody>${getBankTransferDetailRows(r.bankTransferDetails).map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Reçu ${safe.tx}</title>
  <style>
    @page { size: A5 landscape; margin: 3mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: ${fonts.body}; font-weight:${fonts.bodyWeight}; letter-spacing:${fonts.bodyLetterSpacing}; color:#101827; background:#fff; font-size:${layout.bodyFontSize}px; }
    .sheet { width:202mm; height:140mm; margin:0 auto; overflow:hidden; display:flex; align-items:flex-start; justify-content:flex-start; }
    .receipt { --receipt-scale:${layout.scale}; --qr-size:${layout.qrSize}mm; position:relative; width:calc(202mm / var(--receipt-scale)); height:calc(140mm / var(--receipt-scale)); transform:scale(var(--receipt-scale)); transform-origin:top left; border:0.9mm double #123047; padding:4.2mm; overflow:hidden; }
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
    .qr { width:var(--qr-size); min-width:var(--qr-size); border:1px solid #123047; background:#fff; padding:1mm; }
    .qr svg { display:block; width:100%; height:auto; }
    .qr-copy { margin-top:1mm; text-align:center; font-size:6px; font-weight:800; line-height:1.35; color:#334155; }
    .qr-fallback { width:var(--qr-size); min-width:var(--qr-size); min-height:var(--qr-size); border:1px dashed #94a3b8; display:flex; align-items:center; justify-content:center; text-align:center; padding:2mm; font-size:6px; font-weight:800; color:#64748b; background:#f8fafc; }
    .seal-row { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:3.4mm; }
    .box { min-height:17mm; border:1px dashed #475569; padding:1.5mm; display:flex; flex-direction:column; justify-content:space-between; }
    .box-title { font-size:7px; font-weight:900; color:#475569; text-transform:uppercase; letter-spacing:.8px; }
    .line { border-top:1px solid #475569; padding-top:.8mm; text-align:center; font-size:6.8px; color:#64748b; }
    .stamp { align-items:center; justify-content:center; text-align:center; border-style:solid; }
    .stamp-circle { width:17mm; height:17mm; border:1px dashed #123047; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:auto; background:#fff; color:#94a3b8; font-size:5.8px; font-weight:800; text-transform:uppercase; letter-spacing:.45px; }
    .warning { margin-top:2.2mm; border-left:2.4px solid #b45309; background:#fffbeb; color:#78350f; padding:1.35mm; font-size:6.7px; }
    .allocation { position:relative; margin-top:1.8mm; border:1px solid #cbd5e1; background:#f8fafc; padding:1.5mm; }
    .allocation-head { display:flex; align-items:center; justify-content:space-between; gap:2mm; }
    .allocation-title { font-size:7px; font-weight:900; color:#123047; text-transform:uppercase; letter-spacing:.7px; }
    .allocation-pill { border:1px solid rgba(18,48,71,.18); border-radius:999px; padding:.45mm 1.6mm; background:#fff; color:#123047; font-size:6.2px; font-weight:900; text-transform:uppercase; letter-spacing:.45px; }
    .allocation-metrics { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:1mm; margin-top:1mm; }
    .allocation-metric { border:1px solid #dbe4ef; background:#fff; padding:.9mm 1.1mm; display:flex; align-items:center; justify-content:space-between; gap:1mm; font-size:6.1px; color:#475569; }
    .allocation-metric strong { color:#123047; font-family:${fonts.mono}; font-size:6.6px; }
    .allocation-note { margin-top:1mm; font-size:6.2px; font-weight:700; color:#334155; line-height:1.35; }
    .allocation table { width:100%; border-collapse:collapse; margin-top:1.1mm; font-size:6.2px; }
    .allocation th, .allocation td { border-top:1px solid #e2e8f0; padding:.8mm; text-align:left; vertical-align:top; }
    .allocation th { color:#475569; text-transform:uppercase; letter-spacing:.45px; }
    .allocation-overflow { margin-top:.8mm; font-size:6px; font-weight:700; color:#64748b; }
    .allocation.compact { margin-top:1.5mm; padding:1.2mm; }
    .allocation.compact .allocation-title { font-size:6.4px; }
    .allocation.compact .allocation-pill { padding:.35mm 1.3mm; font-size:5.7px; }
    .allocation.compact .allocation-metrics { margin-top:.7mm; gap:.7mm; }
    .allocation.compact .allocation-metric { padding:.6mm .9mm; font-size:5.8px; }
    .allocation.compact .allocation-metric strong { font-size:6.1px; }
    .allocation.compact .allocation-note { margin-top:.7mm; font-size:5.8px; line-height:1.22; }
    .allocation.compact table { margin-top:.7mm; font-size:5.8px; }
    .allocation.compact th, .allocation.compact td { padding:.55mm .65mm; }
    .allocation-list { display:grid; gap:.75mm; margin-top:.8mm; }
    .allocation-item { border:1px solid #dbe4ef; background:#fff; padding:.75mm .95mm; }
    .allocation-item-head { display:flex; align-items:center; justify-content:space-between; gap:1mm; font-size:5.95px; color:#123047; }
    .allocation-item-head strong { min-width:0; flex:1; }
    .allocation-item-head span { font-family:${fonts.mono}; font-weight:900; white-space:nowrap; }
    .allocation-item-sub { margin-top:.4mm; font-size:5.55px; color:#475569; }
    .allocation-bank table { table-layout:fixed; }
    .allocation-bank th { width:33%; }
    .compact-note { margin-top:1.2mm; font-size:6px; font-weight:700; line-height:1.35; color:#64748b; }
    .footer { margin-top:2.4mm; display:flex; justify-content:space-between; color:#64748b; font-size:6.8px; border-top:1px solid #dbe4ef; padding-top:1.2mm; gap:2mm; }
    @media print { html, body { width:210mm; height:148mm; overflow:hidden; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .sheet, .receipt { margin:0; page-break-inside:avoid; break-inside:avoid; } }
  </style>
</head>
<body>
<div class="sheet"><div class="receipt">
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
        <div class="amount-value">$ ${formatMoney(r.amount)}</div>
        <div class="words"><strong>En toutes lettres:</strong> ${safe.amountWords}</div>
      </div>
      ${bankTransferHtml}
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
        ${safe.detailNote ? `<div class="compact-note">${safe.detailNote}</div>` : ""}
      </div>
      <div class="warning">
        Toute modification du montant, de l'élève, du statut ou du motif invalide le code de vérification. Reçu valable uniquement avec signature du caissier et sceau de l'école.
      </div>
      <div class="seal-row">
        <div class="box">
          <div class="box-title">Signature du caissier</div>
          <div class="line">Nom, signature et date</div>
        </div>
        <div class="box stamp">
          <div class="box-title">Sceau de l'école</div>
          <div class="stamp-circle">Emplacement réservé</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${safe.schoolName} - ${safe.appName} - Norme interne RCT-01</span>
    <span>Ref: ${safe.tx} - ${new Date().toLocaleDateString("fr-FR")}</span>
  </div>
  <div class="micro">${microText} ${microText} ${microText}</div>
</div></div>
</body>
</html>`;
}
type PaymentExportScope = {
  title?: string;
  search?: string;
  status?: string;
  method?: string;
  className?: string;
  dateFrom?: string;
  dateTo?: string;
};

function parsePaymentDate(value: string): Date | null {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const numeric = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monthMap: Record<string, number> = {
    janvier: 0, january: 0,
    fevrier: 1, février: 1, february: 1,
    mars: 2, march: 2,
    avril: 3, april: 3,
    mai: 4, may: 4,
    juin: 5, june: 5,
    juillet: 6, july: 6,
    aout: 7, août: 7, august: 7,
    septembre: 8, september: 8,
    octobre: 9, october: 9,
    novembre: 10, november: 10,
    decembre: 11, décembre: 11, december: 11
  };
  const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const named = normalized.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (named) {
    const month = monthMap[named[2]];
    if (month !== undefined) {
      const parsed = new Date(Number(named[3]), month, Number(named[1]));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function paymentMatchesDateRange(payment: PaymentRecord, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;
  const paymentDate = parsePaymentDate(payment.date);
  if (!paymentDate) return false;

  const paymentDay = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate()).getTime();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
  return paymentDay >= fromTime && paymentDay <= toTime;
}

function buildPaymentScopeLabel(scope?: PaymentExportScope) {
  if (!scope) return "";
  return [
    scope.search?.trim() ? `Recherche : ${scope.search.trim()}` : "Recherche : toutes categories",
    scope.className && scope.className !== "ALL" ? `Classe : ${scope.className}` : "Classe : toutes",
    scope.status && scope.status !== "ALL" ? `Statut : ${getStatusLabel(scope.status)}` : "Statut : tous",
    scope.method && scope.method !== "ALL" ? `Mode : ${getMethodLabel(scope.method as PaymentRecord["method"])}` : "Mode : tous",
    scope.dateFrom ? `Du : ${new Date(`${scope.dateFrom}T00:00:00`).toLocaleDateString("fr-FR")}` : "",
    scope.dateTo ? `Au : ${new Date(`${scope.dateTo}T00:00:00`).toLocaleDateString("fr-FR")}` : ""
  ].filter(Boolean).join(" | ");
}

function buildPaymentExportFilename(prefix: string, scope: PaymentExportScope) {
  const category = normalizeSearchText(scope.search || "toutes-categories").replace(/\s+/g, "-") || "toutes-categories";
  const className = scope.className && scope.className !== "ALL" ? normalizeSearchText(scope.className).replace(/\s+/g, "-") : "toutes-classes";
  const status = scope.status && scope.status !== "ALL" ? scope.status.toLowerCase() : "tous-statuts";
  const method = scope.method && scope.method !== "ALL" ? scope.method.toLowerCase().replace(/_/g, "-") : "tous-modes";
  const period = `${scope.dateFrom || "debut"}-${scope.dateTo || "fin"}`;
  return `${prefix}-${category}-${className}-${status}-${method}-${period}-${new Date().toISOString().slice(0, 10)}`;
}

/* --- État financier HTML (général ou par parent) -------------------------- */
function buildReportHtml(payments: PaymentRecord[], filterParent?: string, scope?: PaymentExportScope): string {
  const filtered = filterParent
    ? payments.filter((p) => getPaymentSubjectName(p).toLowerCase().includes(filterParent.toLowerCase()))
    : payments;
  const activePayments = filtered.filter((p) => p.status !== "CANCELLED");

  const byParent = filtered.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
    const key = getPaymentSubjectName(p);
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const grandTotal = activePayments.reduce((s, p) => s + p.amount, 0);
  const completedTotal = filtered.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0);
  const pendingTotal = filtered.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
  const failedTotal = filtered.filter((p) => p.status === "FAILED").reduce((s, p) => s + p.amount, 0);
  const cancelledTotal = filtered.filter((p) => p.status === "CANCELLED").reduce((s, p) => s + p.amount, 0);

  const methodLabel: Record<string, string> = {
    CASH: "Cash / Especes",
    AIRTEL_MONEY: "Airtel Money",
    MPESA: "M-Pesa",
    ORANGE_MONEY: "Orange Money"
  };
  const statusColor: Record<string, string> = {
    COMPLETED: "#16a34a",
    PENDING: "#d97706",
    FAILED: "#dc2626",
    CANCELLED: "#64748b"
  };
  const statusLabel: Record<string, string> = {
    COMPLETED: "Réglé",
    PENDING: "En attente",
    FAILED: "Échoué",
    CANCELLED: "Annulé"
  };

  const generatedAt = new Date();
  const documentReference = plainPrintText(`KCS-PAY-${generatedAt.toISOString().slice(0, 10)}-${String(filtered.length).padStart(4, "0")}`);
  const brand = {
    schoolName: plainPrintText(schoolBranding.schoolName),
    shortName: plainPrintText(schoolBranding.shortName),
    appName: plainPrintText(schoolBranding.appName),
    tagline: plainPrintText(schoolBranding.tagline),
    logoSrc: escapeHtml(new URL(schoolBranding.logoSrc, window.location.href).toString())
  };

  const byMethod = activePayments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  const methodRows = Object.entries(byMethod)
    .map(([m, total]) => `<tr>
      <td style="padding:5px 10px">${methodLabel[m] ?? plainPrintText(m)}</td>
      <td style="padding:5px 10px; font-family:monospace; font-weight:bold; text-align:right; color:#1e3a5f">$ ${formatMoney(total)}</td>
    </tr>`)
    .join("");

  const parentBlocks = Object.entries(byParent).map(([parent, recs]) => {
    const parentName = plainPrintText(parent);
    const parentCaption = plainPrintText(Array.from(new Set(recs.map((r) => getPaymentParentCaption(r)).filter(Boolean))).join(" / "));
    const total = recs.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + r.amount, 0);
    const rows = recs.map((r) => `<tr>
      <td style="padding:6px 8px; font-family:monospace; font-size:11px; color:#475569">${plainPrintText(r.transactionNumber)}</td>
      <td style="padding:6px 8px; font-size:11px; white-space:nowrap">${plainPrintText(r.date.split(",").slice(0, 2).join(","))}</td>
      <td style="padding:6px 8px; font-size:11px">${plainPrintText(r.reason)}</td>
      <td style="padding:6px 8px; font-size:11px">${methodLabel[r.method] ?? plainPrintText(r.method)}</td>
      <td style="padding:6px 8px; text-align:right; font-family:monospace; font-weight:bold; font-size:12px">$ ${formatMoney(r.amount)}</td>
      <td style="padding:6px 8px; text-align:center; font-size:11px; font-weight:bold; color:${statusColor[r.status] ?? "#111"}">${statusLabel[r.status] ?? plainPrintText(r.status)}</td>
    </tr>`).join("");

    return `<div style="margin-bottom:32px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1e3a5f; color:#fff; padding:10px 14px; border-radius:4px 4px 0 0;">
        <div>
          <div style="font-weight:bold; font-size:14px">${parentName}</div>
          ${parentCaption ? `<div style="margin-top:4px; font-size:11px; color:rgba(255,255,255,0.78)">Parent concerne : ${parentCaption}</div>` : ""}
        </div>
        <div style="font-family:monospace; font-weight:bold; font-size:14px">Total : $ ${formatMoney(total)}</div>
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
            <td style="padding:8px; text-align:right; font-family:monospace; font-weight:bold; font-size:13px; color:#1e3a5f">$ ${formatMoney(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }).join("");

  const title = scope?.title
    ? plainPrintText(scope.title)
    : filterParent ? `État financier - ${plainPrintText(filterParent)}` : "État général des paiements";
  const scopeLabel = plainPrintText(buildPaymentScopeLabel(scope));

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
    .topbar {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      padding-bottom:10px;
      color:#64748b;
      font-size:10px;
      text-transform:uppercase;
      letter-spacing:0.16em;
    }
    .topbar strong { color:#1e3a5f; }
    .compliance {
      margin-top:18px;
      border:1px solid rgba(15,118,110,0.2);
      border-left:5px solid #0f766e;
      border-radius:14px;
      background:rgba(240,253,250,0.96);
      padding:12px 14px;
      color:#134e4a;
      font-size:11px;
      line-height:1.5;
    }
    .signatures {
      margin-top:16px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:16px;
    }
    .signature-box {
      min-height:82px;
      border:1px dashed rgba(30,58,95,0.24);
      border-radius:14px;
      background:rgba(255,255,255,0.88);
      padding:12px;
    }
    .signature-title {
      font-size:10px;
      text-transform:uppercase;
      letter-spacing:0.14em;
      font-weight:800;
      color:#64748b;
    }
    .signature-line {
      margin-top:38px;
      border-top:1px solid rgba(30,58,95,0.24);
      padding-top:6px;
      font-size:11px;
      color:#1e3a5f;
      font-weight:700;
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
    <div class="topbar">
      <span><strong>${brand.shortName}</strong> · état officiel des paiements</span>
      <span>Référence ${documentReference}</span>
    </div>
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
        <div style="font-weight:bold; font-size:13px">${generatedAt.toLocaleDateString("fr-FR")}</div>
        <div style="font-size:11px; color:#64748b">${generatedAt.toLocaleTimeString("fr-FR")}</div>
      </div>
    </div>

    <div style="text-align:center; font-size:17px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; border:2px solid #0d1b2a; padding:10px 0; margin-bottom:24px;">
      ${title}
    </div>
    ${scopeLabel ? `<div style="border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; color:#334155; padding:10px 12px; margin:-12px 0 22px; font-size:11px; font-weight:bold;">${scopeLabel}</div>` : ""}

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:24px;">
      <div style="border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; background:#f8fafc;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Total encaisse (USD)</div>
        <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${formatMoney(grandTotal)}</div>
        <div style="font-size:9px; color:#94a3b8; margin-top:2px;">${activePayments.length} active${activePayments.length > 1 ? "s" : ""} / ${filtered.length} transaction${filtered.length > 1 ? "s" : ""}</div>
      </div>
      <div style="border:1px solid #d1fae5; border-radius:6px; padding:12px 14px; background:#f0fdf4;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Paiements réglés</div>
        <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#16a34a;">$ ${formatMoney(completedTotal)}</div>
      </div>
      <div style="border:1px solid #fef3c7; border-radius:6px; padding:12px 14px; background:#fffbeb;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">En attente</div>
        <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#d97706;">$ ${formatMoney(pendingTotal)}</div>
      </div>
      <div style="border:1px solid #fee2e2; border-radius:6px; padding:12px 14px; background:#fef2f2;">
        <div style="font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:4px;">Échoués</div>
        <div style="font-size:16px; font-weight:bold; font-family:monospace; color:#dc2626;">$ ${formatMoney(failedTotal)}</div>
        <div style="font-size:10px; color:#64748b; margin-top:2px;">Annules: $ ${formatMoney(cancelledTotal)}</div>
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

    ${parentBlocks || '<p style="color:#64748b; text-align:center; padding:40px">Aucun paiement trouvé.</p>'}

    <div style="border-top:3px double #1e3a5f; padding-top:16px; display:flex; justify-content:flex-end; align-items:center; gap:20px; margin-top:12px;">
      <span style="font-size:14px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">TOTAL GENERAL (USD)</span>
      <span style="font-size:22px; font-weight:bold; font-family:monospace; color:#1e3a5f;">$ ${formatMoney(grandTotal)}</span>
    </div>
    <div class="compliance">
      Ce document reprend l'état filtré des paiements visible dans EduPay. Il est émis selon la charte ${brand.shortName}, avec identité de l'établissement, logo en en-tête et filigrane pour archivage administratif.
    </div>
    <div class="signatures">
      <div class="signature-box">
        <div class="signature-title">Validation comptable</div>
        <div class="signature-line">Service financier</div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Visa de direction</div>
        <div class="signature-line">Direction de l'établissement</div>
      </div>
    </div>
    <div style="margin-top:28px; text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px;">
      Document généré officiellement par <strong>${brand.appName}</strong> pour <strong>${brand.schoolName}</strong> -
      ${generatedAt.toLocaleString("fr-FR")}
    </div>
  </div>
</body>
</html>`;
}

/* --- Ouverture popup + impression ---------------------------------------- */
function printHtml(html: string) {
  printHtmlDocument(html);
}

async function printReceiptDocument(payment: PaymentRecord, lang: string) {
  const html = await buildReceiptHtml(payment, lang);
  printHtml(html);
  await api(`/api/payments/${payment.id}/receipt/printed`, { method: "POST" }).catch((error) => {
    console.warn("Receipt print notification failed", error);
  });
}

function exportReceiptExcel(payment: PaymentRecord) {
  exportWorkbook(`reçu-${payment.transactionNumber}`, [
    {
      name: "Recu",
      rows: [{
        "No Transaction": payment.transactionNumber,
        "Date": payment.date,
        "Paiement pour": getPaymentSubjectName(payment),
        "Parent concerné": getPaymentParentCaption(payment) || payment.parentFullName,
        "Motif": payment.reason,
        "Montant USD": payment.amount,
        "Montant en lettres": payment.amountWords,
        "Mode": getMethodLabel(payment.method),
        "Statut": getStatusLabel(payment.status),
        "Banque": payment.bankTransferDetails?.bankName || "-",
        "Référence bancaire": payment.bankTransferDetails?.referenceNumber || "-",
        "Date du virement": payment.bankTransferDetails?.transferDate || "-",
        "Compte émetteur": payment.bankTransferDetails?.senderAccountNumber || "-",
        "Compte bénéficiaire": payment.bankTransferDetails?.beneficiaryAccountNumber || "-",
        "Code verification": buildReceiptSecurity(payment).verificationCode
      }]
    }
  ]);
}

function exportPaymentsExcel(filename: string, records: PaymentRecord[], parentFilter?: string, scope?: PaymentExportScope) {
  const filtered = parentFilter
    ? records.filter((payment) => getPaymentSubjectName(payment) === parentFilter)
    : records;
  const activePayments = filtered.filter((payment) => payment.status !== "CANCELLED");

  const total = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const completed = filtered.filter((payment) => payment.status === "COMPLETED");
  const pending = filtered.filter((payment) => payment.status === "PENDING");
  const failed = filtered.filter((payment) => payment.status === "FAILED");
  const cancelled = filtered.filter((payment) => payment.status === "CANCELLED");

  const byMethod = activePayments.reduce<Record<string, number>>((acc, payment) => {
    const key = getMethodLabel(payment.method);
    acc[key] = (acc[key] ?? 0) + payment.amount;
    return acc;
  }, {});

  exportWorkbook(filename, [
    {
      name: "Synthese",
      rows: [{
        "Portée": parentFilter || "Globale",
        "Filtres appliqués": buildPaymentScopeLabel(scope) || "Aucun filtre spécifique",
        "Période du": scope?.dateFrom || "-",
        "Période au": scope?.dateTo || "-",
        "Paiements": filtered.length,
        "Total USD": total,
        "Réglés USD": completed.reduce((sum, payment) => sum + payment.amount, 0),
        "En attente USD": pending.reduce((sum, payment) => sum + payment.amount, 0),
        "Echoues USD": failed.reduce((sum, payment) => sum + payment.amount, 0),
        "Annules USD": cancelled.reduce((sum, payment) => sum + payment.amount, 0)
      }]
    },
    {
      name: "Paiements",
      rows: filtered.map((payment) => ({
        "No Transaction": payment.transactionNumber,
        "Date": payment.date,
        "Paiement pour": getPaymentSubjectName(payment),
        "Parent concerné": getPaymentParentCaption(payment) || payment.parentFullName,
        "Motif": payment.reason,
        "Mode": getMethodLabel(payment.method),
        "Montant USD": payment.amount,
        "Statut": getStatusLabel(payment.status),
        "Categorie recherche": scope?.search || "-",
        "Période export": scope?.dateFrom || scope?.dateTo ? `${scope?.dateFrom || "debut"} - ${scope?.dateTo || "fin"}` : "Toutes dates",
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
  studentClassNames?: string[];
  reason: string;
  amount: number;
  amountWords: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY" | "BANK_TRANSFER";
  status: "COMPLETED" | "PENDING" | "FAILED" | "CANCELLED";
  bankTransferDetails?: BankTransferDetails | null;
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
  paymentScope: "TUITION" | "SERVICE";
  parentId: string;
  studentIds: string[];
  parentFullName: string;
  reason: string;
  amount: string;
  method: "CASH" | "AIRTEL_MONEY" | "MPESA" | "ORANGE_MONEY" | "BANK_TRANSFER";
  status: "COMPLETED" | "PENDING" | "FAILED" | "CANCELLED";
  bankName: string;
  transferReference: string;
  transferDate: string;
  senderAccountNumber: string;
  beneficiaryAccountNumber: string;
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
    paymentOptionType?: string;
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

type PaymentOptionType = "FULL_PRESEPTEMBER" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS" | "STANDARD_MONTHLY" | "SPECIAL_OWNER_AGREEMENT";
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
    CURRENT: "Échéance actuelle",
    FUTURE: "Échéance future"
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
      `Le financier a choisi la répartition manuelle pour ${fmtUsd(preview.totalReceived)}.`,
      `Le système contrôle que le total réparti est égal au paiement reçu : ${fmtUsd(preview.allocatedTotal)} imputé.`,
      preview.missingAmount > 0
        ? `Il reste ${fmtUsd(preview.missingAmount)} non couvert sur les échéances sélectionnées.`
        : "Toutes les lignes couvertes par cette répartition sont soldées."
    ];
  }

  const overdue = preview.lines.filter((line) => line.dueBucket === "OVERDUE" && line.allocated > 0);
  const current = preview.lines.filter((line) => line.dueBucket === "CURRENT" && line.allocated > 0);
  const future = preview.lines.filter((line) => line.dueBucket === "FUTURE" && line.allocated > 0);
  const children = buildAllocationChildSummaries(preview)
    .map((child) => `${child.studentName} : ${fmtUsd(child.allocated)} appliqué, ${fmtUsd(child.remaining)} reste`)
    .join(" | ");

  return [
    `Montant reçu : ${fmtUsd(preview.totalReceived)}. Le système paie d'abord les retards, puis l'échéance actuelle, puis les futures échéances par date.`,
    overdue.length > 0
      ? `Retards payés en premier : ${overdue.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucun retard ouvert n'a été trouvé pour ce paiement.",
    current.length > 0
      ? `Échéance actuelle traitée ensuite : ${current.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucune échéance actuelle ouverte n'a été trouvée.",
    future.length > 0
      ? `Futures échéances traitées par ordre de date : ${future.map((line) => `${line.studentName} / ${line.label} ${fmtUsd(line.allocated)}`).join("; ")}.`
      : "Aucune future échéance n'a reçu d'argent après les priorités.",
    children,
    preview.advanceBalance > 0
      ? `Excédent conservé comme avance : ${fmtUsd(preview.advanceBalance)}.`
      : `Montant encore requis après allocation : ${fmtUsd(preview.missingAmount)}.`
  ].filter(Boolean);
}

type View = "form" | "receipt" | "history" | "report";

const EMPTY_FORM: FormState = {
  paymentScope: "TUITION", parentId: "", studentIds: [], parentFullName: "", reason: "", amount: "", method: "CASH", status: "COMPLETED", bankName: "", transferReference: "", transferDate: "", senderAccountNumber: "", beneficiaryAccountNumber: "",
};

const PAYMENT_NOTIFICATION_STORAGE_KEY = "edupay-payment-notifications-enabled";
const PAYMENT_PARENT_NOTIFICATION_STORAGE_KEY = "edupay-parent-payment-notifications-v1";

const STORAGE_KEY = "edupay_payments_v3";
const LEGACY_STORAGE_KEYS = ["edupay_payments_v2"];

function normalizeParentStudentOption(student: Partial<ParentStudentOption> | null | undefined, index: number): ParentStudentOption {
  const id = String(student?.id || student?.externalStudentId || `student-${index + 1}`);
  return {
    id,
    externalStudentId: student?.externalStudentId ? String(student.externalStudentId) : id,
    fullName: String(student?.fullName || "Eleve non renseigne"),
    classId: String(student?.classId || ""),
    className: String(student?.className || student?.classId || ""),
    annualFee: Number.isFinite(Number(student?.annualFee)) ? Number(student?.annualFee) : 0
  };
}

function normalizeParentOption(parent: Partial<ParentOption> | null | undefined, index: number): ParentOption {
  const id = String(parent?.id || `parent-${index + 1}`);
  return {
    id,
    fullName: String(parent?.fullName || id),
    phone: parent?.phone ? String(parent.phone) : "",
    email: parent?.email ? String(parent.email) : "",
    students: Array.isArray(parent?.students)
      ? parent.students.map(normalizeParentStudentOption).filter((student) => student.id && student.fullName)
      : []
  };
}

function loadPayments(): PaymentRecord[] {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as PaymentRecord[];
    if (Array.isArray(current) && current.length > 0) return current;

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(legacyKey) ?? "[]") as PaymentRecord[];
      if (Array.isArray(legacy) && legacy.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
        return legacy;
      }
    }

    return Array.isArray(current) ? current : [];
  } catch { return []; }
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
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
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
  { value: "STANDARD_MONTHLY", label: "Monthly", detail: "No plan discount, 4 months due upfront" },
  { value: "SPECIAL_OWNER_AGREEMENT", label: "Accord spécial parent-école", detail: "Montant manuel défini par la finance" }
];

const HISTORY_PRODUCT_FILTERS = [
  "frais scolaires",
  "inscription",
  "reinscription",
  "uniforme",
  "transport",
  "cantine",
  "bibliothèque",
  "examen"
];

const SERVICE_PAYMENT_REASON_SUGGESTIONS = [
  "Abonnement bus scolaire",
  "Frais d'uniforme",
  "Frais de cantine",
  "Frais de bibliothèque",
  "Frais d'examen",
  "Frais de bulletin",
  "Frais d'activités parascolaires",
  "Sortie pédagogique"
];

const KCS_CLASS_ORDER = [
  "K3",
  "K4",
  "K5",
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`)
];

const SCHOOL_PRODUCT_ALIASES: Record<string, string[]> = {
  "frais scolaires": ["frais scolaires", "frais scolaire", "scolarité", "scolarité", "trimestre", "tuition"],
  inscription: ["inscription", "admission", "nouvelle inscription"],
  reinscription: ["reinscription", "réinscription", "renouvellement"],
  uniforme: ["uniforme", "tenue", "kit scolaire"],
  transport: ["transport", "bus", "ramassage"],
  cantine: ["cantine", "restauration", "repas"],
  bibliothèque: ["bibliothèque", "bibliothèque", "livre", "manuels"],
  examen: ["examen", "epreuve", "épreuve", "test"],
  bulletin: ["bulletin", "rapport scolaire"],
  activités: ["activités", "activités", "parascolaire", "club", "sport"],
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

function normalizeClassName(value: string) {
  const normalized = normalizeSearchText(value).replace(/[\s_-]+/g, "");
  const kindergarten = normalized.match(/^k(?:inder)?([345])$/);
  if (kindergarten) return `K${kindergarten[1]}`;
  const grade = normalized.match(/^(?:grade|g)(\d{1,2})$/);
  if (grade) return `Grade ${Number(grade[1])}`;
  return value.trim();
}

function getProductSearchTags(reason: string) {
  const normalizedReason = normalizeSearchText(reason);
  return Object.entries(SCHOOL_PRODUCT_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalizedReason.includes(normalizeSearchText(alias))))
    .map(([product]) => product);
}

function getStatusSearchTags(status: PaymentRecord["status"]) {
  const tags: Record<PaymentRecord["status"], string[]> = {
    COMPLETED: ["paye", "payes", "regle", "regles", "paid", "completed"],
    PENDING: ["attente", "pending", "non regle", "unpaid"],
    FAILED: ["echoue", "failed", "refuse"],
    CANCELLED: ["annule", "cancelled"]
  };
  return tags[status] ?? [];
}

function buildPaymentSearchText(payment: PaymentRecord) {
  const allocationStudents = payment.tuitionAllocationSummary?.perChild.flatMap((child) => [
    child.studentName,
    ...child.lines.map((line) => line.label)
  ]) ?? [];
  return normalizeSearchText([
    getPaymentSubjectName(payment),
    payment.parentFullName,
    ...(payment.studentNames ?? []),
    ...(payment.studentClassNames ?? []),
    ...allocationStudents,
    payment.reason,
    payment.transactionNumber,
    payment.method.replace(/_/g, " "),
    payment.status,
    ...getStatusSearchTags(payment.status),
    ...getProductSearchTags(payment.reason)
  ].join(" "));
}

/* --- Badge statut --------------------------------------------------------- */
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    PENDING:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
    FAILED:    "bg-red-500/15 text-red-300 border-red-500/30",
    CANCELLED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  const lbl: Record<string, string> = {
    COMPLETED: "Réglé", PENDING: "En attente", FAILED: "Échoué",
    CANCELLED: "Annule",
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
          {receipt.method === "BANK_TRANSFER" && receipt.bankTransferDetails ? getBankTransferDetailRows(receipt.bankTransferDetails).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[120px_1fr] gap-3 border-b border-dotted border-slate-300 py-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
              <span className="text-sm font-bold text-slate-700">{value}</span>
            </div>
          )) : null}
          <div className="mt-3 border-2 border-slate-900 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Montant reçu en dollars américains</p>
            <p className="mt-1 font-mono text-2xl font-black text-slate-900">$ {formatMoney(receipt.amount)}</p>
            <p className="mt-2 border-t border-slate-300 pt-2 text-xs italic text-slate-700">
              <strong>En toutes lettres:</strong> {receipt.amountWords}
            </p>
          </div>
          {receipt.tuitionAllocationSummary && (() => {
            const allocationSnapshot = buildReceiptAllocationSnapshot(receipt.tuitionAllocationSummary);
            return (
              <div className="mt-3 border border-slate-300 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ventilation du paiement</p>
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">{allocationSnapshot.modeLabel}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  {allocationSnapshot.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600">
                      <p className="font-black uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                      <p className="mt-1 font-mono font-black text-slate-900">$ {formatMoney(metric.amount)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-600">{allocationSnapshot.statusNote}</p>
                <div className="mt-2 space-y-2">
                  {allocationSnapshot.perChild.map((child) => (
                    <div key={child.studentName} className="rounded-md border border-slate-200 bg-white p-2 text-[11px]">
                      <div className="flex justify-between gap-3 font-bold text-slate-900">
                        <span>{child.studentName}</span>
                        <span>Imputé $ {formatMoney(child.allocated)} - Solde $ {formatMoney(child.remaining)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {allocationSnapshot.overflowChildCount > 0 ? (
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">+ {allocationSnapshot.overflowChildCount} autre(s) dossier(s) dans le detail complet.</p>
                ) : null}
              </div>
            );
          })()}
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
            Toute modification du montant, de l'élève, du statut ou du motif invalide le code de vérification.
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex min-h-24 flex-col justify-between border border-dashed border-slate-600 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Signature du caissier</p>
              <p className="border-t border-slate-500 pt-1 text-center text-[10px] text-slate-500">Nom, signature et date</p>
            </div>
            <div className="flex min-h-24 flex-col items-center justify-between border border-slate-600 p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Sceau de l'école</p>
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-900 bg-white p-2 text-[9px] font-black uppercase tracking-wide text-slate-400">
                Emplacement réservé
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
  const [parentLookupQuery, setParentLookupQuery] = useState("");
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
  const [filterClass, setFilterClass]       = useState("ALL");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyNotificationPanelOpen, setHistoryNotificationPanelOpen] = useState(false);
  const [receiptPrintingId, setReceiptPrintingId] = useState<string | null>(null);
  const [historyPrintBusy, setHistoryPrintBusy] = useState(false);
  const [historyExcelBusy, setHistoryExcelBusy] = useState(false);
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
      .then((items) => {
        const normalizedParents = Array.isArray(items)
          ? items.map(normalizeParentOption).sort((left, right) => left.fullName.localeCompare(right.fullName, "fr", { sensitivity: "base" }))
          : [];
        setParents(normalizedParents);
      })
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

  const historyClassOptions = useMemo(() => {
    const existing = new Set(payments.flatMap((payment) => payment.studentClassNames ?? []).filter(Boolean).map(normalizeClassName));
    const extras = Array.from(existing)
      .filter((className) => !KCS_CLASS_ORDER.includes(className))
      .sort((left, right) => left.localeCompare(right));
    return [...KCS_CLASS_ORDER, ...extras];
  }, [payments]);

  const filteredPayments = useMemo(() => payments.filter((p) => {
    const query = normalizeSearchText(searchQuery);
    const searchableText = buildPaymentSearchText(p);
    const matchQ = !query || query.split(/\s+/).every((token) => searchableText.includes(token));
    const matchClass = filterClass === "ALL" || (p.studentClassNames ?? []).some((className) => normalizeClassName(className) === filterClass);
    return matchQ
      && matchClass
      && (filterStatus === "ALL" || p.status === filterStatus)
      && (filterMethod === "ALL" || p.method === filterMethod)
      && paymentMatchesDateRange(p, historyDateFrom, historyDateTo);
  }), [payments, searchQuery, filterClass, filterStatus, filterMethod, historyDateFrom, historyDateTo]);

  const historyExportScope = useMemo<PaymentExportScope>(() => ({
    title: "Historique des paiements filtr?",
    search: searchQuery,
    status: filterStatus,
    method: filterMethod,
    className: filterClass,
    dateFrom: historyDateFrom,
    dateTo: historyDateTo
  }), [filterClass, filterMethod, filterStatus, historyDateFrom, historyDateTo, searchQuery]);

  const stats = useMemo(() => ({
    total:     payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0),
    completed: payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0),
    pending:   payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0),
    cancelled: payments.filter((p) => p.status === "CANCELLED").reduce((s, p) => s + p.amount, 0),
    count:     payments.length,
  }), [payments]);

  const triggerReceiptPrint = (payment: PaymentRecord) => {
    setReceiptPrintingId(payment.id);
    void printReceiptDocument(payment, lang)
      .finally(() => {
        window.setTimeout(() => {
          setReceiptPrintingId((current) => current === payment.id ? null : current);
        }, 900);
      });
  };

  const triggerHistoryPrint = () => {
    setHistoryPrintBusy(true);
    try {
      printHtml(buildReportHtml(filteredPayments, undefined, historyExportScope));
    } finally {
      window.setTimeout(() => setHistoryPrintBusy(false), 900);
    }
  };

  const triggerHistoryExcel = () => {
    setHistoryExcelBusy(true);
    try {
      exportPaymentsExcel(buildPaymentExportFilename("historique-paiements", historyExportScope), filteredPayments, undefined, historyExportScope);
    } finally {
      window.setTimeout(() => setHistoryExcelBusy(false), 700);
    }
  };

  const validate = () => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (paymentNotificationsEnabled && !form.parentId) errs.parentId = "Choisissez le parent qui recevra l'email et le SMS.";
    if (form.paymentScope === "TUITION" && selectedParent && (selectedParent.students?.length ?? 0) > 0 && form.studentIds.length === 0) errs.studentIds = "Sélectionnez au moins un élève pour synchroniser ce paiement.";
    if (!form.parentFullName.trim()) errs.parentFullName = t("pmRequired");
    if (!form.reason.trim())         errs.reason         = t("pmRequired");
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = t("pmRequired");
    if (form.method === "BANK_TRANSFER") {
      if (!form.bankName.trim()) errs.bankName = "La banque est obligatoire pour un virement.";
      if (!form.transferReference.trim()) errs.transferReference = "La référence bancaire est obligatoire.";
      if (!form.transferDate.trim()) errs.transferDate = "La date du virement est obligatoire.";
      if (!form.beneficiaryAccountNumber.trim()) errs.beneficiaryAccountNumber = "Le compte bénéficiaire est obligatoire.";
    }
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

  const parentLookupResults = useMemo(() => {
    const query = normalizeSearchText(parentLookupQuery);
    const tokens = query.split(/\s+/).filter(Boolean);
    const hasSearch = tokens.length > 0;

    return parents
      .map((parent) => {
        const matchedStudents = (parent.students ?? []).filter((student) => {
          if (!hasSearch) return false;
          const studentText = normalizeSearchText([
            student.fullName,
            student.className,
            student.externalStudentId
          ].filter(Boolean).join(" "));
          return tokens.every((token) => studentText.includes(token));
        });
        const familyText = normalizeSearchText([
          parent.fullName,
          parent.phone,
          parent.email,
          ...(parent.students ?? []).flatMap((student) => [
            student.fullName,
            student.className,
            student.externalStudentId
          ])
        ].filter(Boolean).join(" "));
        const matches = !hasSearch || tokens.every((token) => familyText.includes(token));
        return { parent, matchedStudents, matches };
      })
      .filter((item) => item.matches || (!hasSearch && item.parent.id === form.parentId))
      .sort((left, right) => {
        if (left.parent.id === form.parentId) return -1;
        if (right.parent.id === form.parentId) return 1;
        if (left.matchedStudents.length !== right.matchedStudents.length) {
          return right.matchedStudents.length - left.matchedStudents.length;
        }
        return left.parent.fullName.localeCompare(right.parent.fullName);
      })
      .slice(0, tokens.length > 0 ? 8 : 5);
  }, [form.parentId, parentLookupQuery, parents]);

  const setParentTarget = (parentId: string, studentIds: string[] = []) => {
    const parent = parents.find((item) => item.id === parentId);
    setForm((prev) => ({
      ...prev,
      parentId,
      studentIds,
      parentFullName: parent?.fullName ?? prev.parentFullName
    }));
    setFieldErrors((prev) => ({ ...prev, parentFullName: undefined, studentIds: undefined }));
  };

  const selectFamilyForPayment = (parent: ParentOption, matchedStudents: ParentStudentOption[]) => {
    setParentLookupQuery(parent.fullName);
    setParentTarget(parent.id, matchedStudents.map((student) => student.id));
    setTuitionPreview(null);
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

  const activePaymentReasonSuggestions = form.paymentScope === "SERVICE"
    ? SERVICE_PAYMENT_REASON_SUGGESTIONS
    : PAYMENT_REASON_SUGGESTIONS;

  useEffect(() => {
    const officialOptions = new Set<PaymentOptionType>(["FULL_PRESEPTEMBER", "TWO_INSTALLMENTS", "THREE_INSTALLMENTS", "STANDARD_MONTHLY", "SPECIAL_OWNER_AGREEMENT"]);
    const selectedIds = form.studentIds.length > 0 ? new Set(form.studentIds) : null;
    const financeStudents = (selectedParentFinance?.students ?? [])
      .filter((student) => !selectedIds || selectedIds.has(student.id));
    const officialSelections = Array.from(new Set(
      financeStudents
        .map((student) => student.paymentOptionType)
        .filter((value): value is PaymentOptionType => Boolean(value) && officialOptions.has(value as PaymentOptionType))
    ));

    if (officialSelections.length === 1 && officialSelections[0] !== tuitionPlan) {
      setTuitionPlan(officialSelections[0]);
    }
  }, [form.studentIds, selectedParentFinance, tuitionPlan]);

  const lastAutoReasonRef = useRef("");

  useEffect(() => {
    if (form.paymentScope !== "TUITION") return;
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
  }, [form.paymentScope, selectedStudentDisplayName]);

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
    setTuitionPreview(null);
  };

  const buildManualAllocationPayload = () => Object.entries(manualAllocations)
    .map(([installmentId, amount]) => ({ installmentId, amount: Number(amount || 0) }))
    .filter((row) => row.amount > 0);

  const manualAllocationTotal = useMemo(
    () => roundMoney(Object.values(manualAllocations).reduce((sum, amount) => sum + Number(amount || 0), 0)),
    [manualAllocations]
  );

  const manualAllocationRows = useMemo(() => {
    if (!selectedParentFinance) return [];
    const targetStudentIds = form.studentIds.length > 0 ? new Set(form.studentIds) : null;
    return selectedParentFinance.students
      .filter((student) => !targetStudentIds || targetStudentIds.has(student.id))
      .flatMap((student) =>
        student.installments
          .filter((installment) => installment.balance > 0)
          .map((installment) => ({
            installmentId: installment.id,
            studentId: student.id,
            studentName: student.fullName,
            planName: student.planName,
            paymentOptionLabel: student.paymentOptionLabel,
            label: installment.label,
            dueDate: installment.dueDate,
            balance: installment.balance,
            amountDue: installment.amountDue,
            isOverdue: installment.isOverdue,
            status: installment.status
          }))
      )
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime());
  }, [form.studentIds, selectedParentFinance]);

  const setManualAllocationAmount = (installmentId: string, value: string) => {
    setManualAllocations((current) => ({ ...current, [installmentId]: value }));
    setTuitionPreview(null);
  };

  const manualAdvanceAmount = roundMoney(Math.max(amountNum - manualAllocationTotal, 0));
  const manualAllocationExceedsAmount = allocationMode === "MANUAL" && manualAllocationTotal > roundMoney(amountNum);

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

  const requestTuitionAllocationPreview = async () => api<TuitionEngineResponse>("/api/finance/tuition-engine/preview-allocation", {
    method: "POST",
    body: JSON.stringify({
      parentId: form.parentId,
      studentIds: form.studentIds,
      amount: amountNum,
      paymentOptionType: tuitionPlan,
      allocationMode,
      manualAllocations: allocationMode === "MANUAL" ? buildManualAllocationPayload() : []
    })
  });

  const previewTuitionAllocation = async () => {
    if (!form.parentId || amountNum <= 0) {
      setApiError("Choisissez un parent et entrez un montant avant la prévisualisation tuition.");
      return;
    }
    if (selectedParent && (selectedParent.students?.length ?? 0) > 0 && form.studentIds.length === 0) {
      setApiError("Sélectionnez au moins un enfant avant la prévisualisation tuition.");
      return;
    }
    setTuitionEngineBusy(true);
    setApiError(null);
    try {
      const preview = await requestTuitionAllocationPreview();
      setTuitionPreview(preview);
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
    if (form.status !== "COMPLETED") {
      setApiError("Le moteur de scolarité et la répartition manuelle s'appliquent uniquement aux paiements réglés. Utilisez le statut « Réglé » pour affecter les échéances.");
      return;
    }
    if (selectedParent && (selectedParent.students?.length ?? 0) > 0 && form.studentIds.length === 0) {
      setApiError("Sélectionnez au moins un enfant avant de confirmer le paiement de scolarité.");
      return;
    }
    if (allocationMode === "MANUAL" && !tuitionPreview) {
      setApiError("Prévisualisez d'abord la répartition automatique ou manuelle avant de confirmer le paiement de scolarité.");
      return;
    }
    if (allocationMode === "MANUAL" && manualAllocationTotal <= 0) {
      setApiError("Saisissez au moins une ligne dans la répartition manuelle avant de confirmer.");
      return;
    }
    if (allocationMode === "MANUAL" && manualAllocationTotal > roundMoney(amountNum)) {
      setApiError(`La répartition manuelle ne peut pas dépasser le montant reçu (${fmtUsd(amountNum)}). Total saisi : ${fmtUsd(manualAllocationTotal)}.`);
      return;
    }
    setTuitionEngineBusy(true);
    setSaving(true);
    setApiError(null);
    try {
      const confirmedPreview = await requestTuitionAllocationPreview();
      setTuitionPreview(confirmedPreview);
      const result = await api<TuitionEngineResponse>("/api/finance/tuition-engine/payments", {
        method: "POST",
        body: JSON.stringify({
          parentId: form.parentId,
          studentIds: form.studentIds,
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
        studentClassNames: Array.from(new Set(selectedStudents.map((student) => student.className).filter(Boolean))),
        reason: form.reason || `Tuition - ${TUITION_PLAN_OPTIONS.find((plan) => plan.value === tuitionPlan)?.label ?? tuitionPlan}`,
        amount: amountNum,
        amountWords: amountToWords(amountNum, lang as "fr" | "en"),
        method: form.method,
        status: form.status,
        bankTransferDetails: form.method === "BANK_TRANSFER" ? {
          bankName: form.bankName.trim(),
          referenceNumber: form.transferReference.trim(),
          transferDate: form.transferDate,
          senderAccountNumber: form.senderAccountNumber.trim(),
          beneficiaryAccountNumber: form.beneficiaryAccountNumber.trim(),
        } : null,
        tuitionAllocationSummary: buildReceiptAllocationSummary(result.allocationPreview, allocationMode)
      };
      setPayments((prev) => [record, ...prev]);
      setCurrentReceipt(record);
      setTuitionPreview(result);
      setNotificationStatus("Tuition allocation saved, alerts/audit log generated when required.");
      setPaymentDetailsDialogOpen(false);
      setView("receipt");
      setFieldErrors({});
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement tuition.");
    } finally {
      setSaving(false);
      setTuitionEngineBusy(false);
    }
  };

  const shouldUseTuitionEngineForFamilyPayment = Boolean(
    form.paymentScope === "TUITION"
    &&
    form.parentId
    && selectedParent
    && (selectedParent.students?.length ?? 0) > 0
    && form.status === "COMPLETED"
    && (
      form.reason.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("paiement scolaire")
      || getProductSearchTags(form.reason).some((tag) => ["frais scolaires", "arrieres"].includes(tag))
    )
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (form.paymentScope === "TUITION" && (tuitionPreview || shouldUseTuitionEngineForFamilyPayment)) {
      await confirmTuitionPayment();
      return;
    }
    setSaving(true);
    setApiError(null);

    const finalAmount = roundMoney(parseFloat(form.amount));
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
      studentClassNames: Array.from(new Set(selectedStudents.map((student) => student.className).filter(Boolean))),
      parentId: form.parentId || undefined,
      reason: form.reason.trim(),
      amount: finalAmount,
      amountWords: amountToWords(finalAmount, lang as "fr" | "en"),
      method: form.method,
      status: form.status,
      bankTransferDetails: form.method === "BANK_TRANSFER" ? {
        bankName: form.bankName.trim(),
        referenceNumber: form.transferReference.trim(),
        transferDate: form.transferDate,
        senderAccountNumber: form.senderAccountNumber.trim(),
        beneficiaryAccountNumber: form.beneficiaryAccountNumber.trim(),
      } : null,
    };

    try {
      const created = await api<{ payment: Partial<PaymentRecord> & { id: string }; notificationStatus?: { dashboard?: string; email?: string; sms?: string } }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          paymentCategory: form.paymentScope,
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
          bankTransferDetails: record.bankTransferDetails,
          notifyParent: true,
        }),
      });
      record.id = created?.payment?.id ?? record.id;
      record.paymentSubjectName = created?.payment?.paymentSubjectName ?? record.paymentSubjectName;
      record.studentNames = created?.payment?.studentNames ?? record.studentNames;
      record.studentClassNames = created?.payment?.studentClassNames ?? record.studentClassNames;
      record.parentFullName = created?.payment?.parentFullName ?? record.parentFullName;
      record.bankTransferDetails = created?.payment?.bankTransferDetails ?? record.bankTransferDetails;
      if (created?.notificationStatus) {
        setNotificationStatus(`${record.parentFullName} - Compte parent: ${created.notificationStatus.dashboard ?? "OPEN"} | Email: ${created.notificationStatus.email ?? "SKIPPED"} | SMS: ${created.notificationStatus.sms ?? "SKIPPED"}`);
      }
    } catch { /* Mode démo - reçu généré même sans base de données */ }

    setPayments((prev) => [record, ...prev]);
    setSaving(false);
    setCurrentReceipt(record);
    setPaymentDetailsDialogOpen(false);
    setView("receipt");
    setFieldErrors({});
  };

  const cancelPayment = async (payment: PaymentRecord) => {
    if (payment.status === "CANCELLED") return;
    const reason = window.prompt(`Motif d'annulation du paiement ${payment.transactionNumber}`, "Erreur de saisie ou paiement enregistre par erreur");
    if (reason === null) return;

    try {
      const result = await api<{ payment: Partial<PaymentRecord> & { id: string } }>(`/api/payments/${payment.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      setPayments((prev) => prev.map((item) => (
        item.id === payment.id
          ? { ...item, ...result.payment, status: "CANCELLED" }
          : item
      )));
      setApiError("");
      setNotificationStatus(`Paiement ${payment.transactionNumber} annulé. Les compteurs parent, élève et finance ont été recalculés.`);
      if (currentReceipt?.id === payment.id) {
        setCurrentReceipt((current) => current ? { ...current, ...result.payment, status: "CANCELLED" } : current);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Impossible d'annuler ce paiement.");
    }
  };

  const changeStatus = (id: string, status: PaymentRecord["status"]) =>
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const setPaymentScope = (scope: FormState["paymentScope"]) => {
    setForm((prev) => ({
      ...prev,
      paymentScope: scope,
      reason: scope === "SERVICE" && (!prev.reason.trim() || prev.reason === lastAutoReasonRef.current)
        ? "Abonnement bus scolaire"
        : prev.reason
    }));
    setTuitionPreview(null);
    setApiError(null);
    setFieldErrors((prev) => ({ ...prev, paymentScope: undefined, studentIds: undefined, reason: undefined }));
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
  const StatsBanner = ({ compact = false }: { compact?: boolean }) => (
    <div className={`grid grid-cols-2 md:grid-cols-4 ${compact ? "gap-3" : "gap-4"} mb-6`}>
      {[
        { label: "Total encaissé",   value: fmtUsd(stats.total),     color: "text-brand-300"   },
        { label: "Réglés",           value: fmtUsd(stats.completed), color: "text-emerald-300" },
        { label: "En attente",       value: fmtUsd(stats.pending),   color: "text-amber-300"   },
        { label: "Annules",          value: fmtUsd(stats.cancelled), color: "text-slate-300"   },
      ].map((s) => (
        <div key={s.label} className={`card ${compact ? "py-3 px-4" : "py-4 px-5"}`}>
          <p className="text-xs text-ink-dim uppercase tracking-wide mb-1">{s.label}</p>
          <p className={`font-mono ${compact ? "text-base" : "text-lg"} font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-ink-dim mt-0.5">USD</p>
        </div>
      ))}
    </div>
  );

  const NotificationSettingsPanel = ({ compact = false }: { compact?: boolean }) => (
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
            {compact && (
              <button
                type="button"
                onClick={() => setHistoryNotificationPanelOpen((current) => !current)}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:border-brand-300/30 hover:bg-brand-500/10"
              >
                {historyNotificationPanelOpen ? "Réduire" : "Gérer les parents"}
              </button>
            )}
          </div>
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t("paymentNotificationsTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-dim">{t("paymentNotificationsAdminSubtitle")}</p>
          <p className="mt-2 text-xs font-semibold text-cyan-200">{t("paymentNotificationsChannels")}</p>
          {compact && (
            <p className="mt-2 text-xs text-ink-dim">
              {parents.length} parent(s) configurables. Les réglages détaillés sont repliés pour alléger l'historique.
            </p>
          )}
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
          {parents.length > 0 && (!compact || historyNotificationPanelOpen) && (
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
            onClick={() => {
              setForm(EMPTY_FORM);
              setCurrentReceipt(null);
              setTuitionPreview(null);
              setPaymentDetailsDialogOpen(true);
              setView("form");
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-ink-dim hover:text-white hover:border-slate-400 transition-all text-sm font-semibold"
          >
            + {t("newPaymentBtn")}
          </button>
        </div>

        <ReceiptA5Preview receipt={r} />

        {receiptPrintingId === r.id && (
          <div className="rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-100">
            Préparation du reçu officiel pour impression...
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => triggerReceiptPrint(r)}
            disabled={receiptPrintingId === r.id}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20"
          >
            <PrintIcon className="w-5 h-5" /> {receiptPrintingId === r.id ? "Préparation..." : t("printPdf")}
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
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <StatsBanner compact />
          <div className="card flex flex-col justify-between gap-4 border border-brand-500/20 bg-brand-500/10">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Actions rapides</p>
              <h2 className="mt-2 font-display text-xl font-bold text-white">Exporter ou imprimer sans descendre en bas</h2>
              <p className="mt-2 text-sm text-ink-dim">La liste filtrée courante reste disponible ici avec le total réellement réglé.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Liste filtrée</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{filteredPayments.length}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Montant réglé</p>
                <p className="mt-1 font-mono text-lg font-bold text-brand-200">{fmtUsd(filteredPayments.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + p.amount, 0))}</p>
              </div>
              <button
                onClick={triggerHistoryPrint}
                disabled={historyPrintBusy}
                title="Ouvre la boîte d'impression pour enregistrer la liste filtrée en PDF"
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-brand-700 active:scale-95"
              >
                <PrintIcon /> {historyPrintBusy ? "Préparation..." : "PDF / Imprimer"}
              </button>
              <button
                onClick={triggerHistoryExcel}
                disabled={historyExcelBusy}
                title="Exporte exactement la liste filtrée courante au format Excel"
                className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-200 transition-all hover:bg-emerald-500/20 active:scale-95"
              >
                <ExcelIcon /> {historyExcelBusy ? "Export..." : "Exporter Excel"}
              </button>
            </div>
          </div>
        </div>
        <NotificationSettingsPanel compact />

        {/* Filtres */}
        <div className="card">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(5,minmax(118px,1fr))] xl:items-start">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Recherche</label>
              <SearchField
                placeholder="Ex: Grade 5 paye, parent Kabongo, frais scolaires..."
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
                Recherche intelligente par élève, parent, classe, statut payé/non payé, numéro, motif ou produit scolaire.
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
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Classe</label>
              <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="w-full">
                <option value="ALL">Toutes les classes</option>
                {historyClassOptions.map((className) => <option key={className} value={className}>{className}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Mode de paiement</label>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="w-full">
                <option value="ALL">Tous les modes</option>
                {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Du</label>
              <input
                type="date"
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-dim block mb-2">Au</label>
              <input
                type="date"
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
                className="w-full"
              />
              {(historyDateFrom || historyDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryDateFrom("");
                    setHistoryDateTo("");
                  }}
                  className="mt-2 text-xs font-semibold text-brand-200 hover:text-white"
                >
                  Effacer la periode
                </button>
              )}
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
                    <td className="px-3 py-2.5 first:pl-0 font-mono text-xs text-brand-300">{p.transactionNumber}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-dim whitespace-nowrap">
                      {p.date.split(",").slice(0, 2).join(",")}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="min-w-[190px] max-w-[250px]">
                        <p className="font-semibold text-white">{getPaymentSubjectName(p)}</p>
                        {getPaymentParentCaption(p) ? <p className="mt-0.5 text-xs text-ink-dim">Parent: {getPaymentParentCaption(p)}</p> : null}
                        {p.tuitionAllocationSummary && (() => {
                          const allocationSnapshot = buildReceiptAllocationSnapshot(p.tuitionAllocationSummary, {
                            maxVisibleChildren: 1,
                            maxVisibleMetrics: 1
                          });
                          const leadChild = allocationSnapshot.perChild[0];
                          return (
                            <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-50">
                              <p className="font-black uppercase tracking-[0.12em]">{allocationSnapshot.modeLabel}</p>
                              {leadChild ? <p className="mt-1">{leadChild.studentName}: imputé {fmtUsd(leadChild.allocated)} · solde {fmtUsd(leadChild.remaining)}</p> : null}
                              {allocationSnapshot.overflowChildCount > 0 && (
                                <p className="mt-1 text-emerald-100/80">+ {allocationSnapshot.overflowChildCount} autre(s) dossier(s)</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[150px] truncate text-ink-dim" title={p.reason}>{p.reason}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-dim">{p.method.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-emerald-300">
                      $ {formatMoney(p.amount)}
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2.5 last:pr-0">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          title="Imprimer le reçu"
                          onClick={() => {
                            triggerReceiptPrint(p);
                          }}
                          disabled={receiptPrintingId === p.id}
                          className={`p-1.5 rounded transition-colors ${receiptPrintingId === p.id ? "bg-brand-600/35 text-white" : "bg-brand-600/20 text-brand-300 hover:bg-brand-600/40"}`}
                        >
                          <PrintIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Exporter le reçu en Excel"
                          onClick={() => exportReceiptExcel(p)}
                          className="p-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 transition-colors"
                        >
                          <ExcelIcon className="w-3.5 h-3.5" />
                        </button>
                        <select
                          value={p.status}
                          onChange={(e) => changeStatus(p.id, e.target.value as PaymentRecord["status"])}
                          disabled={p.status === "CANCELLED"}
                          className="text-xs rounded px-1.5 py-1 bg-slate-700 border-slate-600 text-white"
                          title="Changer le statut"
                        >
                          {p.status === "CANCELLED" ? <option value="CANCELLED">Annule</option> : null}
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <button
                          title="Annuler ce paiement et recalculer les compteurs"
                          onClick={() => void cancelPayment(p)}
                          disabled={p.status === "CANCELLED"}
                          className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
                    $ {formatMoney(filteredPayments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------
     VUE ÉTAT DES PAIEMENTS
  ------------------------------------------------------------------------ */
  if (view === "report") {
    const normalizedReportSearch = normalizeSearchText(reportSearch);
    const reportPayments = reportSearch
      ? payments.filter((p) => normalizedReportSearch.split(/\s+/).every((token) => buildPaymentSearchText(p).includes(token)))
      : payments;

    const bySubject = reportPayments.reduce<Record<string, PaymentRecord[]>>((acc, p) => {
      const key = getPaymentSubjectName(p);
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    const reportTotal = reportPayments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0);

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
              Filtrer par élève (laisser vide = état général)
            </label>
            <input
              type="text"
              placeholder="Nom de l'élève..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <button
            onClick={() => printHtml(buildReportHtml(reportPayments))}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-95 shadow-lg shadow-brand-500/20 whitespace-nowrap"
          >
            <PrintIcon className="w-5 h-5" />
            {reportSearch ? `Imprimer l'état de ${reportSearch}` : "Imprimer l'état général"}
          </button>
          <button
            onClick={() => exportPaymentsExcel(`etat-paiements-${(reportSearch || "general").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}`, reportPayments)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 font-bold transition-all active:scale-95 whitespace-nowrap"
          >
            <ExcelIcon className="w-5 h-5" />
            {reportSearch ? `Exporter ${reportSearch} en Excel` : "Exporter l'état général en Excel"}
          </button>
        </div>

        {/* Cartes par élève */}
        {Object.keys(bySubject).length === 0 ? (
          <div className="card text-center py-12 text-ink-dim">Aucun paiement enregistré.</div>
        ) : (
          Object.entries(bySubject).map(([subject, recs]) => {
            const parentTotal  = recs.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
            const completedAmt = recs.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount, 0);
            const pendingAmt   = recs.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
            const failedAmt    = recs.filter((r) => r.status === "FAILED").reduce((s, r) => s + r.amount, 0);
            const parentCaptions = Array.from(new Set(recs.map((r) => getPaymentParentCaption(r)).filter(Boolean)));

            return (
              <div key={subject} className="card">
                {/* En-tete élève */}
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
                    <p className="font-mono font-bold text-xl text-brand-300">$ {formatMoney(parentTotal)}</p>
                  </div>
                </div>

                {/* Mini stats parent */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">Réglé</p>
                    <p className="font-mono text-sm font-bold text-emerald-300">$ {formatMoney(completedAmt)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">En attente</p>
                    <p className="font-mono text-sm font-bold text-amber-300">$ {formatMoney(pendingAmt)}</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <p className="text-xs text-ink-dim mb-1">Échoués</p>
                    <p className="font-mono text-sm font-bold text-red-300">$ {formatMoney(failedAmt)}</p>
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
                          <td className="py-2.5 px-2 font-mono font-bold text-emerald-300">$ {formatMoney(r.amount)}</td>
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
                              title="Exporter le reçu en Excel"
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
                        <td className="py-3 font-mono font-bold text-brand-300">$ {formatMoney(parentTotal)}</td>
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
              <p className="font-mono text-2xl font-bold text-brand-300">$ {formatMoney(reportTotal)}</p>
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

      <div className="card flex flex-col gap-4 border-brand-500/20 bg-brand-500/5 animate-fadeInUp sm:flex-row sm:items-center sm:justify-between max-w-7xl max-h-[98vh] w-full">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-200">{t("paymentDetails")}</p>
          <h2 className="mt-2 font-display text-xl font-bold text-white">{t("newPaymentBtn")}</h2>
          <p className="mt-1 text-sm text-ink-dim">Le formulaire de paiement s'ouvre dans une boîte dédiée au centre de l'écran.</p>
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
        <div className="edupay-payment-modal-backdrop edupay-scrollbar fixed inset-0 z-[999] grid place-items-center overflow-y-auto px-2 py-4">
          <div className="edupay-payment-modal-panel edupay-scrollbar w-full max-w-[98vw] max-h-[95vh] min-h-[600px] min-w-[900px] overflow-y-auto p-8 sm:p-10">
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
              <div className="space-y-2">
                <input
                  type="search"
                  value={parentLookupQuery}
                  onChange={(event) => setParentLookupQuery(event.target.value)}
                  placeholder="Tapez le nom du parent ou d'un enfant"
                  className="w-full"
                />
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/50 p-2">
                  {parentLookupResults.length > 0 ? parentLookupResults.map(({ parent, matchedStudents }) => {
                    const active = parent.id === form.parentId;
                    const displayedStudents = matchedStudents.length > 0
                      ? matchedStudents
                      : (parent.students ?? []).slice(0, 3);
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => selectFamilyForPayment(parent, matchedStudents)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-brand-500 bg-brand-500/15 text-white"
                            : "border-slate-700 bg-slate-900/70 text-ink-dim hover:border-brand-400/50 hover:text-white"
                        }`}
                      >
                        <span className="flex flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{parent.fullName}</span>
                            <span className="mt-1 block text-xs">
                              {[parent.phone, parent.email].filter(Boolean).join(" - ") || "Parent inscrit"}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                            {active ? "Cible" : "Choisir"}
                          </span>
                        </span>
                        {displayedStudents.length > 0 && (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {displayedStudents.map((student) => (
                              <span
                                key={student.id}
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                  matchedStudents.some((matched) => matched.id === student.id)
                                    ? "bg-emerald-500/20 text-emerald-100"
                                    : "bg-slate-800 text-ink-dim"
                                }`}
                              >
                                {student.fullName} - {student.className}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  }) : (
                    <p className="px-3 py-2 text-xs font-semibold text-ink-dim">
                      Aucun parent trouve pour cette recherche.
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-ink-dim">
                Cherchez par parent ou par enfant; choisir une famille remplit le parent cible et sélectionne les enfants correspondants.
              </p>
              {fieldErrors.parentId && <p className="text-xs text-danger">{fieldErrors.parentId}</p>}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Type de paiement</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {([
                  { value: "TUITION" as const, title: "Scolarité / tuition plan", detail: "Plans officiels, arrangement spécial, répartition sur échéances et suivi de dette." },
                  { value: "SERVICE" as const, title: "Service ou autre frais", detail: "Bus scolaire, uniformes, cantine, documents, activités: reçu officiel sans toucher au plan tuition." }
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentScope(option.value)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      form.paymentScope === option.value
                        ? "border-brand-300 bg-brand-500/20 text-white"
                        : "border-slate-700 bg-slate-900/60 text-ink-dim hover:border-brand-400/50 hover:text-white"
                    }`}
                  >
                    <span className="block text-sm font-black">{option.title}</span>
                    <span className="mt-2 block text-xs leading-5">{option.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedParent && (selectedParent.students?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">
                    Eleves concernes {form.paymentScope === "TUITION" && <span className="text-danger">*</span>}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, studentIds: selectedParent.students?.map((student) => student.id) ?? [] }));
                        setFieldErrors((prev) => ({ ...prev, studentIds: undefined }));
                        setTuitionPreview(null);
                      }}
                      className="rounded-lg border border-brand-500/30 px-2.5 py-1 text-[11px] font-bold text-brand-200 hover:bg-brand-500/10"
                    >
                      Tous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, studentIds: [] }));
                        setTuitionPreview(null);
                      }}
                      className="rounded-lg border border-slate-600 px-2.5 py-1 text-[11px] font-bold text-ink-dim hover:text-white"
                    >
                      Aucun
                    </button>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-xs font-semibold text-ink-dim">
                    {form.studentIds.length} sur {selectedParent.students?.length ?? 0} enfant(s) sélectionné(s). Le paiement, les échéances, la répartition manuelle et le reçu seront limités à cette sélection.
                  </p>
                  {form.paymentScope === "SERVICE" && (
                    <p className="text-xs font-semibold text-amber-100/80">
                      Pour un service, la sélection sert seulement à préciser le reçu. Le plan tuition, les échéances et la dette restent inchangés.
                    </p>
                  )}
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
                        <span className="text-xs font-bold uppercase tracking-wide">{active ? "Sélectionné" : "Choisir"}</span>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.studentIds && <p className="text-xs text-danger">{fieldErrors.studentIds}</p>}
              </div>
            )}

            {form.paymentScope === "TUITION" && selectedParentFinance && (
              <div className="lg:col-span-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Contexte financier</p>
                    <h3 className="mt-1 text-lg font-bold text-white">{selectedParentFinance.profile.activeTuitionPlan}</h3>
                    <p className="mt-1 text-sm text-cyan-100">
                      Paid {fmtUsd(selectedParentFinance.profile.totalPaid)} · Debt {fmtUsd(selectedParentFinance.profile.totalDebt)} · Reductions {fmtUsd(selectedParentFinance.profile.totalReduction)}
                    </p>
                    <p className="mt-1 text-xs text-cyan-100/85">
                      Couverture {selectedParentFinance.profile.completionRate.toFixed(1)} % · {selectedParentFinance.profile.overdueInstallments} échéance(s) en retard.
                    </p>
                  </div>
                  {financeLoading && <p className="text-xs font-semibold text-cyan-100">Actualisation du profil finance...</p>}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {financeInstallmentSuggestions.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 text-sm text-cyan-100">Aucune échéance ouverte pour la sélection actuelle.</div>
                  ) : financeInstallmentSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.studentId}-${suggestion.label}-${suggestion.dueDate}`}
                      type="button"
                      onClick={() => {
                        setField("amount", formatMoney(suggestion.balance));
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
                        <span>Échéance {new Date(suggestion.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</span>
                        <span className="font-mono font-bold text-white">{fmtUsd(suggestion.balance)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.paymentScope === "TUITION" && selectedParent && (
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
                      disabled={tuitionEngineBusy || !form.parentId || amountNum <= 0 || ((selectedParent?.students?.length ?? 0) > 0 && form.studentIds.length === 0)}
                      className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {tuitionEngineBusy ? "Calcul..." : allocationMode === "MANUAL" && tuitionPreview ? "Recalculer manuellement" : "Prévisualiser la répartition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmTuitionPayment()}
                      disabled={tuitionEngineBusy || !form.parentId || amountNum <= 0 || !tuitionPreview || ((selectedParent?.students?.length ?? 0) > 0 && form.studentIds.length === 0)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Confirmer le paiement tuition
                    </button>
                    {!tuitionPreview && (
                      <p className="w-full text-xs font-semibold text-emerald-100/80">
                        La confirmation est active seulement après la prévisualisation, pour que le financier voie la répartition avant l'enregistrement.
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

                {allocationMode === "MANUAL" && (
                  <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">Répartition manuelle exacte</p>
                        <p className="mt-1 text-sm font-semibold text-amber-50">
                          Le financier saisit le montant exact à appliquer sur chaque enfant et chaque échéance ouverte.
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200/25 bg-slate-950/30 px-3 py-2 text-right text-xs">
                        <p className={`font-mono font-black ${manualAllocationExceedsAmount ? "text-red-200" : "text-white"}`}>
                          Saisi {fmtUsd(manualAllocationTotal)} / {fmtUsd(amountNum)}
                        </p>
                        <p className="mt-1 font-mono text-emerald-100">Avance {fmtUsd(manualAdvanceAmount)}</p>
                      </div>
                    </div>

                    {manualAllocationExceedsAmount && (
                      <div className="mt-3 rounded-lg border border-red-300/35 bg-red-400/10 p-3 text-xs font-bold text-red-100">
                        Le total manuel dépasse le montant reçu. Corrigez les champs avant de confirmer.
                      </div>
                    )}

                    {manualAllocationRows.length > 0 ? (
                      <div className="edupay-scrollbar mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                        {manualAllocationRows.map((row) => (
                          <div key={row.installmentId} className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-3 md:grid-cols-[1fr_170px] md:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-white">{row.studentName}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${row.isOverdue ? "bg-red-500/15 text-red-200" : "bg-cyan-500/15 text-cyan-100"}`}>
                                  {row.isOverdue ? "Retard" : row.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-ink-dim">
                                {row.label} · {new Date(row.dueDate).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")} · {row.planName} · {row.paymentOptionLabel}
                              </p>
                              <p className="mt-1 text-xs font-mono text-amber-100">
                                Solde ouvert {fmtUsd(row.balance)} sur {fmtUsd(row.amountDue)}
                              </p>
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-amber-100">
                                Montant à allouer
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={row.balance}
                                value={manualAllocations[row.installmentId] ?? ""}
                                onChange={(event) => setManualAllocationAmount(row.installmentId, event.target.value)}
                                placeholder="0.00"
                                className="w-full"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/30 p-3 text-sm font-semibold text-ink-dim">
                        Aucune échéance ouverte disponible pour les enfants sélectionnés.
                      </div>
                    )}
                  </div>
                )}

                {tuitionPreview && (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Calcul de scolarité</p>
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
                              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100">Comment le système a réparti</p>
                              <ol className="mt-2 list-decimal space-y-1 pl-4">
                                {buildAllocationNarrative(tuitionPreview.allocationPreview, allocationMode).map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {allocationMode === "MANUAL" && (
                            <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs font-semibold text-amber-50">
                              <p>Les montants saisis dans la section manuelle ci-dessus sont recalculés ici avant enregistrement. Si le total est inférieur au montant reçu, le reste sera conservé en avance.</p>
                              <p className="mt-2 font-mono">Saisi {fmtUsd(manualAllocationTotal)} / {fmtUsd(amountNum)}</p>
                            </div>
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
                                    <p className="mt-1 text-cyan-100">D? avant paiement {fmtUsd(summary.before)}</p>
                                    <p className="mt-1 text-emerald-100">Appliqu? {fmtUsd(summary.allocated)}</p>
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
                                <p className="font-mono text-emerald-100">Appliqu? {fmtUsd(line.allocated)}</p>
                                <p className="font-mono text-ink-dim">Reste {fmtUsd(line.outstandingAfter)}</p>
                              </div>
                            </div>
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
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-200">Identité du paiement</p>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-dim">Paiement pour</p>
                  <p className="mt-1 truncate font-display text-2xl font-bold text-white">
                    {selectedStudentDisplayName || "Sélectionnez l'élève concerné"}
                  </p>
                  <p className="mt-2 text-sm text-ink-dim">
                    {form.parentFullName.trim()
                      ? `Parent concern? : ${form.parentFullName.trim()}`
                      : "Le parent lie au paiement apparaîtra ici comme information secondaire."}
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
              placeholder={form.paymentScope === "SERVICE" ? "Ex. Abonnement bus scolaire - juin" : "Ex. Frais scolaires 1er trimestre 2026"}
              className={`w-full ${fieldErrors.reason ? "border-danger" : ""}`}
            />
            <datalist id="payment-reason-suggestions">
              {activePaymentReasonSuggestions.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2 pt-1">
              {activePaymentReasonSuggestions.slice(0, 8).map((reason) => (
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

          {form.method === "BANK_TRANSFER" ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Banque</label>
                <input value={form.bankName} onChange={(e) => setField("bankName", e.target.value)} className="w-full" placeholder="Nom de la banque" />
                {fieldErrors.bankName && <p className="text-xs text-danger">{fieldErrors.bankName}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Référence bancaire</label>
                <input value={form.transferReference} onChange={(e) => setField("transferReference", e.target.value)} className="w-full" placeholder="Référence du virement" />
                {fieldErrors.transferReference && <p className="text-xs text-danger">{fieldErrors.transferReference}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Date du virement</label>
                <input type="date" value={form.transferDate} onChange={(e) => setField("transferDate", e.target.value)} className="w-full" />
                {fieldErrors.transferDate && <p className="text-xs text-danger">{fieldErrors.transferDate}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Compte émetteur</label>
                <input value={form.senderAccountNumber} onChange={(e) => setField("senderAccountNumber", e.target.value)} className="w-full" placeholder="Compte débité" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Compte bénéficiaire</label>
                <input value={form.beneficiaryAccountNumber} onChange={(e) => setField("beneficiaryAccountNumber", e.target.value)} className="w-full" placeholder="Compte crédité" />
                {fieldErrors.beneficiaryAccountNumber && <p className="text-xs text-danger">{fieldErrors.beneficiaryAccountNumber}</p>}
              </div>
            </div>
          ) : null}

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
