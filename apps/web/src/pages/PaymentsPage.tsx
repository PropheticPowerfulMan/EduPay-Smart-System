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

