import { prisma } from "../prisma";

type OrbitSharedDirectory = {
  source: "orbit";
  visibility: "shared-directory";
  parents: Array<{
    id: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    studentIds: string[];
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
  students: Array<{
    id: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    studentNumber?: string;
    classId?: string | null;
    className?: string | null;
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
  teachers: Array<{
    id: string;
    fullName: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    externalIds: Array<{ appSlug: string; externalId: string }>;
  }>;
};

export type SharedStudentOption = {
  id: string;
  externalStudentId?: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

export type SharedParentOption = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  students: SharedStudentOption[];
};

export function orbitRegistryIsEnabled() {
  return Boolean(process.env.KCS_ORBIT_API_URL && process.env.KCS_ORBIT_API_KEY && process.env.KCS_ORBIT_ORGANIZATION_ID);
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
        return {
          id: student.id,
          externalStudentId: student.externalIds.find((item) => item.appSlug === "SAVANEX")?.externalId || student.externalIds[0]?.externalId,
          fullName: student.fullName,
          classId: className,
          className,
          annualFee: 0,
        };
      });

    return {
      lookupKey: buildParentLookupKey({ fullName: parent.fullName }),
      fullName: parent.fullName,
      phone: "",
      email: "",
      students,
    };
  });

  const classes = Array.from(classNames).sort((left, right) => left.localeCompare(right));

  return {
    parents,
    classes,
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

export async function syncOrbitRegistryMirror(schoolId: string) {
  if (!orbitRegistryIsEnabled()) {
    return { parents: [] as SharedParentOption[], classes: [] as Array<{ id: string; name: string; level: string }> };
  }

  const directory = await fetchOrbitSharedDirectory();
  const mapped = mapOrbitDirectoryToSharedOptions(directory);

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

  const parents = await prisma.parent.findMany({
    where: { schoolId },
    include: { students: { include: { class: true } } },
    orderBy: { fullName: "asc" },
  });

  const classes = await prisma.class.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });

  return {
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
        className: student.class.name,
        annualFee: student.annualFee,
      })),
    })),
    classes,
  };
}