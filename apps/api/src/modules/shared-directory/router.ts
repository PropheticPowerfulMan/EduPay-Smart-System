import { Router } from "express";
import { authGuard, AuthenticatedRequest } from "../../middlewares/auth";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";

export const sharedDirectoryRouter = Router();

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
    return res.json({
      source: "orbit",
      visibility: "shared-directory",
      parents: mirrored.parents,
      students: mirrored.parents.flatMap((parent) => parent.students),
      teachers: [],
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
    parents: parents.map((parent) => ({
      ...splitFullName(parent.fullName),
      id: parent.id,
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