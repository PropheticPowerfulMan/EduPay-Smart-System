import { z } from "zod";

const TrimmedStringSchema = z.string().trim().min(1);

export const AcademicProgressionDecisionSchema = z.enum([
  "AUTO",
  "PROMOTE",
  "REPEAT",
  "MANUAL_TRANSFER",
  "HOLD",
  "GRADUATE"
]);

export const AcademicProgressionStudentSchema = z.object({
  id: TrimmedStringSchema,
  firstName: TrimmedStringSchema.optional(),
  lastName: TrimmedStringSchema.optional(),
  classId: TrimmedStringSchema.nullable().optional(),
  className: TrimmedStringSchema.nullable().optional(),
  status: TrimmedStringSchema.nullable().optional(),
  averagePercent: z.number().min(0).max(100).nullable().optional()
});

export const AcademicProgressionClassSchema = z.object({
  id: TrimmedStringSchema,
  name: TrimmedStringSchema,
  gradeLevel: TrimmedStringSchema.nullable().optional(),
  suffix: TrimmedStringSchema.nullable().optional()
});

export const AcademicProgressionOverrideSchema = z.object({
  studentId: TrimmedStringSchema,
  decision: AcademicProgressionDecisionSchema,
  targetClassId: TrimmedStringSchema.optional(),
  targetClassName: TrimmedStringSchema.optional(),
  reason: TrimmedStringSchema.optional()
});

export type AcademicProgressionDecision = z.infer<typeof AcademicProgressionDecisionSchema>;
export type AcademicProgressionStudent = z.infer<typeof AcademicProgressionStudentSchema>;
export type AcademicProgressionClass = z.infer<typeof AcademicProgressionClassSchema>;
export type AcademicProgressionOverride = z.infer<typeof AcademicProgressionOverrideSchema>;

export type AcademicYearWindow = {
  academicYear: string;
  startDate: string;
  endDate: string;
  rolloverDate: string;
  isRolloverWindow: boolean;
};

export type AcademicProgressionAction =
  | "PROMOTE"
  | "REPEAT"
  | "MANUAL_TRANSFER"
  | "HOLD"
  | "GRADUATE";

export type AcademicProgressionPlanItem = {
  studentId: string;
  studentName: string;
  decision: AcademicProgressionDecision;
  action: AcademicProgressionAction;
  fromClassId: string | null;
  fromClassName: string | null;
  toClassId: string | null;
  toClassName: string | null;
  status: string | null;
  averagePercent: number | null;
  passThreshold: number;
  eventType: "student.promoted" | "student.repeated" | "student.manually_transferred" | "student.held" | "student.graduated";
  warnings: string[];
};

export type AcademicProgressionPlan = {
  academicYear: string;
  nextAcademicYear: string;
  effectiveDate: string;
  isRolloverWindow: boolean;
  counts: Record<AcademicProgressionAction, number>;
  items: AcademicProgressionPlanItem[];
  warnings: string[];
};

type ParsedClass = {
  stage: "K" | "GRADE";
  level: number;
  suffix: string | null;
};

const gradePatterns = [
  /\bgrade\s*(\d{1,2})\b/i,
  /\bclass\s*(\d{1,2})\b/i,
  /\bprimary\s*(\d{1,2})\b/i,
  /\bsecondary\s*(\d{1,2})\b/i,
  /\bg(\d{1,2})\b/i,
  /\bp(\d{1,2})\b/i,
  /\bs(\d{1,2})\b/i
];

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function titleCaseSuffix(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.toUpperCase() : null;
}

function buildStudentName(student: AcademicProgressionStudent) {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || student.id;
}

