import { Router } from "express";
import { z } from "zod";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";

const createStudentSchema = z.object({
  parentId: z.string().min(1),
  classId: z.string().min(1),
  externalStudentId: z.string().min(1).optional(),
  fullName: z.string().min(3),
  annualFee: z.number().positive()
}).superRefine((payload, context) => {
  if (orbitRegistryIsEnabled() && !payload.externalStudentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalStudentId"],
      message: "externalStudentId est obligatoire quand la synchronisation Orbit est active."
    });
  }
});

export const studentRouter = Router();
studentRouter.use(authGuard);

studentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    return res.status(409).json({
      message: "La creation locale d'eleves est desactivee dans EduPay quand le registre Orbit est actif. Creez d'abord l'eleve dans SAVANEX."
    });
  }

  const payload = createStudentSchema.parse(req.body);
  const student = await prisma.student.create({
    data: {
      ...payload,
      schoolId: req.user!.schoolId
    }
  });

  res.status(201).json(student);
});

studentRouter.get("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    await syncOrbitRegistryMirror(req.user!.schoolId);
  }

  const students = await prisma.student.findMany({
    where: { schoolId: req.user!.schoolId },
    include: {
      class: true,
      parent: true,
      payments: true
    }
  });

  res.json(students);
});
