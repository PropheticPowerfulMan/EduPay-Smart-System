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

  const response = await fetch(`${env.AI_SERVICE_URL}/assistant/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return res.json(data);
});

aiRouter.get("/insights", authorize("ADMIN", "ACCOUNTANT"), async (_req, res) => {
  const response = await fetch(`${env.AI_SERVICE_URL}/insights`);
  const data = await response.json();
  return res.json(data);
});