export function getAcademicYearWindow(inputDate = new Date()): AcademicYearWindow {
  const month = inputDate.getUTCMonth();
  const year = inputDate.getUTCFullYear();
  const startYear = month >= 8 ? year : year - 1;
  const startDate = new Date(Date.UTC(startYear, 8, 1));
  const endDate = new Date(Date.UTC(startYear + 1, 5, 30));
  const rolloverDate = new Date(Date.UTC(startYear + 1, 6, 1));
  const rolloverWindowEnd = new Date(Date.UTC(startYear + 1, 8, 30, 23, 59, 59));

  return {
    academicYear: `${startYear}-${startYear + 1}`,
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
    rolloverDate: toIsoDate(rolloverDate),
    isRolloverWindow: inputDate >= rolloverDate && inputDate <= rolloverWindowEnd
  };
}

export function parseAcademicClassName(className: string | null | undefined): ParsedClass | null {
  const value = String(className || "").trim();
  if (!value) {
    return null;
  }

  const suffixMatch = value.match(/\b([A-Z])\b$/i);
  const suffix = titleCaseSuffix(suffixMatch?.[1]);
  const kindergartenMatch = value.match(/\b(?:k|kg|kindergarten)\s*([3-5])\b/i);
  if (kindergartenMatch) {
    return { stage: "K", level: Number(kindergartenMatch[1]), suffix };
  }

  for (const pattern of gradePatterns) {
    const match = value.match(pattern);
    if (match) {
      return { stage: "GRADE", level: Number(match[1]), suffix };
    }
  }

  const bareNumber = value.match(/^(\d{1,2})(?:\s*[- ]?\s*([A-Z]))?$/i);
  if (bareNumber) {
    return { stage: "GRADE", level: Number(bareNumber[1]), suffix: titleCaseSuffix(bareNumber[2]) };
  }

  return null;
}

export function getNextAcademicClassName(className: string | null | undefined): string | null {
  const parsed = parseAcademicClassName(className);
  if (!parsed) {
    return null;
  }

  const suffix = parsed.suffix ? ` ${parsed.suffix}` : "";
  if (parsed.stage === "K") {
    return parsed.level < 5 ? `K${parsed.level + 1}${suffix}` : `Grade 1${suffix}`;
  }

  if (parsed.level >= 12) {
    return null;
  }

  return `Grade ${parsed.level + 1}${suffix}`;
}

function findClassById(classes: AcademicProgressionClass[], classId: string | null | undefined) {
  return classId ? classes.find((klass) => klass.id === classId) || null : null;
}

function findClassByName(classes: AcademicProgressionClass[], className: string | null | undefined) {
  const key = normalizeKey(className);
  if (!key) {
    return null;
  }

  return classes.find((klass) => normalizeKey(klass.name) === key || normalizeKey(klass.gradeLevel) === key) || null;
}

function resolveCurrentClass(student: AcademicProgressionStudent, classes: AcademicProgressionClass[]) {
  const byId = findClassById(classes, student.classId);
  const byName = findClassByName(classes, student.className);
  return {
    classId: byId?.id || student.classId || byName?.id || null,
    className: byId?.name || student.className || byName?.name || null
  };
}

function resolveTargetClass(classes: AcademicProgressionClass[], className: string | null, classId?: string) {
  const byId = findClassById(classes, classId);
  if (byId) {
    return { classId: byId.id, className: byId.name };
  }

  const byName = findClassByName(classes, className);
  return {
    classId: byName?.id || null,
    className: byName?.name || className
  };
}

