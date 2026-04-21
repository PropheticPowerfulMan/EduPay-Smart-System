import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const classSchema = z.object({
  name: z.string().min(2),
  level: z.string().min(1)
});

export const classRouter = Router();
classRouter.use(authGuard);

classRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = classSchema.parse(req.body);
  const result = await prisma.class.create({
    data: {
      ...payload,
      schoolId: req.user!.schoolId
    }
  });
  res.status(201).json(result);
});

classRouter.get("/", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req: AuthenticatedRequest, res) => {
  const rows = await prisma.class.findMany({ where: { schoolId: req.user!.schoolId } });
  res.json(rows);
});
