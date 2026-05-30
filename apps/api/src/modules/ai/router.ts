import { Router } from "express";
import { z } from "zod";
import { authGuard, authorize } from "../../middlewares/auth";
import { env } from "../../config/env";

export const aiRouter = Router();
aiRouter.use(authGuard);

const querySchema = z.object({
  query: z.string().min(3),
  context: z.any().optional()
});

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type AssistantTableRow = {
  student: string;
  className: string;
  parent: string;
  expected: number;
  paid: number;
  balance: number;
  status: string;
};

export function buildLocalAssistantFallback(query: string, context: any) {
  const q = normalize(query);
  const parents = Array.isArray(context?.parents) ? context.parents : [];
  const payments = Array.isArray(context?.payments) ? context.payments : [];
  const profiles = Array.isArray(context?.parentProfiles) ? context.parentProfiles : [];
  const asksUnpaidStudents = /(liste|élève|student|qui)/.test(q) && /(impay|non pay|pas encore pay|pas pay|sans paiement|retard|solde|debt|unpaid|not paid)/.test(q);

  if (asksUnpaidStudents) {
    const paidNames = new Set<string>();
    for (const payment of payments) {
      if (payment?.status !== "COMPLETED") continue;
      for (const studentName of Array.isArray(payment?.studentNames) ? payment.studentNames : []) {
        paidNames.add(normalize(String(studentName)));
      }
    }

    const parentById = new Map(parents.map((parent: any) => [parent?.id, parent]));
    const rows = (profiles.length ? profiles : parents.map((parent: any) => ({ parent, students: parent?.students ?? [] })))
      .flatMap((profile: any) => {
        const parent = profile.parent ?? profile;
        const parentRecord: any = parentById.get(parent?.id) ?? parent;
        return (profile.students ?? parentRecord?.students ?? []).map((student: any) => {
          const parentStudent = (parentRecord?.students ?? []).find((item: any) => item?.id === student?.id || normalize(item?.fullName) === normalize(student?.fullName));
          const paid = Number(student?.paid ?? parentStudent?.paid ?? 0);
          const expected = Number(student?.expectedTotal ?? parentStudent?.expectedTotal ?? parentStudent?.annualFee ?? student?.annualFee ?? 0);
          const balance = Math.max(Number(student?.balance ?? expected - paid), 0);
          return {
            name: student?.fullName ?? parentStudent?.fullName ?? "Eleve sans nom",
            className: student?.className ?? parentStudent?.className ?? "Classe non renseignee",
            parentName: parent?.fullName ?? "Parent",
            paid,
            expected,
            balance,
            hasPayment: paid > 0 || paidNames.has(normalize(student?.fullName ?? parentStudent?.fullName))
          };
        });
      });

    const noPaymentOnly = /(pas encore pay|jamais pay|sans paiement|not paid yet|no payment)/.test(q);
    const targets = rows
      .filter((row: any) => noPaymentOnly ? !row.hasPayment : row.balance > 0)
      .sort((left: any, right: any) => right.balance - left.balance || String(left.name).localeCompare(String(right.name)));
    const tableRows: AssistantTableRow[] = targets.slice(0, 50).map((row: any) => ({
      student: row.name,
      className: row.className,
      parent: row.parentName,
      expected: Number(row.expected || 0),
      paid: Number(row.paid || 0),
      balance: Number(row.balance || 0),
      status: row.hasPayment ? "PARTIAL" : "UNPAID"
    }));
    const facts = tableRows.slice(0, 25).map((row) =>
      `${row.student} - ${row.className} - parent ${row.parent} - attendu $${row.expected.toFixed(2)}, paye $${row.paid.toFixed(2)}, reste $${row.balance.toFixed(2)}.`
    );

    return {
      answer: targets.length
        ? `Liste precise des eleves ${noPaymentOnly ? "sans paiement enregistre" : "avec solde restant"} selon les donnees EduPay chargees.`
        : "Aucun élève correspondant n'apparaît dans les données EduPay chargées.",
      facts: [`${targets.length} élève(s) concerne(s).`, ...facts],
      tableRows,
      actions: ["Vérifier les paiements en attente avant relance.", "Contacter les parents avec le montant exact.", "Filtrer par classe si la liste doit être traitée par niveau."],
      confidence: "Analyse locale basée sur les données EduPay transmises à l'assistant.",
      suggestions: ["Lister les parents avec solde", "Afficher les paiements en attente", "Voir les cas critiques par classe"]
    };
  }

  return {
    answer: "Connexion IA distante indisponible. EduPay utilise l'analyse locale: controlez les soldes parents, les paiements en attente et les échéances en retard avant toute relance.",
    facts: [`${parents.length} parent(s) charges.`, `${payments.length} paiement(s) charges.`],
    actions: ["Relancer les dossiers avec solde restant.", "Valider ou corriger les paiements PENDING.", "Recalculer apres chaque encaissement."],
    suggestions: ["Analyser les parents critiques", "Vérifier les paiements en attente", "Génèrer un rapport financier"]
  };
}

