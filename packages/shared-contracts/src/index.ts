import { z } from "zod";
export * from "./academic-year.js";

const TrimmedStringSchema = z.string().trim().min(1);

export const AppSlugSchema = z.enum([
  "KCS_NEXUS",
  "EDUPAY",
  "EDUSYNCAI",
  "SAVANEX"
]);

export const RegistryEntityTypeSchema = z.enum([
  "family",
  "parent",
  "student",
  "teacher"
]);

export const CanonicalIdAppPrefix = {
  KCS_NEXUS: "KCSNEX",
  EDUPAY: "EDUPAY",
  EDUSYNCAI: "EDUSAI",
  SAVANEX: "SAV"
} as const;

export const CanonicalIdEntityPrefix = {
  family: "FAM",
  parent: "PAR",
  student: "STU",
  teacher: "TEA"
} as const;

export function buildCanonicalExternalId(input: {
  appSlug: z.infer<typeof AppSlugSchema>;
  entityType: z.infer<typeof RegistryEntityTypeSchema>;
  seed?: string;
  now?: Date;
}) {
  const appPrefix = CanonicalIdAppPrefix[input.appSlug];
  const entityPrefix = CanonicalIdEntityPrefix[input.entityType];
  const now = input.now || new Date();
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  ].join("");
  const entropy = (input.seed || Math.random().toString(36).slice(2))
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .padEnd(6, "0")
    .slice(0, 6);

  return `${appPrefix}-${entityPrefix}-${datePart}-${entropy}`;
}

export function pickPreferredExternalId(
  externalIds: Array<{ appSlug: string; externalId: string }>,
  fallback: string,
  priority = ["SAVANEX", "KCS_NEXUS", "EDUPAY", "EDUSYNCAI"]
) {
  for (const appSlug of priority) {
    const match = externalIds.find((entry) => entry.appSlug === appSlug && entry.externalId.trim());
    if (match) {
      return match.externalId.trim();
    }
  }

  return externalIds.find((entry) => entry.externalId.trim())?.externalId.trim() || fallback;
}

export const RoleAudienceSchema = z.enum([
  "ADMIN",
  "STAFF",
  "TEACHER",
  "PARENT",
  "STUDENT"
]);

export const EventVersionSchema = z.string().min(1).default("1.0.0");

export const IntegrationEnvelopeSchema = z.object({
  organizationId: z.string().min(1),
  externalId: z.string().min(1),
  orbitId: z.string().min(1).optional(),
  sourceApp: AppSlugSchema,
  occurredAt: z.string().datetime(),
  version: EventVersionSchema,
  payload: z.record(z.unknown())
});

export const CanonicalIdentitySchema = z.object({
  firstName: TrimmedStringSchema.optional(),
  middleName: TrimmedStringSchema.optional(),
  lastName: TrimmedStringSchema.optional(),
  fullName: TrimmedStringSchema.optional()
}).superRefine((value, ctx) => {
  if (value.fullName) {
    return;
  }

  if (!value.firstName || !value.lastName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either fullName or both firstName and lastName are required",
    });
  }
});

export const StudentPayloadSchema = z.object({
  firstName: TrimmedStringSchema,
  middleName: TrimmedStringSchema.optional(),
  lastName: TrimmedStringSchema,
  gender: TrimmedStringSchema,
  accessCode: TrimmedStringSchema.optional(),
  studentNumber: TrimmedStringSchema.optional(),
  classExternalId: TrimmedStringSchema.optional(),
  className: TrimmedStringSchema.optional(),
  parentExternalId: TrimmedStringSchema.optional(),
  email: z.string().email().optional(),
  phone: TrimmedStringSchema.optional(),
  dateOfBirth: TrimmedStringSchema.optional(),
  status: TrimmedStringSchema.optional(),
  mustChangePassword: z.boolean().optional()
});

export const ClassPayloadSchema = z.object({
  name: z.string().min(1),
  gradeLevel: z.string().min(1).optional(),
  suffix: TrimmedStringSchema.optional(),
  teacherExternalId: z.string().min(1).optional()
});

