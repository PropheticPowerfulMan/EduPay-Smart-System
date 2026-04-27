import { useMemo, useState } from "react";
import { Bot, Eye, EyeOff, Lightbulb, MessageSquareText, Send, Sparkles, Trash2, Zap } from "lucide-react";
import { useI18n } from "../i18n";
import { api } from "../services/api";

type AssistantResponse = {
  answer: string;
  suggestions: string[];
  facts?: string[];
  actions?: string[];
  confidence?: string;
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestions?: string[];
  facts?: string[];
  actions?: string[];
  confidence?: string;
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const FR_CONFIDENCE = "Analyse basee sur les donnees actuellement chargees dans EduPay.";
const EN_CONFIDENCE = "Analysis based on the data currently loaded in EduPay.";

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
        expected: expectedForParent,
        paid,
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
  const latestPayments = [...context.payments].sort((a, b) => parseDate(b).getTime() - parseDate(a).getTime()).slice(0, 5);
  const topContributors = context.parents
    .map((parent) => ({
      name: parent.fullName,
      paid: (paidByParent.get(parent.id) ?? 0) + (paidByParent.get(normalize(parent.fullName)) ?? 0)
    }))
    .filter((parent) => parent.paid > 0)
    .sort((a, b) => b.paid - a.paid)
    .slice(0, 5);

  return {
    completed,
    pending,
    failed,
    revenue,
    pendingAmount,
    outstandingDebt,
    successRate,
    parentsWithDebt,
    bestMonth,
    latestPayments,
    topContributors,
    parentCount: context.parents.length,
    studentCount: context.parents.reduce((sum, parent) => sum + (parent.students?.length ?? 0), 0),
    averagePayment: completed.length ? revenue / completed.length : 0
  };
}

function findMentionedParent(query: string, context: AssistantContext) {
  const q = normalize(query);
  return context.parents.find((parent) => {
    const name = normalize(parent.fullName);
    return name && (q.includes(name) || name.split(/\s+/).some((part) => part.length > 3 && q.includes(part)));
  });
}

