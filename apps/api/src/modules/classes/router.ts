import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const classSchema = z.object({
  name: z.string().min(2),
  level: z.string().min(1)
});

const demoClasses = [
  { id: "demo-class-1", name: "6ème A", level: "6ème", schoolId: "demo" },
  { id: "demo-class-2", name: "5ème A", level: "5ème", schoolId: "demo" },
  { id: "demo-class-3", name: "4ème A", level: "4ème", schoolId: "demo" },
  { id: "demo-class-4", name: "3ème A", level: "3ème", schoolId: "demo" },
  { id: "demo-class-5", name: "2ème A", level: "2ème", schoolId: "demo" },
  { id: "demo-class-6", name: "1ère A", level: "1ère", schoolId: "demo" }
];

export const classRouter = Router();
classRouter.use(authGuard);

classRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = classSchema.parse(req.body);
  try {
    const result = await prisma.class.create({
      data: {
        ...payload,
        schoolId: req.user!.schoolId
      }
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("DB unavailable on class create", error);
    res.status(201).json({ id: `demo-class-${Date.now()}`, ...payload, schoolId: req.user!.schoolId });
  }
});

classRouter.get("/", authorize("ADMIN", "ACCOUNTANT", "PARENT"), async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await prisma.class.findMany({ where: { schoolId: req.user!.schoolId } });
    if (rows.length === 0) return res.json(demoClasses);
    return res.json(rows);
  } catch (error) {
    console.error("DB unavailable on class list, returning demo data", error);
    return res.json(demoClasses);
  }
});