function compactAssistantContext(context: any) {
  const parents = Array.isArray(context?.parents) ? context.parents : [];
  const payments = Array.isArray(context?.payments) ? context.payments : [];
  const profiles = Array.isArray(context?.parentProfiles) ? context.parentProfiles : [];

  return {
    overview: context?.overview ?? null,
    financeOverview: context?.financeOverview ?? null,
    counts: {
      parents: parents.length,
      payments: payments.length,
      detailedProfiles: profiles.length
    },
    parents: parents.slice(0, 80).map((parent: any) => ({
      id: parent?.id,
      fullName: parent?.fullName,
      phone: parent?.phone,
      email: parent?.email,
      students: Array.isArray(parent?.students)
        ? parent.students.map((student: any) => ({
            fullName: student?.fullName,
            className: student?.className,
            annualFee: student?.annualFee
          }))
        : []
    })),
    payments: payments.slice(0, 120).map((payment: any) => ({
      parentId: payment?.parentId,
      parentFullName: payment?.parentFullName,
      studentNames: payment?.studentNames,
      amount: payment?.amount,
      status: payment?.status,
      createdAt: payment?.createdAt ?? payment?.date,
      reason: payment?.reason
    })),
    parentProfiles: profiles.slice(0, 40).map((profile: any) => ({
      parent: profile?.parent,
      profile: profile?.profile,
      students: profile?.students,
      alerts: profile?.alerts
    }))
  };
}

async function queryOpenAiAssistant(query: string, context: any) {
  if (!env.OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(18000),
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Tu es l'assistant financier EduPay, avec une conversation naturelle comme ChatGPT. Réponds en français clair sauf demande contraire. Donne une reponse JSON avec answer, suggestions, facts, actions et confidence. Utilise uniquement les données fournies; si une information manque, dis-le franchement et propose la meilleure prochaine action."
        },
        {
          role: "user",
          content: JSON.stringify({ query, context: compactAssistantContext(context) })
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenAI responded with ${response.status}`);
  const data = await response.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty assistant message.");
  return JSON.parse(content);
}

aiRouter.post("/assistant", authorize("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const payload = querySchema.parse(req.body);

  try {
    const openAiResponse = await queryOpenAiAssistant(payload.query, payload.context);
    if (openAiResponse) return res.json(openAiResponse);
  } catch (error) {
    console.error("OpenAI assistant unavailable, trying configured AI service", error);
  }

  try {
    const response = await fetch(`${env.AI_SERVICE_URL}/assistant/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`AI service responded with ${response.status}`);
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("AI service unavailable, using local assistant fallback", error);
    return res.json(buildLocalAssistantFallback(payload.query, payload.context));
  }
});

aiRouter.get("/insights", authorize("ADMIN", "ACCOUNTANT"), async (_req, res) => {
  try {
    const response = await fetch(`${env.AI_SERVICE_URL}/insights`);
    if (!response.ok) throw new Error(`AI service responded with ${response.status}`);
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("AI insights unavailable, using local fallback", error);
    return res.json({
      anomalies: [],
      suggestions: ["Surveiller les retards de paiement", "Relancer les familles prioritaires"],
      summary: "Mode local actif."
    });
  }
});
