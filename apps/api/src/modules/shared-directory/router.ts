import { Router } from "express";
import { authGuard, AuthenticatedRequest } from "../../middlewares/auth";
import { orbitRegistryIsEnabled, syncOrbitRegistryMirror } from "../../integrations/orbitRegistry";
import { prisma } from "../../prisma";

export const sharedDirectoryRouter = Router();

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
      id: parent.id,
      fullName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      students: parent.students.map((student) => ({
        id: student.id,
        externalStudentId: student.externalStudentId || undefined,
        fullName: student.fullName,
        classId: student.classId,
        className: student.class?.name || student.classId,
        annualFee: student.annualFee,
      })),
    })),
    students: students.map((student) => ({
      id: student.id,
      externalStudentId: student.externalStudentId || undefined,
      fullName: student.fullName,
      classId: student.classId,
      className: student.class?.name || student.classId,
      annualFee: student.annualFee,
    })),
    teachers: [],
  });
});