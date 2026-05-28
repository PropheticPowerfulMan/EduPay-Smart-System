import { Router } from "express";
import { z } from "zod";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror, updateOrbitStudent } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";
import { authGuard, authorize, AuthenticatedRequest } from "../../middlewares/auth";
import { notifyParentEntityChange } from "../notifications/entityChange";

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

const updateStudentSchema = z.object({
  parentId: z.string().min(1),
  classId: z.string().min(1),
  fullName: z.string().min(3),
  annualFee: z.number().nonnegative(),
  studentNumber: z.string().trim().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional()
});

export const studentRouter = Router();
studentRouter.use(authGuard);

studentRouter.post("/", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    return res.status(409).json({
      message: "La création locale d'élèves est désactivée dans EduPay quand le registre Orbit est actif. Créez d'abord l'élève dans SAVANEX."
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

studentRouter.put("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const payload = updateStudentSchema.parse(req.body);

  const [parent, classRow] = await Promise.all([
    prisma.parent.findFirst({ where: { id: payload.parentId, schoolId: req.user!.schoolId }, select: { id: true } }),
    prisma.class.findFirst({ where: { id: payload.classId, schoolId: req.user!.schoolId }, select: { id: true } })
  ]);

  if (!parent) return res.status(404).json({ message: "Parent introuvable." });
  if (!classRow) return res.status(404).json({ message: "Classe introuvable." });

  const existing = await prisma.student.findFirst({
    where: { id: req.params.id, schoolId: req.user!.schoolId },
    select: { id: true, externalStudentId: true }
  });
  if (!existing) return res.status(404).json({ message: "Eleve introuvable." });

  if (orbitRegistryIsEnabled()) {
    try {
      const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
      const mirroredStudent = mirrored.parents
        .flatMap((parent) => parent.students)
        .find((student) => student.id === req.params.id
          || student.orbitId === req.params.id
          || student.externalStudentId === existing.externalStudentId
          || student.displayId === existing.externalStudentId);
      const className = await prisma.class.findUnique({ where: { id: payload.classId }, select: { name: true } });
      const [firstName, ...lastNameParts] = payload.fullName.trim().split(/\s+/);
      await updateOrbitStudent(mirroredStudent?.orbitId || req.params.id, {
        fullName: payload.fullName,
        firstName: firstName || null,
        lastName: lastNameParts.join(" ") || null,
        className: className?.name ?? payload.classId,
        studentNumber: payload.studentNumber ?? undefined,
        mustChangePassword: payload.mustChangePassword
      });
      await syncOrbitRegistryMirror(req.user!.schoolId);
    } catch (error) {
      console.error("[STUDENT_UPDATE_ORBIT] Orbit sync failed but local update will continue", error);
    }
  }

  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      fullName: payload.fullName,
      classId: payload.classId,
      parentId: payload.parentId,
      annualFee: payload.annualFee
    },
    include: {
      class: true,
      parent: true,
      payments: true
    }
  });

  const notificationStatus = await notifyParentEntityChange({
    schoolId: req.user!.schoolId,
    parentId: student.parentId,
    subject: "Mise à jour du dossier élève EduPay",
    body: [
      `Le dossier de l'élève ${student.fullName} vient d'être modifié dans EduPay.`,
      `Classe : ${student.class?.name ?? payload.classId}`,
      `Frais annuels affichés : ${student.annualFee}`,
      "La mise à jour est synchronisée avec le registre partagé de l'écosystème quand celui-ci est actif.",
    ].join("\n"),
  });

  return res.json({ ...student, notificationStatus });
});

studentRouter.delete("/:id", authorize("ADMIN", "ACCOUNTANT"), async (req: AuthenticatedRequest, res) => {
  const existing = await prisma.student.findFirst({
    where: { id: req.params.id, schoolId: req.user!.schoolId },
    select: { id: true }
  });
  if (!existing) return res.status(404).json({ message: "Eleve introuvable." });

  await prisma.student.delete({ where: { id: req.params.id } });
  return res.status(204).end();
});
