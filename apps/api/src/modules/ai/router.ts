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
  const asksUnpaidStudents = /(liste|eleve|student|qui)/.test(q) && /(impay|non pay|pas encore pay|pas pay|sans paiement|retard|solde|debt|unpaid|not paid)/.test(q);

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
        : "Aucun eleve correspondant n'apparait dans les donnees EduPay chargees.",
      facts: [`${targets.length} eleve(s) concerne(s).`, ...facts],
      tableRows,
      actions: ["Verifier les paiements en attente avant relance.", "Contacter les parents avec le montant exact.", "Filtrer par classe si la liste doit etre traitee par niveau."],
      confidence: "Analyse locale basee sur les donnees EduPay transmises a l'assistant.",
      suggestions: ["Lister les parents avec solde", "Afficher les paiements en attente", "Voir les cas critiques par classe"]
    };
  }

  return {
    answer: "Connexion IA distante indisponible. EduPay utilise l'analyse locale: controlez les soldes parents, les paiements en attente et les echeances en retard avant toute relance.",
    facts: [`${parents.length} parent(s) charges.`, `${payments.length} paiement(s) charges.`],
    actions: ["Relancer les dossiers avec solde restant.", "Valider ou corriger les paiements PENDING.", "Recalculer apres chaque encaissement."],
    suggestions: ["Analyser les parents critiques", "Verifier les paiements en attente", "Generer un rapport financier"]
  };
}

aiRouter.post("/assistant", authorize("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const payload = querySchema.parse(req.body);

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
