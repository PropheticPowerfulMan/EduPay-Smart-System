import { Router } from "express";
import { z } from "zod";
import { authGuard, authorize } from "../../middlewares/auth";
import { env } from "../../config/env";

export const aiRouter = Router();
aiRouter.use(authGuard);

const querySchema = z.object({
  query: z.string().min(3)
});

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
    return res.json({
      answer: "Le service IA distant est momentanément indisponible. Mode local actif : priorisez les paiements en retard, vérifiez les soldes parents et surveillez les anomalies du tableau de bord.",
      suggestions: ["Analyser les parents critiques", "Vérifier les paiements en attente", "Générer un rapport financier"]
    });
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
