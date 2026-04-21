import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const createParentSchema = z.object({
  fullName: z.string().min(3),
  phone: z.string().min(6),
  email: z.string().email(),
  preferredLanguage: z.enum(["fr", "en"]).default("fr")
});

export const parentRouter = Router();

parentRouter.use(authGuard);

parentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = createParentSchema.parse(req.body);
  const parent = await prisma.parent.create({
    data: {
      ...payload,
      schoolId: req.user!.schoolId
    }
  });
  res.status(201).json(parent);
});

parentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const parents = await prisma.parent.findMany({
    where: { schoolId: req.user!.schoolId },
    include: { students: true }
  });
  res.json(parents);
});

parentRouter.get("/me", authorize("PARENT"), async (req: AuthenticatedRequest, res) => {
  const parent = await prisma.parent.findFirst({
    where: {
      schoolId: req.user!.schoolId,
      userId: req.user!.sub
    },
    include: {
      students: {
        include: {
          class: true,
          payments: true
        }
      }
    }
  });
  res.json(parent);
});