export const ParentPayloadSchema = z.object({
  firstName: TrimmedStringSchema.optional(),
  middleName: TrimmedStringSchema.optional(),
  lastName: TrimmedStringSchema.optional(),
  fullName: TrimmedStringSchema.optional(),
  accessCode: TrimmedStringSchema.optional(),
  email: z.string().email().optional(),
  phone: TrimmedStringSchema.optional(),
  physicalAddress: TrimmedStringSchema.optional(),
  mustChangePassword: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.fullName || (value.firstName && value.lastName)) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Parent payload requires fullName or firstName and lastName",
  });
});

export const TeacherPayloadSchema = z.object({
  firstName: TrimmedStringSchema.optional(),
  middleName: TrimmedStringSchema.optional(),
  lastName: TrimmedStringSchema.optional(),
  fullName: TrimmedStringSchema.optional(),
  accessCode: TrimmedStringSchema.optional(),
  email: z.string().email().optional(),
  phone: TrimmedStringSchema.optional(),
  physicalAddress: TrimmedStringSchema.optional(),
  subject: TrimmedStringSchema.optional(),
  subjects: z.array(TrimmedStringSchema).optional(),
  employeeId: TrimmedStringSchema.optional(),
  employeeType: TrimmedStringSchema.optional(),
  department: TrimmedStringSchema.optional(),
  jobTitle: TrimmedStringSchema.optional(),
  mustChangePassword: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.fullName || (value.firstName && value.lastName)) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Teacher payload requires fullName or firstName and lastName",
  });
});

export const PaymentPayloadSchema = z.object({
  studentExternalId: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default("USD"),
  motif: z.string().min(1),
  method: z.string().min(1).optional(),
  reference: z.string().min(1).optional(),
  status: z.string().min(1).optional()
});

export const AnnouncementPayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.array(RoleAudienceSchema).min(1),
  priority: z.string().min(1).optional(),
  channel: z.string().min(1).optional()
});

export const GradePayloadSchema = z.object({
  studentExternalId: z.string().min(1),
  subject: z.string().min(1),
  score: z.number(),
  maxScore: z.number().positive(),
  term: z.string().min(1).optional()
});

export const AttendancePayloadSchema = z.object({
  studentExternalId: z.string().min(1),
  date: z.string().datetime(),
  status: z.string().min(1)
});

export const StudentUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: StudentPayloadSchema
});

export const ClassUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: ClassPayloadSchema
});

export const ParentUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: ParentPayloadSchema
});

export const TeacherUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: TeacherPayloadSchema
});

export const PaymentCreatedSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("EDUPAY"),
  payload: PaymentPayloadSchema
});

export const AnnouncementPublishedSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("EDUSYNCAI"),
  payload: AnnouncementPayloadSchema
});

export const GradeUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: GradePayloadSchema
});

export const AttendanceUpsertSchema = IntegrationEnvelopeSchema.extend({
  sourceApp: z.literal("SAVANEX"),
  payload: AttendancePayloadSchema
});

export type AppSlug = z.infer<typeof AppSlugSchema>;
export type RoleAudience = z.infer<typeof RoleAudienceSchema>;
export type IntegrationEnvelope = z.infer<typeof IntegrationEnvelopeSchema>;
export type CanonicalIdentity = z.infer<typeof CanonicalIdentitySchema>;
export type StudentUpsert = z.infer<typeof StudentUpsertSchema>;
export type ClassUpsert = z.infer<typeof ClassUpsertSchema>;
export type ParentUpsert = z.infer<typeof ParentUpsertSchema>;
export type TeacherUpsert = z.infer<typeof TeacherUpsertSchema>;
export type PaymentCreated = z.infer<typeof PaymentCreatedSchema>;
export type AnnouncementPublished = z.infer<typeof AnnouncementPublishedSchema>;
export type GradeUpsert = z.infer<typeof GradeUpsertSchema>;
export type AttendanceUpsert = z.infer<typeof AttendanceUpsertSchema>;

export const DomainEventSchemas = {
  studentUpsert: StudentUpsertSchema,
  classUpsert: ClassUpsertSchema,
  parentUpsert: ParentUpsertSchema,
  teacherUpsert: TeacherUpsertSchema,
  paymentCreated: PaymentCreatedSchema,
  announcementPublished: AnnouncementPublishedSchema,
  gradeUpsert: GradeUpsertSchema,
  attendanceUpsert: AttendanceUpsertSchema
};
