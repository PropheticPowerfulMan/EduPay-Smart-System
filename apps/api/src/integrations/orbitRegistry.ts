import { prisma } from "../prisma";

type OrbitSharedDirectory = {
  source: "orbit";
  visibility: "shared-directory";
  counts?: {
    families: number;
    parents: number;
    students: number;
    teachers: number;
  };
  families?: Array<{
    id: string;
    displayId?: string;
    familyLabel: string;
    parentIds: string[];
    studentIds: string[];
    organizationId?: string | null;
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
  parents: Array<{
    id: string;
    displayId?: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    organizationId?: string | null;
    phone?: string | null;
    email?: string | null;
    mustChangePassword?: boolean;
    studentIds: string[];
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
  students: Array<{
    id: string;
    displayId?: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    studentNumber?: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    status?: string | null;
    mustChangePassword?: boolean;
    classId?: string | null;
    className?: string | null;
    parentId?: string | null;
    organizationId?: string | null;
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
  teachers: Array<{
    id: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    phone?: string | null;
    email?: string | null;
    subject?: string | null;
    employeeId?: string | null;
    employeeType?: string | null;
    department?: string | null;
    jobTitle?: string | null;
    mustChangePassword?: boolean;
    organizationId?: string | null;
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
};

export type SharedStudentOption = {
  id: string;
  orbitId?: string;
  displayId?: string;
  externalStudentId?: string;
  studentNumber?: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  status?: string | null;
  mustChangePassword?: boolean;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

export type SharedParentOption = {
  id: string;
  orbitId?: string;
  displayId?: string;
  createdAt?: Date;
  fullName: string;
  phone: string;
  email: string;
  students: SharedStudentOption[];
};

export function orbitRegistryIsEnabled() {
  return Boolean(process.env.KCS_ORBIT_API_URL && process.env.KCS_ORBIT_API_KEY && process.env.KCS_ORBIT_ORGANIZATION_ID);
}

export function matchesSharedParentIdentifier(parent: SharedParentOption, identifier: string) {
  const normalizedIdentifier = identifier.trim();
  return parent.id === normalizedIdentifier || parent.displayId === normalizedIdentifier || parent.orbitId === normalizedIdentifier;
}

function buildParentLookupKey(parent: { fullName: string; email?: string; phone?: string }) {
  if (parent.email?.trim()) {
    return `email:${parent.email.trim().toLowerCase()}`;
  }

  if (parent.phone?.trim()) {
    return `phone:${parent.phone.trim()}`;
  }

  return `name:${parent.fullName.trim().toLowerCase()}`;
}

function pickSharedStudentId(student: OrbitSharedDirectory["students"][number]) {
  if (student.displayId?.trim()) return student.displayId.trim();

  const priority = ["SAVANEX", "KCS_NEXUS", "EDUSYNCAI", "EDUPAY"];
  for (const appSlug of priority) {
    const match = student.externalIds.find((item) => item.appSlug === appSlug)?.externalId;
    if (match?.trim()) return match.trim();
  }

  return student.studentNumber?.trim() || student.id;
}

export function mapOrbitDirectoryToSharedOptions(directory: OrbitSharedDirectory) {
  const classNames = new Set<string>();
  const studentsById = new Map(directory.students.map((student) => [student.id, student]));

  const parents = directory.parents.map((parent) => {
    const students = parent.studentIds
      .map((studentId) => studentsById.get(studentId))
      .filter((student): student is OrbitSharedDirectory["students"][number] => Boolean(student))
      .map((student) => {
        const className = student.className || student.classId || "Classe non renseignee";
        classNames.add(className);
        const displayId = pickSharedStudentId(student);
        return {
          id: student.id,
          orbitId: student.id,
          displayId,
          externalStudentId: displayId,
          studentNumber: student.studentNumber,
          email: student.email,
          phone: student.phone,
          dateOfBirth: student.dateOfBirth,
          status: student.status,
          mustChangePassword: student.mustChangePassword,
          fullName: student.fullName,
          classId: className,
          className,
          annualFee: 0,
        };
      });

    const displayId = parent.displayId || parent.externalIds.find((item) => item.externalId)?.externalId || parent.id;

    return {
      id: displayId,
      orbitId: parent.id,
      displayId,
      lookupKey: buildParentLookupKey({
        fullName: parent.fullName,
        email: parent.email || undefined,
        phone: parent.phone || undefined,
      }),
      fullName: parent.fullName,
      phone: parent.phone || "",
      email: parent.email || "",
      students,
    };
  });

  const classes = Array.from(classNames).sort((left, right) => left.localeCompare(right));

  return {
    parents,
    classes,
    counts: directory.counts ?? {
      families: directory.families?.length ?? parents.length,
      parents: directory.parents.length,
      students: directory.students.length,
      teachers: directory.teachers.length,
    },
  };
}

async function fetchOrbitSharedDirectory(): Promise<OrbitSharedDirectory> {
  const baseUrl = (process.env.KCS_ORBIT_API_URL || "").replace(/\/$/, "");
  const organizationId = process.env.KCS_ORBIT_ORGANIZATION_ID || "";
  const apiKey = process.env.KCS_ORBIT_API_KEY || "";

  const response = await fetch(
    `${baseUrl}/api/integration/read/shared-directory?organizationId=${encodeURIComponent(organizationId)}`,
    {
      headers: {
        "x-api-key": apiKey,
        "x-app-slug": "EDUPAY",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Orbit registry request failed with status ${response.status}`);
  }

  return response.json() as Promise<OrbitSharedDirectory>;
}

async function orbitRegistryRequest<T>(path: string, init: RequestInit): Promise<T> {
  const baseUrl = (process.env.KCS_ORBIT_API_URL || "").replace(/\/$/, "");
  const organizationId = process.env.KCS_ORBIT_ORGANIZATION_ID || "";
  const apiKey = process.env.KCS_ORBIT_API_KEY || "";
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${baseUrl}${path}${separator}organizationId=${encodeURIComponent(organizationId)}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-app-slug": "EDUPAY",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => null) as T & { message?: string };
  if (!response.ok) {
    throw new Error(data?.message || `Orbit registry request failed with status ${response.status}`);
  }
  return data as T;
}

export async function createOrbitParent(payload: {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  students?: Array<{ fullName: string; className?: string }>;
}) {
  const organizationId = process.env.KCS_ORBIT_ORGANIZATION_ID || "";
  const students = payload.students || [];
  if (students.length > 0) {
    const [parentFirstName, ...parentLastNameParts] = payload.fullName.trim().split(/\s+/);
    return orbitRegistryRequest<{ orbitId: string; parentExternalId: string; externalId: string }>("/api/integration/registry/family", {
      method: "POST",
      body: JSON.stringify({
        organizationId,
        parent: {
          fullName: payload.fullName,
          firstName: payload.firstName || parentFirstName,
          lastName: payload.lastName || parentLastNameParts.join(" ") || "Parent",
          email: payload.email,
          phone: payload.phone,
        },
        students: students.map((student) => {
          const [firstName, ...lastNameParts] = student.fullName.trim().split(/\s+/);
          return {
            firstName: firstName || "Student",
            lastName: lastNameParts.join(" ") || "Student",
            gender: "O",
            className: student.className || "Non renseignee",
          };
        }),
      }),
    });
  }

  return orbitRegistryRequest<{ orbitId: string; externalId: string }>("/api/integration/registry/parent", {
    method: "POST",
    body: JSON.stringify({
      organizationId,
      fullName: payload.fullName,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
    }),
  });
}

export async function updateOrbitParent(identifier: string, payload: { fullName?: string; firstName?: string; lastName?: string; email?: string; phone?: string }) {
  return orbitRegistryRequest<{ orbitId: string; updated: boolean }>(`/api/integration/registry/parent/${encodeURIComponent(identifier)}?identifierType=orbitId`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteOrbitParent(identifier: string) {
  return orbitRegistryRequest<{ orbitId: string; deleted: boolean }>(`/api/integration/registry/parent/${encodeURIComponent(identifier)}?identifierType=orbitId`, {
    method: "DELETE",
  });
}

export async function syncOrbitRegistryMirror(schoolId: string) {
  if (!orbitRegistryIsEnabled()) {
    return { parents: [] as SharedParentOption[], classes: [] as Array<{ id: string; name: string; level: string }>, counts: { families: 0, parents: 0, students: 0, teachers: 0 } };
  }

  const directory = await fetchOrbitSharedDirectory();
  const mapped = mapOrbitDirectoryToSharedOptions(directory);
  const activeParentLookupKeys = new Set(mapped.parents.map((parent) => parent.lookupKey));
  const activeExternalStudentIds = new Set(
    mapped.parents
      .flatMap((parent) => parent.students)
      .map((student) => student.externalStudentId)
      .filter((externalStudentId): externalStudentId is string => Boolean(externalStudentId))
  );

  const classIdByName = new Map<string, string>();
  for (const className of mapped.classes) {
    const classRecord = await prisma.class.upsert({
      where: { schoolId_name: { schoolId, name: className } },
      update: { level: className.split(" - ")[0] || className },
      create: {
        schoolId,
        name: className,
        level: className.split(" - ")[0] || className,
      },
    });
    classIdByName.set(className, classRecord.id);
  }

  const parentIdByLookupKey = new Map<string, string>();
  const mappedParentByLookupKey = new Map(mapped.parents.map((parent) => [parent.lookupKey, parent]));
  for (const parent of mapped.parents) {
    const existingParent = parent.email
      ? await prisma.parent.findFirst({ where: { schoolId, email: parent.email } })
      : parent.phone
        ? await prisma.parent.findFirst({ where: { schoolId, phone: parent.phone } })
        : await prisma.parent.findFirst({ where: { schoolId, fullName: parent.fullName } });

    const savedParent = existingParent
      ? await prisma.parent.update({
        where: { id: existingParent.id },
        data: {
          fullName: parent.fullName,
          phone: parent.phone,
          email: parent.email,
        },
      })
      : await prisma.parent.create({
        data: {
          schoolId,
          fullName: parent.fullName,
          phone: parent.phone,
          email: parent.email,
          preferredLanguage: "fr",
        },
      });

    parentIdByLookupKey.set(parent.lookupKey, savedParent.id);

    for (const student of parent.students) {
      const classId = classIdByName.get(student.className);
      if (!classId) {
        continue;
      }

      if (student.externalStudentId) {
        await prisma.student.upsert({
          where: { schoolId_externalStudentId: { schoolId, externalStudentId: student.externalStudentId } },
          update: {
            fullName: student.fullName,
            parentId: savedParent.id,
            classId,
            annualFee: student.annualFee,
          },
          create: {
            schoolId,
            parentId: savedParent.id,
            classId,
            externalStudentId: student.externalStudentId,
            fullName: student.fullName,
            annualFee: student.annualFee,
          },
        });
        continue;
      }

      const existingStudent = await prisma.student.findFirst({
        where: {
          schoolId,
          parentId: savedParent.id,
          fullName: student.fullName,
        },
      });

      if (existingStudent) {
        await prisma.student.update({
          where: { id: existingStudent.id },
          data: {
            classId,
            annualFee: student.annualFee,
          },
        });
      } else {
        await prisma.student.create({
          data: {
            schoolId,
            parentId: savedParent.id,
            classId,
            fullName: student.fullName,
            annualFee: student.annualFee,
          },
        });
      }
    }
  }

  const activeExternalStudentIdList = Array.from(activeExternalStudentIds);
  await prisma.student.deleteMany({
    where: {
      schoolId,
      externalStudentId: { not: null },
      ...(activeExternalStudentIdList.length > 0
        ? { NOT: { externalStudentId: { in: activeExternalStudentIdList } } }
        : {}),
    },
  });

  const mirroredParents = await prisma.parent.findMany({
    where: { schoolId },
    include: { students: { select: { id: true } } },
  });

  for (const parent of mirroredParents) {
    const lookupKey = buildParentLookupKey({
      fullName: parent.fullName,
      email: parent.email,
      phone: parent.phone,
    });

    if (!activeParentLookupKeys.has(lookupKey) && parent.students.length === 0) {
      await prisma.parent.deleteMany({ where: { id: parent.id, schoolId } });
    }
  }

  const activeParentIds = Array.from(parentIdByLookupKey.values());
  const parents = activeParentIds.length > 0
    ? await prisma.parent.findMany({
      where: {
        schoolId,
        id: { in: activeParentIds },
      },
      include: { students: { include: { class: true } } },
    })
    : [];

  const parentById = new Map(parents.map((parent) => [parent.id, parent]));
  const orderedParents = mapped.parents
    .map((parent) => {
      const parentId = parentIdByLookupKey.get(parent.lookupKey);
      return parentId ? parentById.get(parentId) : null;
    })
    .filter((parent): parent is NonNullable<typeof parent> => Boolean(parent));

  const classes = mapped.classes.length > 0
    ? await prisma.class.findMany({
      where: {
        schoolId,
        name: { in: mapped.classes },
      },
      orderBy: { name: "asc" },
    })
    : [];

  return {
    parents: orderedParents.map((parent) => ({
      id: parent.id,
      orbitId: mappedParentByLookupKey.get(buildParentLookupKey({
        fullName: parent.fullName,
        email: parent.email,
        phone: parent.phone,
      }))?.orbitId,
      displayId: mappedParentByLookupKey.get(buildParentLookupKey({
        fullName: parent.fullName,
        email: parent.email,
        phone: parent.phone,
      }))?.displayId || parent.id,
      createdAt: parent.createdAt,
      fullName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      students: parent.students.map((student) => ({
        id: student.id,
        displayId: student.externalStudentId || student.id,
        externalStudentId: student.externalStudentId || undefined,
        studentNumber: student.externalStudentId || undefined,
        fullName: student.fullName,
        classId: student.classId,
        className: student.class.name,
        annualFee: student.annualFee,
      })),
    })),
    classes,
    counts: {
      families: orderedParents.length,
      parents: orderedParents.length,
      students: orderedParents.reduce((total, parent) => total + parent.students.length, 0),
      teachers: mapped.counts.teachers,
    },
  };
}