function localAssistantReply(query: string, lang: "fr" | "en", context: AssistantContext): AssistantResponse {
  const q = normalize(query);
  const insights = buildInsights(context);
  const topParent = insights.parentsWithDebt[0];
  const mentionedParent = findMentionedParent(query, context);

  if (mentionedParent) {
    const parentDebt = insights.parentsWithDebt.find((parent) => parent.id === mentionedParent.id);
    const expected = parentDebt?.expected ?? (mentionedParent.students ?? []).reduce((sum, student) => sum + asNumber(student.annualFee), 0);
    const paid = parentDebt?.paid ?? 0;
    const debt = Math.max(expected - paid, 0);
    return {
      answer: lang === "fr"
        ? `Le dossier de ${mentionedParent.fullName} est identifiable et peut etre traite directement. Le point important est le solde restant, car il determine la priorite de relance.`
        : `${mentionedParent.fullName}'s file is clearly identifiable and can be handled directly. The important point is the remaining balance, because it drives follow-up priority.`,
      facts: lang === "fr"
        ? [
            `${mentionedParent.students?.length ?? 0} enfant(s) rattache(s).`,
            `Total attendu : ${USD.format(expected)}.`,
            `Total encaisse : ${USD.format(paid)}.`,
            `Solde restant estime : ${USD.format(debt)}.`,
            `Contact disponible : ${mentionedParent.phone || mentionedParent.email || "non renseigne"}.`
          ]
        : [
            `${mentionedParent.students?.length ?? 0} linked child(ren).`,
            `Expected total: ${USD.format(expected)}.`,
            `Collected: ${USD.format(paid)}.`,
            `Estimated remaining balance: ${USD.format(debt)}.`,
            `Available contact: ${mentionedParent.phone || mentionedParent.email || "not provided"}.`
          ],
      actions: lang === "fr"
        ? ["Verifier le dernier paiement avant relance.", "Proposer un echeancier si le solde est eleve.", "Confirmer le canal de contact du parent."]
        : ["Check the last payment before follow-up.", "Suggest a payment plan if the balance is high.", "Confirm the parent's contact channel."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Voir les retards critiques", "Proposer un echeancier", "Analyser les paiements recents"]
        : ["Show critical delays", "Suggest a payment plan", "Analyze recent payments"]
    };
  }

  if (q.includes("impay") || q.includes("non pay") || q.includes("retard") || q.includes("unpaid") || q.includes("debt")) {
    return {
      answer: lang === "fr"
        ? topParent
          ? `La situation demande une action de relance ciblee. Le parent le plus prioritaire ressort nettement, donc il vaut mieux commencer par lui avant d'envoyer des messages generaux.`
          : `Aucun retard net dominant n'apparait dans les donnees actuelles. Le point a surveiller reste le volume des paiements en attente.`
        : topParent
          ? `The situation calls for targeted follow-up. One priority parent stands out, so start there before sending broad reminders.`
          : `No dominant overdue case appears in current data. The main item to watch is pending payments.`,
      facts: lang === "fr"
        ? [
            `${insights.parentsWithDebt.length} parent(s) avec solde restant.`,
            topParent ? `Priorite actuelle : ${topParent.name} (${USD.format(topParent.debt)}).` : "Aucun parent prioritaire net.",
            `Dette globale estimee : ${USD.format(insights.outstandingDebt)}.`,
            `Paiements en attente : ${USD.format(insights.pendingAmount)}.`
          ]
        : [
            `${insights.parentsWithDebt.length} parent(s) with remaining balance.`,
            topParent ? `Current priority: ${topParent.name} (${USD.format(topParent.debt)}).` : "No clear priority parent.",
            `Estimated total debt: ${USD.format(insights.outstandingDebt)}.`,
            `Pending payments: ${USD.format(insights.pendingAmount)}.`
          ],
      actions: lang === "fr"
        ? ["Contacter d'abord le parent prioritaire.", "Verifier si un paiement recent n'est pas encore valide.", "Preparer un echeancier court et clair."]
        : ["Contact the priority parent first.", "Check whether a recent payment is still pending.", "Prepare a short and clear payment plan."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Relancer le parent prioritaire", "Verifier les paiements en attente", "Preparer un echeancier cible"]
        : ["Follow up with the priority parent", "Review pending payments", "Prepare a targeted payment plan"]
    };
  }

  if (q.includes("revenu") || q.includes("recette") || q.includes("revenue") || q.includes("paiement total")) {
    return {
      answer: lang === "fr"
        ? `La performance financiere est lisible: les encaissements sont corrects si le taux de succes reste proche ou au-dessus de 80 %. Les paiements en attente doivent etre traites rapidement pour ne pas fausser le suivi.`
        : `Financial performance is readable: collections are healthy if the success rate stays near or above 80%. Pending payments should be reviewed quickly so tracking stays accurate.`,
      facts: lang === "fr"
        ? [
            `Revenu encaisse : ${USD.format(insights.revenue)}.`,
            `Taux de succes : ${insights.successRate.toFixed(1)} %.`,
            `Paiements en attente : ${USD.format(insights.pendingAmount)}.`,
            insights.bestMonth ? `Meilleur mois observe : ${insights.bestMonth[0]} (${USD.format(insights.bestMonth[1])}).` : "Pas assez d'historique mensuel pour identifier un meilleur mois."
          ]
        : [
            `Collected revenue: ${USD.format(insights.revenue)}.`,
            `Success rate: ${insights.successRate.toFixed(1)}%.`,
            `Pending payments: ${USD.format(insights.pendingAmount)}.`,
            insights.bestMonth ? `Best observed month: ${insights.bestMonth[0]} (${USD.format(insights.bestMonth[1])}).` : "Not enough monthly history to identify a best month."
          ],
      actions: lang === "fr"
        ? ["Valider les paiements en attente.", "Comparer les revenus aux frais attendus.", "Surveiller les parents a forte dette."]
        : ["Validate pending payments.", "Compare revenue against expected fees.", "Monitor high-debt parents."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Comparer avec les retards", "Identifier les gros contributeurs", "Generer un rapport resume"]
        : ["Compare with delays", "Identify top contributors", "Generate a summary report"]
    };
  }

  if (q.includes("mois") || q.includes("month") || q.includes("meilleur") || q.includes("best") || q.includes("recent")) {
    const latest = insights.latestPayments
      .map((payment) => `${payment.parentFullName || payment.parentId || "Parent"}: ${USD.format(payment.amount)} (${payment.status})`)
      .join("; ");
    return {
      answer: lang === "fr"
        ? `Les paiements recents donnent une bonne lecture du rythme actuel. Si les montants recents baissent, il faut relancer avant que la dette ne grossisse.`
        : `Recent payments give a good reading of the current rhythm. If recent amounts are falling, follow up before debt grows.`,
      facts: lang === "fr"
        ? [
            insights.bestMonth ? `Meilleur mois observe : ${insights.bestMonth[0]} avec ${USD.format(insights.bestMonth[1])}.` : "Meilleur mois non determine.",
            `Paiement moyen encaisse : ${USD.format(insights.averagePayment)}.`,
            `Paiements recents : ${latest || "aucun paiement disponible"}.`
          ]
        : [
            insights.bestMonth ? `Best observed month: ${insights.bestMonth[0]} with ${USD.format(insights.bestMonth[1])}.` : "Best month not determined.",
            `Average collected payment: ${USD.format(insights.averagePayment)}.`,
            `Recent payments: ${latest || "no payment available"}.`
          ],
      actions: lang === "fr"
        ? ["Comparer les paiements recents aux retards.", "Verifier les statuts PENDING.", "Identifier les parents sans paiement recent."]
        : ["Compare recent payments with delays.", "Review PENDING statuses.", "Identify parents without recent payment."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Afficher le revenu total", "Voir les retards critiques", "Identifier les gros contributeurs"]
        : ["Show total revenue", "Show critical delays", "Identify top contributors"]
    };
  }

  if (q.includes("critique") || q.includes("risque") || q.includes("critical") || q.includes("risk")) {
    const names = insights.parentsWithDebt.slice(0, 3).map((parent) => `${parent.name} (${USD.format(parent.debt)})`).join(", ");
    return {
      answer: lang === "fr"
        ? names
          ? `Les cas critiques doivent etre traites individuellement. Une relance generale risque d'etre moins efficace qu'un message personnalise avec montant, delai et option d'echeancier.`
          : "Aucun profil critique net n'apparait avec les donnees actuelles."
        : names
          ? `Critical cases should be handled individually. A general reminder is less effective than a personalized message with amount, deadline and payment-plan option.`
          : "No clear critical profile appears in current data.",
      facts: lang === "fr"
        ? [names ? `Parents prioritaires : ${names}.` : "Aucun parent prioritaire net.", `Dette globale estimee : ${USD.format(insights.outstandingDebt)}.`]
        : [names ? `Priority parents: ${names}.` : "No clear priority parent.", `Estimated total debt: ${USD.format(insights.outstandingDebt)}.`],
      actions: lang === "fr"
        ? ["Traiter les 3 premiers dossiers en priorite.", "Appeler si le montant est eleve.", "Documenter chaque relance."]
        : ["Handle the top 3 files first.", "Call when the amount is high.", "Document every follow-up."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Envoyer une relance individuelle", "Controler l'historique du parent", "Generer une synthese de risque"]
        : ["Send an individual reminder", "Check parent history", "Generate a risk summary"]
    };
  }

  if (q.includes("contributeur") || q.includes("contribution") || q.includes("gros") || q.includes("top")) {
    const list = insights.topContributors.map((parent) => `${parent.name} (${USD.format(parent.paid)})`).join(", ");
    return {
      answer: lang === "fr"
        ? list ? `Les contributions les plus fortes montrent les familles deja regulieres. Elles peuvent servir de reference pour suivre la stabilite des encaissements.` : "Aucune contribution parent claire n'est disponible dans les paiements actuels."
        : list ? `The strongest contributions show the already regular families. They can be used as a reference for collection stability.` : "No clear parent contribution is available from current payments.",
      facts: lang === "fr"
        ? [list ? `Top contributions : ${list}.` : "Pas de top contribution disponible.", `Revenu encaisse total : ${USD.format(insights.revenue)}.`]
        : [list ? `Top contributions: ${list}.` : "No top contribution available.", `Total collected revenue: ${USD.format(insights.revenue)}.`],
      actions: lang === "fr"
        ? ["Comparer ces familles aux dossiers en retard.", "Identifier les classes les plus stables.", "Preparer un rapport financier."]
        : ["Compare these families with overdue files.", "Identify the most stable classes.", "Prepare a financial report."],
      confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
      suggestions: lang === "fr"
        ? ["Afficher les retards critiques", "Comparer avec le revenu total", "Generer un rapport resume"]
        : ["Show critical delays", "Compare with total revenue", "Generate a summary report"]
    };
  }

  const topDebts = insights.parentsWithDebt.slice(0, 3).map((parent) => `${parent.name}: ${USD.format(parent.debt)}`).join("; ");
  return {
    answer: lang === "fr"
      ? "Voici une synthese administrative rapide. Elle donne une vue claire des volumes, du risque financier et de la prochaine action logique."
      : "Here is a quick administrative summary. It gives a clear view of volume, financial risk and the next logical action.",
    facts: lang === "fr"
      ? [
          `${insights.parentCount} parent(s), ${insights.studentCount} eleve(s), ${context.payments.length} paiement(s).`,
          `Encaisse : ${USD.format(insights.revenue)}.`,
          `Dette estimee : ${USD.format(insights.outstandingDebt)}.`,
          `Taux de succes : ${insights.successRate.toFixed(1)} %.`,
          `Priorites : ${topDebts || "aucune dette prioritaire detectee"}.`
        ]
      : [
          `${insights.parentCount} parent(s), ${insights.studentCount} student(s), ${context.payments.length} payment(s).`,
          `Collected: ${USD.format(insights.revenue)}.`,
          `Estimated debt: ${USD.format(insights.outstandingDebt)}.`,
          `Success rate: ${insights.successRate.toFixed(1)}%.`,
          `Priorities: ${topDebts || "no priority debt detected"}.`
        ],
    actions: lang === "fr"
      ? ["Commencer par les dossiers prioritaires.", "Valider les paiements en attente.", "Revoir les chiffres apres chaque nouvel encaissement."]
      : ["Start with priority files.", "Validate pending payments.", "Review figures after each new collection."],
    confidence: lang === "fr" ? FR_CONFIDENCE : EN_CONFIDENCE,
    suggestions: lang === "fr"
      ? ["Voir les parents critiques", "Analyser le revenu total", "Afficher les paiements recents"]
      : ["Show critical parents", "Analyze total revenue", "Show recent payments"]
  };
}

function isGenericAssistantResponse(data: AssistantResponse | null | undefined) {
  const answer = normalize(data?.answer);
  return !data?.answer ||
    answer.includes("mode local actif") ||
    answer.includes("service ia distant") ||
    answer.includes("query understood") ||
    answer.includes("detailed analytics are available");
}

function ResponseSections({ response }: { response: { answer?: string; text?: string; facts?: string[]; actions?: string[]; confidence?: string } }) {
  const answer = response.answer ?? response.text ?? "";
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">Diagnostic</p>
        <p className="mt-1 leading-relaxed text-ink-dim">{answer}</p>
      </div>
      {response.facts && response.facts.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">Chiffres cles</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {response.facts.map((fact) => (
              <div key={fact} className="rounded-lg border border-slate-700/50 bg-slate-900/35 px-3 py-2 text-sm text-ink-dim">
                {fact}
              </div>
            ))}
          </div>
        </div>
      )}
      {response.actions && response.actions.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">Actions recommandees</p>
          <ol className="mt-2 space-y-2">
            {response.actions.map((action, index) => (
              <li key={action} className="flex gap-2 text-sm text-ink-dim">
                <span className="font-mono text-brand-300">{index + 1}.</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {response.confidence && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {response.confidence}
        </p>
      )}
    </div>
  );
}

export function AIAssistantPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState(lang === "fr" ? "Qui n'a pas paye ce mois-ci ?" : "Who has not paid this month?");
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examples = useMemo(() => lang === "fr"
    ? [
        "Qui n'a pas paye ce mois-ci ?",
        "Quel est le revenu total ?",
        "Affiche les retards critiques",
        "Quels sont les paiements recents ?",
        "Genere un rapport resume"
      ]
    : [
        "Who has not paid this month?",
        "What is total revenue?",
        "Show critical delays",
        "Show recent payments",
        "Generate a summary report"
      ], [lang]);

  const submit = async (nextQuery = query) => {
    const askedQuestion = nextQuery.trim();
    if (!askedQuestion || loading) return;

    setLoading(true);
    setError(null);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text: askedQuestion }]);

    const context = await loadAssistantContext();
    const localResult = localAssistantReply(askedQuestion, lang, context);

    try {
      const data = await api<AssistantResponse>("/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({ query: askedQuestion, context })
      });
      const finalResult = isGenericAssistantResponse(data) ? localResult : data;
      setResult(finalResult);
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: finalResult.answer,
        suggestions: finalResult.suggestions,
        facts: finalResult.facts,
        actions: finalResult.actions,
        confidence: finalResult.confidence
      }]);
      if (isGenericAssistantResponse(data)) setError(t("aiUnavailable"));
    } catch {
      setResult(localResult);
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: localResult.answer,
        suggestions: localResult.suggestions,
        facts: localResult.facts,
        actions: localResult.actions,
        confidence: localResult.confidence
      }]);
      setError(t("aiUnavailable"));
    } finally {
      setLoading(false);
      setQuery("");
    }
  };

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
          <div className="flex flex-wrap gap-2">
            {examples.slice(0, 3).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void submit(example)}
                className="rounded-full border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-ink-dim transition-all hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-white"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="animate-fadeInUp rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <p className="mb-1 font-semibold">{t("aiLocalMode")}</p>
          <p>{error}</p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="card glass animate-fadeInUp">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-brand-300" />
              <h3 className="font-display text-lg font-bold text-white">Conversation IA</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHistoryVisible((value) => !value)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-2 text-xs font-semibold text-ink-dim hover:bg-slate-800/60 hover:text-white"
              >
                {historyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {historyVisible ? "Masquer" : "Afficher"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setResult(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/20"
              >
                <Trash2 className="h-4 w-4" />
                Effacer
              </button>
            </div>
          </div>
          {historyVisible ? (
            <div className="space-y-4">
              {[...messages].reverse().map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-brand-600 text-white" : "border border-slate-700/50 bg-slate-900/50 text-ink-dim"}`}>
                    {message.role === "assistant" ? (
                      <ResponseSections response={message} />
                    ) : (
                      <p>{message.text}</p>
                    )}
                    {message.suggestions && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => void submit(suggestion)}
                            className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200 hover:bg-brand-500/20"
                          >
                            <Send className="h-3 w-3" />
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-700/50 bg-slate-900/35 px-4 py-3 text-sm text-ink-dim">
              Historique masque. Les nouvelles reponses continueront a etre enregistrees jusqu'a effacement.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="card animate-fadeInUp">
            <div className="flex items-start gap-4">
              <Lightbulb className="mt-1 h-8 w-8 shrink-0 text-brand-300" />
              <div className="flex-1">
                <h3 className="mb-2 font-display text-lg font-bold text-white">{t("aiResponse")}</h3>
                <ResponseSections response={result} />
              </div>
            </div>
          </div>

          <div className="card animate-slideInRight">
            <h3 className="mb-4 font-display text-lg font-bold text-white">{t("suggestedActions")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {result.suggestions.map((suggestion, idx) => (
                <button
                  key={suggestion}
                  onClick={() => void submit(suggestion)}
                  className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-4 text-left transition-all duration-300 hover:border-brand-500/50 hover:bg-brand-500/20"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-1 h-4 w-4 shrink-0 text-brand-300" />
                    <p className="text-sm text-ink-dim transition-colors hover:text-white">{suggestion}</p>
                  </div>
                </button>
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
                  onClick={() => void submit(example)}
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
