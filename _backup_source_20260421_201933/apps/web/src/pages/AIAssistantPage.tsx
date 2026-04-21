import { useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type AssistantResponse = {
  answer: string;
  suggestions: string[];
};

function localAssistantReply(query: string, lang: "fr" | "en"): AssistantResponse {
  const q = query.toLowerCase();

  if (q.includes("impaye") || q.includes("non paye") || q.includes("unpaid")) {
    return lang === "fr"
      ? {
          answer: "Des impayes ont ete detectes. Priorisez les classes avec le plus grand retard et planifiez des rappels automatiques.",
          suggestions: ["Afficher la liste des parents en retard", "Envoyer un rappel WhatsApp/SMS", "Proposer un echeancier de paiement"]
        }
      : {
          answer: "Unpaid balances were detected. Prioritize classes with the largest delay and schedule automatic reminders.",
          suggestions: ["Show overdue parent list", "Send WhatsApp/SMS reminders", "Offer a payment plan"]
        };
  }

  if (q.includes("revenu") || q.includes("revenue")) {
    return lang === "fr"
      ? {
          answer: "Le revenu global est stable. Analysez les ecarts par classe pour identifier les zones a risque.",
          suggestions: ["Comparer avec le mois precedent", "Afficher les 3 classes les plus performantes", "Verifier les paiements en attente"]
        }
      : {
          answer: "Overall revenue is stable. Analyze class-level differences to identify risk areas.",
          suggestions: ["Compare with previous month", "Show top 3 performing classes", "Review pending payments"]
        };
  }

  return lang === "fr"
    ? {
        answer: "Question recue. Voici un premier diagnostic automatique base sur vos donnees disponibles.",
        suggestions: ["Afficher les retards critiques", "Verifier la performance mensuelle", "Generer un rapport resumee"]
      }
    : {
        answer: "Question received. Here is an initial automated diagnosis based on available data.",
        suggestions: ["Show critical delays", "Review monthly performance", "Generate summary report"]
      };
}

export function AIAssistantPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("Show parents who didn't pay this month");
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
      const fallback = localAssistantReply(query, lang);
      setResult(fallback);
      setError(lang === "fr"
        ? "Connexion IA indisponible, reponse locale affichee."
        : "AI service unavailable, local response is shown.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">🤖 {t("aiTitle")}</h1>
        <p className="text-ink-dim mt-2">{t("aiSubtitle")}</p>
      </div>

      {/* Query Input */}
      <div className="card animate-fadeInUp">
        <h2 className="font-display text-lg font-bold text-white mb-4">{lang === "fr" ? "Posez votre question" : "Ask your question"}</h2>
        <div className="space-y-4">
          <textarea 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "fr" ? "Par exemple: Qui n'a pas payé ce mois?" : "E.g., Who didn't pay this month?"}
            className="w-full h-32 resize-none"
          />
          <button 
            onClick={submit} 
            disabled={loading}
            className="w-full btn-primary font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {t("running")}
              </div>
            ) : (
              <span>⚡ {t("run")}</span>
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm animate-fadeInUp">
          <p className="font-semibold mb-1">⚠️ {lang === "fr" ? "Mode local" : "Local mode"}</p>
          <p>{error}</p>
        </div>
      )}

      {/* Response */}
      {result && (
        <div className="space-y-6">
          {/* Answer Card */}
          <div className="card animate-fadeInUp">
            <div className="flex items-start gap-4">
              <div className="text-4xl">💡</div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-white mb-2">{t("aiResponse")}</h3>
                <p className="text-ink-dim leading-relaxed">{result.answer}</p>
              </div>
            </div>
          </div>

          {/* Suggestions */}
          <div className="card animate-slideInRight">
            <h3 className="font-display text-lg font-bold text-white mb-4">{t("suggestedActions")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {result.suggestions.map((suggestion, idx) => (
                <div 
                  key={suggestion}
                  className="p-4 rounded-lg bg-brand-500/10 border border-brand-500/30 hover:border-brand-500/50 hover:bg-brand-500/20 transition-all duration-300 cursor-pointer"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-lg mt-1">✨</div>
                    <p className="text-sm text-ink-dim hover:text-white transition-colors">{suggestion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Insights Section */}
          <div className="card glass">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl">📊</div>
                <p className="font-semibold text-white">{lang === "fr" ? "Contexte de l'analyse" : "Analysis Context"}</p>
              </div>
              <p className="text-sm text-ink-dim">
                {lang === "fr" 
                  ? "Cette réponse est basée sur les données actuelles du système et peut être affinée avec des paramètres spécifiques."
                  : "This response is based on current system data and can be refined with specific parameters."
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      {!result && (
        <div className="card glass animate-fadeInUp">
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold text-white">💬 {lang === "fr" ? "Exemples de questions" : "Example Questions"}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {(lang === "fr" 
                ? [
                    "Qui n'a pas payé ce mois?",
                    "Quel est le revenu total?",
                    "Affiche les retards critiques",
                    "Quels sont les mois avec les meilleurs paiements?"
                  ]
                : [
                    "Who didn't pay this month?",
                    "What is total revenue?",
                    "Show critical delays",
                    "Which months have the best payments?"
                  ]
              ).map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex);
                    setTimeout(() => submit(), 100);
                  }}
                  className="p-3 rounded-lg border border-slate-700/50 text-left text-sm text-ink-dim hover:text-white hover:bg-slate-700/30 transition-all duration-300"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
