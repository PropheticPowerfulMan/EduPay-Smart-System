import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useI18n } from "../i18n";
import { api } from "../services/api";

const schema = z.object({
  parentId: z.string().min(1),
  studentIds: z.string().min(1),
  reason: z.string().min(3),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "AIRTEL_MONEY", "MPESA", "ORANGE_MONEY"]) 
});

type Input = z.infer<typeof schema>;

type ReceiptData = {
  number: string;
  date: string;
  parentId: string;
  reason: string;
  method: string;
  amount: number;
  amountWords: string;
  paymentId: string;
};

function numberToWordsEn(n: number): string {
  const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return units[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${tens[t]}-${units[u]}` : tens[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest ? `${units[h]} hundred ${numberToWordsEn(rest)}` : `${units[h]} hundred`;
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest ? `${numberToWordsEn(k)} thousand ${numberToWordsEn(rest)}` : `${numberToWordsEn(k)} thousand`;
  }
  const m = Math.floor(n / 1000000);
  const rest = n % 1000000;
  return rest ? `${numberToWordsEn(m)} million ${numberToWordsEn(rest)}` : `${numberToWordsEn(m)} million`;
}

function numberToWordsFr(n: number): string {
  const units = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
  const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];
  if (n < 17) return units[n];
  if (n < 20) return `dix-${units[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return tens[t];
    if (u === 1) return `${tens[t]} et un`;
    return `${tens[t]}-${units[u]}`;
  }
  if (n < 80) return `soixante-${numberToWordsFr(n - 60)}`;
  if (n < 100) return n === 80 ? "quatre-vingts" : `quatre-vingt-${numberToWordsFr(n - 80)}`;
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const head = h === 1 ? "cent" : `${units[h]} cent`;
    return rest ? `${head} ${numberToWordsFr(rest)}` : head;
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = k === 1 ? "mille" : `${numberToWordsFr(k)} mille`;
    return rest ? `${head} ${numberToWordsFr(rest)}` : head;
  }
  const m = Math.floor(n / 1000000);
  const rest = n % 1000000;
  const head = m === 1 ? "un million" : `${numberToWordsFr(m)} millions`;
  return rest ? `${head} ${numberToWordsFr(rest)}` : head;
}

export function PaymentsPage() {
  const { t, lang } = useI18n();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Input>({
    resolver: zodResolver(schema)
  });

  const amount = Number(watch("amount") || 0);
  const amountWords = useMemo(() => {
    const normalized = Math.max(0, Math.floor(amount));
    const words = lang === "fr" ? numberToWordsFr(normalized) : numberToWordsEn(normalized);
    return `${words} ${t("currencyWords")}`;
  }, [amount, lang, t]);

  const onSubmit = async (values: Input) => {
    if (!values.parentId || !values.reason || values.amount <= 0) {
      throw new Error(t("missingPaymentFields"));
    }

    const payload = {
      ...values,
      studentIds: values.studentIds.split(",").map((s) => s.trim()),
      status: "COMPLETED"
    };
    const created = await api<{ payment: { id: string } }>("/api/payments", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const now = new Date();
    setReceipt({
      number: `RCPT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000 + 1000)}`,
      date: now.toLocaleString(lang === "fr" ? "fr-FR" : "en-US"),
      parentId: values.parentId,
      reason: values.reason,
      method: values.method,
      amount: values.amount,
      amountWords,
      paymentId: created.payment.id
    });
  };

  const printReceipt = () => {
    if (!receipt) return;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: 'Poppins', Arial, sans-serif; padding: 24px; color: #0f172a; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; }
        .box { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
        .title { font-size: 28px; font-weight: bold; margin: 0; }
        .row { margin: 12px 0; display: flex; justify-content: space-between; }
        .label { font-weight: 600; color: #475569; }
        .value { color: #0f172a; }
        .sig { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .sig-box { min-height: 120px; border: 2px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: flex-end; justify-content: center; padding: 12px; color: #94a3b8; font-weight: 600; font-size: 14px; }
        .footer { margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px; }
      </style></head><body>
      <div class="container">
        <div class="box">
          <div class="header">
            <h2 class="title">💳 ${t("receiptTitle")}</h2>
          </div>
          <div class="row">
            <span class="label">${t("receiptNumber")}:</span>
            <span class="value">${receipt.number}</span>
          </div>
          <div class="row">
            <span class="label">${t("date")}:</span>
            <span class="value">${receipt.date}</span>
          </div>
          <div class="row">
            <span class="label">${t("parentId")}:</span>
            <span class="value">${receipt.parentId}</span>
          </div>
          <div class="row">
            <span class="label">${t("reason")}:</span>
            <span class="value">${receipt.reason}</span>
          </div>
          <div class="row">
            <span class="label">${t("method")}:</span>
            <span class="value">${receipt.method}</span>
          </div>
          <div class="row">
            <span class="label">${t("amount")}:</span>
            <span class="value"><strong>${receipt.amount.toLocaleString()} FC</strong></span>
          </div>
          <div class="row">
            <span class="label">${t("amountInWords")}:</span>
            <span class="value"><strong>${receipt.amountWords}</strong></span>
          </div>
          <div class="sig">
            <div class="sig-box">${t("signature")}</div>
            <div class="sig-box">${t("schoolStamp")}</div>
          </div>
          <div class="footer">✓ This receipt has been officially generated</div>
        </div>
      </div>
      </body></html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const downloadReceiptPng = () => {
    if (!receipt) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1550;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Header gradient (simulated)
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(0, 0, canvas.width, 180);
    ctx.fillStyle = "#818cf8";
    ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, 180);
    
    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px 'Poppins', Arial";
    ctx.fillText("💳 " + t("receiptTitle"), 50, 110);

    // Content
    ctx.fillStyle = "#0f172a";
    ctx.font = "24px Arial";
    const rows = [
      [`${t("receiptNumber")}:`, receipt.number],
      [`${t("date")}:`, receipt.date],
      [`${t("parentId")}:`, receipt.parentId],
      [`${t("reason")}:`, receipt.reason],
      [`${t("method")}:`, receipt.method],
      [`${t("amount")}:`, `${receipt.amount.toLocaleString()} FC`],
      [`${t("amountInWords")}:`, receipt.amountWords]
    ];
    
    let y = 250;
    ctx.font = "20px Arial";
    rows.forEach(([label, value]) => {
      ctx.fillStyle = "#475569";
      ctx.fillText(label, 50, y);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px Arial";
      ctx.fillText(value, 550, y);
      ctx.font = "20px Arial";
      y += 60;
    });

    // Signature boxes
    ctx.strokeStyle = "#cbd5e1";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 900, 520, 280);
    ctx.strokeRect(630, 900, 520, 280);
    ctx.setLineDash([]);
    
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 22px Arial";
    ctx.fillText(t("signature"), 250, 1150);
    ctx.fillText(t("schoolStamp"), 850, 1150);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${receipt.number}.png`;
    link.click();
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("newPayment")}</h1>
        <p className="text-ink-dim mt-2">{t("receiptAvailable")}</p>
      </div>

      {/* Payment Form */}
      <div className="card animate-fadeInUp">
        <h2 className="font-display text-xl font-bold text-white mb-6">{t("paymentDetails")}</h2>
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Parent ID */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-dim">{t("parentId")}</label>
              <input {...register("parentId")} placeholder={t("parentId")} className="w-full" />
              {errors.parentId && <p className="text-xs text-danger">{errors.parentId.message}</p>}
            </div>

            {/* Student IDs */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-dim">{t("studentIds")}</label>
              <input {...register("studentIds")} placeholder={t("studentIds")} className="w-full" />
              {errors.studentIds && <p className="text-xs text-danger">{errors.studentIds.message}</p>}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-dim">{t("reason")}</label>
              <input {...register("reason")} placeholder={t("reason")} className="w-full" />
              {errors.reason && <p className="text-xs text-danger">{errors.reason.message}</p>}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-dim">{t("amount")}</label>
              <input {...register("amount")} type="number" placeholder={t("amount")} className="w-full" />
              {errors.amount && <p className="text-xs text-danger">{errors.amount.message}</p>}
            </div>

            {/* Method */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-dim">{t("method")}</label>
              <select {...register("method")} className="w-full">
                <option value="CASH">💰 Cash</option>
                <option value="AIRTEL_MONEY">📱 Airtel Money</option>
                <option value="MPESA">📲 M-Pesa</option>
                <option value="ORANGE_MONEY">🟠 Orange Money</option>
              </select>
            </div>

            {/* Submit */}
            <div className="flex items-end pt-2">
              <button 
                disabled={isSubmitting} 
                type="submit"
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {t("processing")}
                  </div>
                ) : (
                  t("save")
                )}
              </button>
            </div>
          </div>

          {/* Amount in Words Display */}
          <div className="p-4 rounded-lg bg-brand-500/10 border border-brand-500/30">
            <p className="text-sm text-ink-dim mb-2">{t("amountInWords")}</p>
            <p className="font-display text-lg font-bold text-brand-300">{amountWords}</p>
          </div>

          {errors.root && <p className="text-sm text-danger">{errors.root.message}</p>}
        </form>
      </div>

      {/* Receipt */}
      {receipt && (
        <div className="card animate-fadeInUp space-y-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">✅</div>
            <div>
              <h3 className="font-display text-xl font-bold text-white">{t("receiptTitle")}</h3>
              <p className="text-sm text-ink-dim">{receipt.number}</p>
            </div>
          </div>

          {/* Receipt Details */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("receiptNumber")}</p>
                <p className="font-semibold text-white">{receipt.number}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("date")}</p>
                <p className="font-semibold text-white">{receipt.date}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("parentId")}</p>
                <p className="font-semibold text-white">{receipt.parentId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("reason")}</p>
                <p className="font-semibold text-white">{receipt.reason}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("method")}</p>
                <p className="font-semibold text-white">{receipt.method}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("amount")}</p>
                <p className="font-display text-2xl font-bold text-brand-300">{receipt.amount.toLocaleString()} FC</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink-dim">{t("amountInWords")}</p>
                <p className="font-semibold text-emerald-400 text-sm">{receipt.amountWords}</p>
              </div>
            </div>
          </div>

          {/* Signature zones */}
          <div className="grid gap-4 md:grid-cols-2 pt-4 border-t border-slate-700/50">
            <div className="min-h-32 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center">
              <p className="text-sm text-ink-dim font-medium">{t("signature")}</p>
            </div>
            <div className="min-h-32 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center">
              <p className="text-sm text-ink-dim font-medium">{t("schoolStamp")}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-700/50">
            <button 
              onClick={printReceipt} 
              className="px-6 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-all duration-300"
            >
              🖨️ {t("printReceipt")}
            </button>
            <button 
              onClick={downloadReceiptPng} 
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all duration-300"
            >
              📥 {t("downloadPng")}
            </button>
            <a 
              href={`/api/payments/${receipt.paymentId}/receipt/pdf`} 
              className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all duration-300 inline-block"
            >
              📄 {t("downloadPdf")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
