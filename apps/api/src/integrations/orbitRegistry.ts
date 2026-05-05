import { prisma } from "../prisma";

type OrbitFamilyParent = {
  id: string;
  externalId?: string;
  relation: string;
  parent: {
    firstName: string;
    lastName: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  };
};

type OrbitFamilyChild = {
  id: string;
  externalId?: string;
  studentNumber: string;
  grade: string;
  section: string;
  status: string;
  student: {
    firstName: string;
    lastName: string;
    fullName: string;
    email?: string | null;
  };
};

type OrbitFamily = {
  id: string;
  familyLabel: string;
  studentCount: number;
  parents: OrbitFamilyParent[];
  children: OrbitFamilyChild[];
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

function buildClassName(child: OrbitFamilyChild) {
  return child.section && child.section !== "-"
    ? `${child.grade} - ${child.section}`
    : child.grade;
}

function buildParentLookupKey(parent: OrbitFamilyParent | undefined, familyLabel: string) {
  if (!parent) {
    return `label:${familyLabel.toLowerCase()}`;
  }

  if (parent.parent.email?.trim()) {
    return `email:${parent.parent.email.trim().toLowerCase()}`;
  }

  if (parent.parent.phone?.trim()) {
    return `phone:${parent.parent.phone.trim()}`;
  }

  return `name:${parent.parent.fullName.trim().toLowerCase() || familyLabel.toLowerCase()}`;
}

export function mapOrbitFamiliesToSharedOptions(families: OrbitFamily[]) {
  const classNames = new Set<string>();
  const parents = families.map((family) => {
    const primaryParent = family.parents[0];
    const fullName = primaryParent?.parent.fullName?.trim() || family.familyLabel;
    const phone = primaryParent?.parent.phone?.trim() || "";
    const email = primaryParent?.parent.email?.trim() || "";

    const students = family.children.map((child) => {
      const className = buildClassName(child);
      classNames.add(className);
      return {
        id: child.id,
        externalStudentId: child.externalId,
        fullName: child.student.fullName,
        classId: className,
        className,
        annualFee: 0,
      };
    });

    return {
      lookupKey: buildParentLookupKey(primaryParent, family.familyLabel),
      fullName,
      phone,
      email,
      students,
    };
  });

  const classes = Array.from(classNames).sort((left, right) => left.localeCompare(right));

  return {
    parents,
    classes,
  };
}

async function fetchOrbitFamilies(): Promise<OrbitFamily[]> {
  const baseUrl = (process.env.KCS_ORBIT_API_URL || "").replace(/\/$/, "");
  const organizationId = process.env.KCS_ORBIT_ORGANIZATION_ID || "";
  const apiKey = process.env.KCS_ORBIT_API_KEY || "";

  const response = await fetch(
    `${baseUrl}/api/integration/read/kcs-nexus/families?organizationId=${encodeURIComponent(organizationId)}`,
    {
      headers: {
        "x-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Orbit registry request failed with status ${response.status}`);
  }

  const data = await response.json() as { families?: OrbitFamily[] };
  return Array.isArray(data.families) ? data.families : [];
}

export async function syncOrbitRegistryMirror(schoolId: string) {
  if (!orbitRegistryIsEnabled()) {
    return { parents: [] as SharedParentOption[], classes: [] as Array<{ id: string; name: string; level: string }> };
  }

  const families = await fetchOrbitFamilies();
  const mapped = mapOrbitFamiliesToSharedOptions(families);

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