export function buildAcademicProgressionPlan(input: {
  students: AcademicProgressionStudent[];
  classes: AcademicProgressionClass[];
  overrides?: AcademicProgressionOverride[];
  effectiveDate?: Date;
  passThreshold?: number;
}): AcademicProgressionPlan {
  const students = z.array(AcademicProgressionStudentSchema).parse(input.students);
  const classes = z.array(AcademicProgressionClassSchema).parse(input.classes);
  const overrides = z.array(AcademicProgressionOverrideSchema).parse(input.overrides || []);
  const effectiveDate = input.effectiveDate || new Date();
  const passThreshold = input.passThreshold ?? 70;
  const window = getAcademicYearWindow(effectiveDate);
  const nextWindow = getAcademicYearWindow(new Date(Date.UTC(effectiveDate.getUTCFullYear() + 1, 8, 1)));
  const overridesByStudent = new Map(overrides.map((override) => [override.studentId, override]));
  const warnings: string[] = [];
  const counts: Record<AcademicProgressionAction, number> = {
    PROMOTE: 0,
    REPEAT: 0,
    MANUAL_TRANSFER: 0,
    HOLD: 0,
    GRADUATE: 0
  };

  const items = students.map((student): AcademicProgressionPlanItem => {
    const override = overridesByStudent.get(student.id);
    const decision = override?.decision || "AUTO";
    const current = resolveCurrentClass(student, classes);
    const itemWarnings: string[] = [];
    let action: AcademicProgressionAction = "PROMOTE";
    let target = { classId: null as string | null, className: null as string | null };
    let status = student.status || null;

    if (decision === "HOLD") {
      action = "HOLD";
      target = { classId: current.classId, className: current.className };
    } else if (decision === "REPEAT") {
      action = "REPEAT";
      target = { classId: current.classId, className: current.className };
    } else if (decision === "MANUAL_TRANSFER") {
      action = "MANUAL_TRANSFER";
      target = resolveTargetClass(classes, override?.targetClassName || null, override?.targetClassId);
      if (!target.className) {
        itemWarnings.push("MANUAL_TRANSFER_REQUIRES_TARGET_CLASS");
      }
    } else if (decision === "GRADUATE") {
      action = "GRADUATE";
      status = "GRADUATED";
      target = { classId: null, className: "Graduated" };
    } else {
      const averagePercent = student.averagePercent ?? null;
      if (averagePercent === null) {
        action = "HOLD";
        target = { classId: current.classId, className: current.className };
        itemWarnings.push("PASS_AVERAGE_MISSING");
      } else if (averagePercent < passThreshold) {
        action = "REPEAT";
        target = { classId: current.classId, className: current.className };
        itemWarnings.push("PASS_THRESHOLD_NOT_MET");
      } else {
      const nextClassName = getNextAcademicClassName(current.className);
      if (!nextClassName) {
        const parsed = parseAcademicClassName(current.className);
        if (parsed?.stage === "GRADE" && parsed.level >= 12) {
          action = "GRADUATE";
          status = "GRADUATED";
          target = { classId: null, className: "Graduated" };
        } else {
          action = "HOLD";
          target = { classId: current.classId, className: current.className };
          itemWarnings.push("CLASS_LEVEL_COULD_NOT_BE_PARSED");
        }
      } else {
        target = resolveTargetClass(classes, nextClassName);
        if (!target.classId) {
          itemWarnings.push("TARGET_CLASS_NOT_IN_CATALOG");
        }
      }
      }
    }

    counts[action] += 1;
    if (itemWarnings.length > 0) {
      warnings.push(`${student.id}: ${itemWarnings.join(", ")}`);
    }

    const eventType = action === "PROMOTE"
      ? "student.promoted"
      : action === "REPEAT"
        ? "student.repeated"
        : action === "MANUAL_TRANSFER"
          ? "student.manually_transferred"
          : action === "GRADUATE"
            ? "student.graduated"
            : "student.held";

    return {
      studentId: student.id,
      studentName: buildStudentName(student),
      decision,
      action,
      fromClassId: current.classId,
      fromClassName: current.className,
      toClassId: target.classId,
      toClassName: target.className,
      status,
      averagePercent: student.averagePercent ?? null,
      passThreshold,
      eventType,
      warnings: itemWarnings
    };
  });

  return {
    academicYear: window.academicYear,
    nextAcademicYear: nextWindow.academicYear,
    effectiveDate: toIsoDate(effectiveDate),
    isRolloverWindow: window.isRolloverWindow,
    counts,
    items,
    warnings
  };
}
