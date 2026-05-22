import { Router } from "express";
import { z } from "zod";
import { authGuard, AuthenticatedRequest, authorize } from "../../middlewares/auth";
import { deleteOrbitTeacher, orbitRegistryIsEnabled, syncOrbitRegistryMirror, updateOrbitTeacher } from "../../integrations/orbitRegistry";
import { getParentFinancialSnapshot } from "../finance/service";
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
  physicalAddress: z.string().trim().min(1).nullable().optional(),
  accessCode: z.string().trim().min(6).max(24).nullable().optional(),
  subject: z.string().trim().min(1).nullable().optional(),
  employeeType: z.string().trim().min(1).nullable().optional(),
  department: z.string().trim().min(1).nullable().optional(),
  jobTitle: z.string().trim().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Au moins un champ doit etre fourni.",
});

const activePlanAssignmentInclude = {
  where: { isActive: true },
  include: {
    tuitionPlan: true,
    financialAgreement: true,
  },
  orderBy: { updatedAt: "desc" as const },
} as const;

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

function resolveDisplayedAnnualFee(student: {
  annualFee?: number | null;
  planAssignments?: Array<{
    expectedTotal?: number | null;
    paymentOptionType?: string | null;
    tuitionPlan?: { name?: string | null; finalAmount?: number | null } | null;
    financialAgreement?: { title?: string | null; customTotal?: number | null } | null;
  }>;
}) {
  const assignment = student.planAssignments?.[0];
  const agreementAmount = assignment?.financialAgreement?.customTotal;
  const expectedTotal = assignment?.expectedTotal;
  const planFinalAmount = assignment?.tuitionPlan?.finalAmount;

  const displayedAnnualFee = Number(
    agreementAmount
      ?? expectedTotal
      ?? planFinalAmount
      ?? student.annualFee
      ?? 0
  );

  return Number.isFinite(displayedAnnualFee) ? displayedAnnualFee : 0;
}

async function buildFinanceStudentLookup(schoolId: string, parentIds: string[]) {
  const snapshots = await Promise.all(parentIds.map(async (parentId) => {
    try {
      return await getParentFinancialSnapshot({ schoolId, parentId });
    } catch {
      return null;
    }
  }));

  return new Map(
    snapshots
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
      .flatMap((snapshot) => snapshot.students.map((student) => [student.id, {
        expectedTotal: Number(student.expectedTotal || 0),
        reductionTotal: Number(student.reductionTotal || 0),
        originalAmount: Number(student.originalAmount || 0),
        paymentOptionType: student.paymentOptionType ?? null,
        planName: student.planName ?? "",
      }] as const))
  );
}

function serializeSharedStudent(student: {
  id: string;
  externalStudentId?: string | null;
  fullName: string;
  classId: string;
  createdAt?: Date | string | null;
  class?: { name?: string | null } | null;
  parentId?: string;
  annualFee?: number | null;
  planAssignments?: Array<{
    paymentOptionType?: string | null;
    tuitionPlan?: { name?: string | null; finalAmount?: number | null } | null;
    financialAgreement?: { title?: string | null; customTotal?: number | null } | null;
    expectedTotal?: number | null;
  }>;
}, schoolId: string, parentId?: string, financeStudent?: {
  expectedTotal: number;
  reductionTotal: number;
  originalAmount: number;
  paymentOptionType: string | null;
  planName: string;
}) {
  const assignment = student.planAssignments?.[0];

  return {
    ...splitFullName(student.fullName),
    id: student.id,
    displayId: student.externalStudentId || student.id,
    studentNumber: student.externalStudentId || student.id,
    externalStudentId: student.externalStudentId || undefined,
    fullName: student.fullName,
    classId: student.classId,
    className: student.class?.name || student.classId,
    createdAt: student.createdAt ? new Date(student.createdAt).toISOString() : undefined,
    parentId,
    organizationId: schoolId,
    externalIds: [],
    annualFee: Number(student.annualFee ?? 0),
    annualFeeDisplay: financeStudent?.expectedTotal ?? resolveDisplayedAnnualFee(student),
    originalAnnualFee: financeStudent?.originalAmount ?? Number(student.annualFee ?? 0),
    reductionTotal: financeStudent?.reductionTotal ?? 0,
    paymentOptionType: financeStudent?.paymentOptionType ?? assignment?.paymentOptionType ?? null,
    tuitionPlanName: financeStudent?.planName ?? assignment?.financialAgreement?.title ?? assignment?.tuitionPlan?.name ?? "",
  };
}

sharedDirectoryRouter.use(authGuard);

sharedDirectoryRouter.get("/", async (req: AuthenticatedRequest, res) => {
  if (orbitRegistryIsEnabled()) {
    const mirrored = await syncOrbitRegistryMirror(req.user!.schoolId);
    const financeStudentLookup = await buildFinanceStudentLookup(req.user!.schoolId, mirrored.parents.map((parent) => parent.id));
    const mirroredStudentIds = mirrored.parents.flatMap((parent) => parent.students.map((student) => student.id));
    const localStudents = mirroredStudentIds.length
      ? await prisma.student.findMany({
        where: { schoolId: req.user!.schoolId, id: { in: mirroredStudentIds } },
        include: {
          class: true,
          planAssignments: activePlanAssignmentInclude,
        },
      })
      : [];
    const localStudentById = new Map(localStudents.map((student) => [student.id, student]));
    const parents = mirrored.parents.map((parent) => ({
      ...parent,
      students: parent.students.map((student) => serializeSharedStudent(localStudentById.get(student.id) ?? {
        ...student,
        class: { name: student.className },
        parentId: parent.id,
      }, req.user!.schoolId, parent.id, financeStudentLookup.get(student.id))),
    }));
    const students = parents.flatMap((parent) => parent.students);

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
      parents,
      students,
      teachers: mirrored.teachers,
    });
  }

  const [parents, students] = await Promise.all([
    prisma.parent.findMany({
      where: { schoolId: req.user!.schoolId },
      include: {
        students: {
          include: {
            class: true,
            planAssignments: activePlanAssignmentInclude,
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.student.findMany({
      where: { schoolId: req.user!.schoolId },
      include: {
        class: true,
        planAssignments: activePlanAssignmentInclude,
      },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const financeStudentLookup = await buildFinanceStudentLookup(req.user!.schoolId, parents.map((parent) => parent.id));

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
      physicalAddress: parent.physicalAddress,
      students: parent.students.map((student) => serializeSharedStudent(student, req.user!.schoolId, parent.id, financeStudentLookup.get(student.id))),
    })),
    students: students.map((student) => serializeSharedStudent(student, req.user!.schoolId, student.parentId, financeStudentLookup.get(student.id))),
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
