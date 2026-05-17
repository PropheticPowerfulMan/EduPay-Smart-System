import { Router } from "express";
import { z } from "zod";
import { authGuard, AuthenticatedRequest, authorize } from "../../middlewares/auth";
import { deleteOrbitTeacher, orbitRegistryIsEnabled, syncOrbitRegistryMirror, updateOrbitTeacher } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";

export const sharedDirectoryRouter = Router();

const employeeWriteRoles = ["SUPER_ADMIN", "OWNER", "ADMIN", "HR_MANAGER"] as const;

const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).nullable().optional(),
  middleName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  accessCode: z.string().trim().min(6).max(24).nullable().optional(),
  subject: z.string().trim().min(1).nullable().optional(),
  employeeId: z.string().trim().min(1).nullable().optional(),
  employeeType: z.string().trim().min(1).nullable().optional(),
  department: z.string().trim().min(1).nullable().optional(),
  jobTitle: z.string().trim().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Au moins un champ doit etre fourni.",
});

function splitFullName(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", middleName: null as string | null, lastName: "" };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: null as string | null, lastName: "" };
  }

  if (parts.length === 2) {
    return { firstName: parts[0], middleName: null as string | null, lastName: parts[1] };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

sharedDirectoryRouter.use(authGuard);

sharedDirectoryRouter.get("/", async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
    const students = mirrored.parents.flatMap((parent) => parent.students);
    return res.json({
      source: "orbit",
      visibility: "shared-directory",
      counts: mirrored.counts,
      families: mirrored.parents.map((parent) => ({
        id: parent.id,
        displayId: parent.displayId || parent.id,
        familyLabel: `${splitFullName(parent.fullName).lastName || parent.fullName} Family`,
        parentIds: [parent.id],
        studentIds: parent.students.map((student) => student.id),
        organizationId: req.user!.schoolId,
        externalIds: [],
      })),
      parents: mirrored.parents,
      students,
      teachers: mirrored.teachers,
    });
  }

  const [parents, students] = await Promise.all([
    prisma.parent.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { students: { include: { class: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.student.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { class: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return res.json({
    source: "local",
    visibility: "shared-directory",
    counts: {
      families: parents.length,
      parents: parents.length,
      students: students.length,
      teachers: 0,
    },
    families: parents.map((parent) => ({
      id: parent.id,
      displayId: parent.id,
      familyLabel: `${splitFullName(parent.fullName).lastName || parent.fullName} Family`,
      parentIds: [parent.id],
      studentIds: parent.students.map((student) => student.id),
      organizationId: req.user!.schoolId,
      externalIds: [],
    })),
    parents: parents.map((parent) => ({
      ...splitFullName(parent.fullName),
      id: parent.id,
      displayId: parent.id,
      fullName: parent.fullName,
      studentIds: parent.students.map((student) => student.id),
      organizationId: req.user!.schoolId,
      externalIds: [],
      phone: parent.phone,
      email: parent.email,
      students: parent.students.map((student) => ({
        ...splitFullName(student.fullName),
        id: student.id,
        studentNumber: student.externalStudentId || student.id,
        externalStudentId: student.externalStudentId || undefined,
        fullName: student.fullName,
        classId: student.classId,
        className: student.class?.name || student.classId,
        parentId: parent.id,
        organizationId: req.user!.schoolId,
        externalIds: [],
        annualFee: student.annualFee,
      })),
    })),
    students: students.map((student) => ({
      ...splitFullName(student.fullName),
      id: student.id,
      displayId: student.externalStudentId || student.id,
      studentNumber: student.externalStudentId || student.id,
      externalStudentId: student.externalStudentId || undefined,
      fullName: student.fullName,
      classId: student.classId,
      className: student.class?.name || student.classId,
      parentId: student.parentId,
      organizationId: req.user!.schoolId,
      externalIds: [],
      annualFee: student.annualFee,
    })),
    teachers: [],
  });
});

sharedDirectoryRouter.get("/teachers", async (req: AuthenticatedRequest, res) => {
  if (!orbitRegistryIsEnabled()) {
    return res.json([]);
  }

  const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
  return res.json(mirrored.teachers);
});

sharedDirectoryRouter.put("/teachers/:id", authorize(...employeeWriteRoles), async (req: AuthenticatedRequest, res) => {
  if (!orbitRegistryIsEnabled()) {
    return res.status(400).json({ message: "La synchronisation des employes n'est pas activee sur cet environnement." });
  }

  const payload = updateEmployeeSchema.parse(req.body);
  const result = await updateOrbitTeacher(req.params.id, payload);
  return res.json(result);
});

sharedDirectoryRouter.delete("/teachers/:id", authorize(...employeeWriteRoles), async (req: AuthenticatedRequest, res) => {
  if (!orbitRegistryIsEnabled()) {
    return res.status(400).json({ message: "La synchronisation des employes n'est pas activee sur cet environnement." });
  }

  const result = await deleteOrbitTeacher(req.params.id);
  return res.json(result);
});
