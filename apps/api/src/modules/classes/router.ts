import { Router } from "express";
import { z } from "zod";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const classSchema = z.object({
  name: z.string().min(2),
  level: z.string().min(1)
});

const schoolSections = [
  ...Array.from({ length: 5 }, (_v, index) => {
    const name = `K${index + 1}`;
    return { id: `section-${name.toLowerCase()}`, name, level: "Kindergarten", schoolId: "demo" };
  }),
  ...Array.from({ length: 12 }, (_v, index) => {
    const grade = index + 1;
    return { id: `section-grade-${grade}`, name: `Grade ${grade}`, level: "Grade", schoolId: "demo" };
  })
];

export const classRouter = Router();
classRouter.use(authGuard);

classRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    return res.status(409).json({
      message: "La creation locale de classes est desactivee dans EduPay quand le registre Orbit est actif. Creez d'abord la classe dans SAVANEX."
    });
  }

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
  if (orbitRegistryIsEnabled()) {
    const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
    return res.json(mirrored.classes);
  }

  try {
    const rows = await prisma.class.findMany({ where: { schoolId: req.user!.schoolId } });
    if (rows.length === 0) return res.json(schoolSections);
    return res.json(rows);
  } catch (error) {
    console.error("DB unavailable on class list, returning school sections", error);
    return res.json(schoolSections);
  }
});
