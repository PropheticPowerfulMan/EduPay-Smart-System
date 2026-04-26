import { useState } from "react";
import { Bot, Lightbulb, MessageSquareText, Sparkles, Zap } from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type AssistantResponse = {
  answer: string;
  suggestions: string[];
};

function localAssistantReply(query: string, lang: "fr" | "en"): AssistantResponse {
  const q = query.toLowerCase();

  if (q.includes("impay") || q.includes("non pay") || q.includes("unpaid")) {
    return lang === "fr"
      ? {
          answer: "Des impayés ont été détectés. Priorisez les classes avec les retards les plus importants et planifiez des rappels automatiques.",
          suggestions: ["Afficher la liste des parents en retard", "Envoyer un rappel WhatsApp/SMS", "Proposer un échéancier de paiement"]
        }
      : {
          answer: "Unpaid balances were detected. Prioritize classes with the largest delays and schedule automatic reminders.",
          suggestions: ["Show overdue parent list", "Send WhatsApp/SMS reminders", "Offer a payment plan"]
        };
  }

  if (q.includes("revenu") || q.includes("revenue")) {
    return lang === "fr"
      ? {
          answer: "Le revenu global est stable. Analysez les écarts par classe pour identifier les zones à risque.",
          suggestions: ["Comparer avec le mois précédent", "Afficher les 3 classes les plus performantes", "Vérifier les paiements en attente"]
        }
      : {
          answer: "Overall revenue is stable. Analyze class-level differences to identify risk areas.",
          suggestions: ["Compare with previous month", "Show top 3 performing classes", "Review pending payments"]
        };
  }

  return lang === "fr"
    ? {
        answer: "Question reçue. Voici un premier diagnostic automatique basé sur vos données disponibles.",
        suggestions: ["Afficher les retards critiques", "Vérifier la performance mensuelle", "Générer un rapport résumé"]
      }
    : {
        answer: "Question received. Here is an initial automated diagnosis based on available data.",
        suggestions: ["Show critical delays", "Review monthly performance", "Generate a summary report"]
      };
}

export function AIAssistantPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState(lang === "fr" ? "Qui n'a pas payé ce mois-ci ?" : "Who has not paid this month?");
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<AssistantResponse>("/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({ query })
      });
      setResult(data);
    } catch {
      setResult(localAssistantReply(query, lang));
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
            onClick={submit}
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
                    setTimeout(() => void submit(), 100);
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
