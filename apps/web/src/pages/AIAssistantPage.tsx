import { useState } from "react";
import { Bot, Lightbulb, MessageSquareText, Sparkles, Zap } from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type AssistantResponse = {
  answer: string;
  suggestions: string[];
};

type Overview = {
  totalRevenue: number;
  monthlyRevenue: number;
  paymentSuccessRate: number;
  outstandingDebt: number;
};

type Student = {
  annualFee?: number;
};

type Parent = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  students?: Student[];
};

type Payment = {
  id: string;
  parentId?: string;
  parentFullName?: string;
  amount: number;
  status: string;
  createdAt?: string;
  date?: string;
};

type AssistantContext = {
  overview: Overview | null;
  parents: Parent[];
  payments: Payment[];
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseDate(payment: Payment) {
  const raw = payment.createdAt ?? payment.date;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function loadAssistantContext(): Promise<AssistantContext> {
  const [overview, parents, payments] = await Promise.all([
    api<Overview>("/api/analytics/overview").catch(() => null),
    api<Parent[]>("/api/parents").catch(() => []),
    api<Payment[]>("/api/payments").catch(() => [])
  ]);

  return {
    overview,
    parents,
    payments: payments.map((payment) => ({
      ...payment,
      amount: asNumber(payment.amount),
      status: payment.status ?? "COMPLETED"
    }))
  };
}

function buildInsights(context: AssistantContext) {
  const completed = context.payments.filter((payment) => payment.status === "COMPLETED");
  const pending = context.payments.filter((payment) => payment.status === "PENDING");
  const failed = context.payments.filter((payment) => payment.status === "FAILED");
  const revenue = completed.reduce((sum, payment) => sum + payment.amount, 0) || asNumber(context.overview?.totalRevenue);
  const pendingAmount = pending.reduce((sum, payment) => sum + payment.amount, 0);
  const expected = context.parents.reduce(
    (sum, parent) => sum + (parent.students ?? []).reduce((studentSum, student) => studentSum + asNumber(student.annualFee), 0),
    0
  );
  const outstandingDebt = Math.max(asNumber(context.overview?.outstandingDebt), expected - revenue, pendingAmount, 0);
  const successRate = context.payments.length
    ? (completed.length / context.payments.length) * 100
    : asNumber(context.overview?.paymentSuccessRate);

  const paidByParent = new Map<string, number>();
  for (const payment of completed) {
    for (const key of [payment.parentId, normalize(payment.parentFullName)].filter(Boolean) as string[]) {
      paidByParent.set(key, (paidByParent.get(key) ?? 0) + payment.amount);
    }
  }

  const parentsWithDebt = context.parents
    .map((parent) => {
      const expectedForParent = (parent.students ?? []).reduce((sum, student) => sum + asNumber(student.annualFee), 0);
      const paid = (paidByParent.get(parent.id) ?? 0) + (paidByParent.get(normalize(parent.fullName)) ?? 0);
      return {
        id: parent.id,
        name: parent.fullName,
        email: parent.email,
        phone: parent.phone,
        debt: Math.max(expectedForParent - paid, 0)
      };
    })
    .filter((parent) => parent.debt > 0)
    .sort((a, b) => b.debt - a.debt);

  const monthly = new Map<string, number>();
  for (const payment of completed) {
    const date = parseDate(payment);
    const key = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    monthly.set(key, (monthly.get(key) ?? 0) + payment.amount);
  }
  const bestMonth = [...monthly.entries()].sort((a, b) => b[1] - a[1])[0];

  return { completed, pending, failed, revenue, pendingAmount, outstandingDebt, successRate, parentsWithDebt, bestMonth };
}

function localAssistantReply(query: string, lang: "fr" | "en", context: AssistantContext): AssistantResponse {
  const q = normalize(query);
  const insights = buildInsights(context);
  const topParent = insights.parentsWithDebt[0];

  if (q.includes("impay") || q.includes("non pay") || q.includes("retard") || q.includes("unpaid") || q.includes("debt")) {
    return lang === "fr"
      ? {
          answer: topParent
            ? `${insights.parentsWithDebt.length} parent(s) présentent un solde restant. La priorité est ${topParent.name} avec ${USD.format(topParent.debt)} à régulariser. Dette estimée globale : ${USD.format(insights.outstandingDebt)}.`
            : `Aucun parent en retard net n'est détecté avec les données disponibles. Paiements en attente : ${USD.format(insights.pendingAmount)}.`,
          suggestions: ["Relancer le parent prioritaire", "Vérifier les paiements en attente", "Préparer un échéancier ciblé"]
        }
      : {
          answer: topParent
            ? `${insights.parentsWithDebt.length} parent(s) still have a balance. Priority: ${topParent.name} with ${USD.format(topParent.debt)} remaining. Estimated total debt: ${USD.format(insights.outstandingDebt)}.`
            : `No clear overdue parent is detected from available data. Pending payments: ${USD.format(insights.pendingAmount)}.`,
          suggestions: ["Follow up with the priority parent", "Review pending payments", "Prepare a targeted payment plan"]
        };
  }

  if (q.includes("revenu") || q.includes("recette") || q.includes("revenue") || q.includes("paiement total")) {
    return lang === "fr"
      ? {
          answer: `Revenu encaissé : ${USD.format(insights.revenue)}. Taux de réussite : ${insights.successRate.toFixed(1)} %. Paiements en attente : ${USD.format(insights.pendingAmount)}. ${insights.bestMonth ? `Meilleur mois observé : ${insights.bestMonth[0]} (${USD.format(insights.bestMonth[1])}).` : ""}`,
          suggestions: ["Comparer avec le mois précédent", "Afficher les paiements en attente", "Analyser les parents à forte contribution"]
        }
      : {
          answer: `Collected revenue: ${USD.format(insights.revenue)}. Success rate: ${insights.successRate.toFixed(1)}%. Pending payments: ${USD.format(insights.pendingAmount)}. ${insights.bestMonth ? `Best observed month: ${insights.bestMonth[0]} (${USD.format(insights.bestMonth[1])}).` : ""}`,
          suggestions: ["Compare with previous month", "Show pending payments", "Analyze high-contribution parents"]
        };
  }

  if (q.includes("critique") || q.includes("risque") || q.includes("critical") || q.includes("risk")) {
    const names = insights.parentsWithDebt.slice(0, 3).map((parent) => `${parent.name} (${USD.format(parent.debt)})`).join(", ");
    return lang === "fr"
      ? {
          answer: names
            ? `Parents à surveiller en priorité : ${names}. Les relances doivent rester individuelles et basées sur le montant réel dû.`
            : "Aucun profil critique net n'apparaît avec les données actuelles.",
          suggestions: ["Envoyer une relance individuelle", "Contrôler l'historique du parent", "Générer une synthèse de risque"]
        }
      : {
          answer: names
            ? `Priority parents to monitor: ${names}. Follow-ups should stay individual and based on the real balance.`
            : "No clear critical profile appears in the current data.",
          suggestions: ["Send an individual reminder", "Check parent history", "Generate a risk summary"]
        };
  }

  return lang === "fr"
    ? {
        answer: `Diagnostic local : ${context.parents.length} parent(s), ${context.payments.length} paiement(s), ${USD.format(insights.revenue)} encaissés et ${USD.format(insights.outstandingDebt)} de dette estimée. Posez une question sur les impayés, les revenus ou les risques pour obtenir une analyse ciblée.`,
        suggestions: ["Afficher les retards critiques", "Vérifier la performance mensuelle", "Générer un rapport résumé"]
      }
    : {
        answer: `Local diagnosis: ${context.parents.length} parent(s), ${context.payments.length} payment(s), ${USD.format(insights.revenue)} collected and ${USD.format(insights.outstandingDebt)} estimated debt. Ask about unpaid balances, revenue or risks for a targeted analysis.`,
        suggestions: ["Show critical delays", "Review monthly performance", "Generate a summary report"]
      };
}

function isGenericAssistantResponse(data: AssistantResponse | null | undefined) {
  const answer = normalize(data?.answer);
  return !data?.answer || answer.includes("mode local actif") || answer.includes("service ia distant");
}

export function AIAssistantPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState(lang === "fr" ? "Qui n'a pas payé ce mois-ci ?" : "Who has not paid this month?");
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (nextQuery = query) => {
    const askedQuestion = nextQuery.trim();
    if (!askedQuestion) return;

    setLoading(true);
    setError(null);

    const context = await loadAssistantContext();
    const localResult = localAssistantReply(askedQuestion, lang, context);

    try {
      const data = await api<AssistantResponse>("/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({ query: askedQuestion })
      });

      if (isGenericAssistantResponse(data)) {
        setResult(localResult);
        setError(t("aiUnavailable"));
      } else {
        setResult(data);
      }
    } catch {
      setResult(localResult);
      setError(t("aiUnavailable"));
    } finally {
      setLoading(false);
    }
  };

  const examples = lang === "fr"
    ? [
        "Qui n'a pas payé ce mois-ci ?",
        "Quel est le revenu total ?",
        "Affiche les retards critiques",
        "Quels sont les mois avec les meilleurs paiements ?"
      ]
    : [
        "Who has not paid this month?",
        "What is total revenue?",
        "Show critical delays",
        "Which months have the best payments?"
      ];

  return (
    <div className="space-y-8 pb-8">
      <div className="animate-fadeInDown">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-brand-300" />
          <h1 className="font-display text-3xl font-bold text-white">{t("aiTitle")}</h1>
        </div>
        <p className="mt-2 text-ink-dim">{t("aiSubtitle")}</p>
      </div>

      <div className="card animate-fadeInUp">
        <h2 className="mb-4 font-display text-lg font-bold text-white">{t("aiAskQuestion")}</h2>
        <div className="space-y-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("aiPlaceholder")}
            className="h-32 w-full resize-none"
          />
          <button
            onClick={() => void submit()}
            disabled={loading}
            className="btn-primary w-full py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t("running")}
              </div>
            ) : (
              <span className="inline-flex items-center justify-center gap-2"><Zap className="h-4 w-4" /> {t("run")}</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="animate-fadeInUp rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <p className="mb-1 font-semibold">{t("aiLocalMode")}</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="card animate-fadeInUp">
            <div className="flex items-start gap-4">
              <Lightbulb className="mt-1 h-8 w-8 shrink-0 text-brand-300" />
              <div className="flex-1">
                <h3 className="mb-2 font-display text-lg font-bold text-white">{t("aiResponse")}</h3>
                <p className="leading-relaxed text-ink-dim">{result.answer}</p>
              </div>
            </div>
          </div>

          <div className="card animate-slideInRight">
            <h3 className="mb-4 font-display text-lg font-bold text-white">{t("suggestedActions")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {result.suggestions.map((suggestion, idx) => (
                <div
                  key={suggestion}
                  className="cursor-pointer rounded-lg border border-brand-500/30 bg-brand-500/10 p-4 transition-all duration-300 hover:border-brand-500/50 hover:bg-brand-500/20"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-1 h-4 w-4 shrink-0 text-brand-300" />
                    <p className="text-sm text-ink-dim transition-colors hover:text-white">{suggestion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card glass">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-brand-300" />
                <p className="font-semibold text-white">{t("aiAnalysisContext")}</p>
              </div>
              <p className="text-sm text-ink-dim">{t("aiContextBody")}</p>
            </div>
          </div>
        </div>
      )}

      {!result && (
        <div className="card glass animate-fadeInUp">
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold text-white">{t("aiExampleQuestions")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setQuery(example);
                    void submit(example);
                  }}
                  className="rounded-lg border border-slate-700/50 p-3 text-left text-sm text-ink-dim transition-all duration-300 hover:bg-slate-700/30 hover:text-white"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
