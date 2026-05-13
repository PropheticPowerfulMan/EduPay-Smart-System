import {
  AgreementStatus,
  DebtStatus,
  FinancialAlertType,
  GradeGroup,
  InstallmentStatus,
  NotificationChannel,
  NotificationType,
  PaymentOptionType,
  PaymentStatus,
  Prisma,
  ReductionScope,
  ReportType
} from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "../../prisma";
import { sendEmail, sendSms } from "../../utils/messaging";

type DbClient = typeof prisma | Prisma.TransactionClient;

type ScheduleTemplate = {
  label: string;
  periodKey: string;
  amount: number;
  dueMonth: number;
  dueDay: number;
  windowLabel?: string;
};

type OfficialPlanTemplate = {
  code: string;
  name: string;
  paymentOptionType: PaymentOptionType;
  discountRate: number;
  originalAmount: number;
  reductionAmount: number;
  finalAmount: number;
  schedule: ScheduleTemplate[];
};

type SnapshotInstallment = {
  id: string;
  persistedId: string | null;
  label: string;
  periodKey: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: InstallmentStatus;
  isOverdue: boolean;
  source: "persisted" | "derived";
  planCode: string | null;
  paymentOptionType: PaymentOptionType;
  studentId: string | null;
  studentName: string;
  gradeGroup: GradeGroup;
};

const OFFICIAL_ACADEMIC_YEAR_NAME = "2026-2027";
const OFFICIAL_ACADEMIC_YEAR_START = "2026-08-01T00:00:00.000Z";
const OFFICIAL_ACADEMIC_YEAR_END = "2027-06-30T23:59:59.999Z";

const GRADE_GROUP_LABELS: Record<GradeGroup, string> = {
  K: "K (K3-K5)",
  GRADE_1_5: "Grades 1-5",
  GRADE_6_8: "Grades 6-8",
  GRADE_9_12: "Grades 9-12",
  CUSTOM: "Custom"
};

const PAYMENT_OPTION_LABELS: Record<PaymentOptionType, string> = {
  FULL_PRESEPTEMBER: "Full payment before September",
  TWO_INSTALLMENTS: "Two-installment payment",
  THREE_INSTALLMENTS: "Three-installment payment",
  STANDARD_MONTHLY: "Standard monthly payment",
  SPECIAL_OWNER_AGREEMENT: "Special owner agreement",
  CUSTOM: "Custom"
};

const OFFICIAL_KCS_PLANS: Record<GradeGroup, OfficialPlanTemplate[]> = {
  K: [
    {
      code: "FULL_PRESEPTEMBER",
      name: "Full payment before September",
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      discountRate: 10,
      originalAmount: 3082.5,
      reductionAmount: 308.25,
      finalAmount: 2774.25,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 2774.25, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS,
      discountRate: 5,
      originalAmount: 3082.5,
      reductionAmount: 154.125,
      finalAmount: 2928.375,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1464.1875, dueMonth: 8, dueDay: 31 },
        { label: "Before February", periodKey: "before-february", amount: 1464.1875, dueMonth: 2, dueDay: 28 }
      ]
    },
    {
      code: "THREE_INSTALLMENTS",
      name: "Three-installment payment",
      paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS,
      discountRate: 2,
      originalAmount: 3082.5,
      reductionAmount: 61.65,
      finalAmount: 3020.85,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1006.95, dueMonth: 8, dueDay: 31 },
        { label: "Dec-Jan-Feb", periodKey: "dec-jan-feb", amount: 1006.95, dueMonth: 2, dueDay: 28, windowLabel: "Dec-Jan-Feb" },
        { label: "Mar-Apr-May-Jun", periodKey: "mar-jun", amount: 1006.95, dueMonth: 6, dueDay: 30, windowLabel: "Mar-Apr-May-Jun" }
      ]
    },
    {
      code: "STANDARD_MONTHLY",
      name: "Standard monthly payment",
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      discountRate: 0,
      originalAmount: 3082.5,
      reductionAmount: 0,
      finalAmount: 3082.5,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1233, dueMonth: 8, dueDay: 31 },
        { label: "January", periodKey: "january", amount: 308.25, dueMonth: 1, dueDay: 31 },
        { label: "February", periodKey: "february", amount: 308.25, dueMonth: 2, dueDay: 28 },
        { label: "March", periodKey: "march", amount: 308.25, dueMonth: 3, dueDay: 31 },
        { label: "April", periodKey: "april", amount: 308.25, dueMonth: 4, dueDay: 30 },
        { label: "May-June", periodKey: "may-june", amount: 616.5, dueMonth: 6, dueDay: 30, windowLabel: "May-June" }
      ]
    }
  ],
  GRADE_1_5: [
    {
      code: "FULL_PRESEPTEMBER",
      name: "Full payment before September",
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      discountRate: 10,
      originalAmount: 3770,
      reductionAmount: 377,
      finalAmount: 3393,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 3393, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS,
      discountRate: 5,
      originalAmount: 3770,
      reductionAmount: 188.5,
      finalAmount: 3581.5,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1790.75, dueMonth: 8, dueDay: 31 },
        { label: "Before February", periodKey: "before-february", amount: 1790.75, dueMonth: 2, dueDay: 28 }
      ]
    },
    {
      code: "THREE_INSTALLMENTS",
      name: "Three-installment payment",
      paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS,
      discountRate: 2,
      originalAmount: 3770,
      reductionAmount: 75.4,
      finalAmount: 3694.6,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1231.53, dueMonth: 8, dueDay: 31 },
        { label: "Dec-Jan-Feb", periodKey: "dec-jan-feb", amount: 1231.53, dueMonth: 2, dueDay: 28, windowLabel: "Dec-Jan-Feb" },
        { label: "Mar-Apr-May-Jun", periodKey: "mar-jun", amount: 1231.53, dueMonth: 6, dueDay: 30, windowLabel: "Mar-Apr-May-Jun" }
      ]
    },
    {
      code: "STANDARD_MONTHLY",
      name: "Standard monthly payment",
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      discountRate: 0,
      originalAmount: 3770,
      reductionAmount: 0,
      finalAmount: 3770,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1508, dueMonth: 8, dueDay: 31 },
        { label: "January", periodKey: "january", amount: 377, dueMonth: 1, dueDay: 31 },
        { label: "February", periodKey: "february", amount: 377, dueMonth: 2, dueDay: 28 },
        { label: "March", periodKey: "march", amount: 377, dueMonth: 3, dueDay: 31 },
        { label: "April", periodKey: "april", amount: 377, dueMonth: 4, dueDay: 30 },
        { label: "May-June", periodKey: "may-june", amount: 754, dueMonth: 6, dueDay: 30, windowLabel: "May-June" }
      ]
    }
  ],
  GRADE_6_8: [
    {
      code: "FULL_PRESEPTEMBER",
      name: "Full payment before September",
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      discountRate: 10,
      originalAmount: 4595,
      reductionAmount: 459.5,
      finalAmount: 4135.5,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 4135.5, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS,
      discountRate: 5,
      originalAmount: 4595,
      reductionAmount: 229.75,
      finalAmount: 4365.25,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 2182.625, dueMonth: 8, dueDay: 31 },
        { label: "Before February", periodKey: "before-february", amount: 2182.625, dueMonth: 2, dueDay: 28 }
      ]
    },
    {
      code: "THREE_INSTALLMENTS",
      name: "Three-installment payment",
      paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS,
      discountRate: 2,
      originalAmount: 4595,
      reductionAmount: 91.9,
      finalAmount: 4503.1,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1501.03, dueMonth: 8, dueDay: 31 },
        { label: "Dec-Jan-Feb", periodKey: "dec-jan-feb", amount: 1501.03, dueMonth: 2, dueDay: 28, windowLabel: "Dec-Jan-Feb" },
        { label: "Mar-Apr-May-Jun", periodKey: "mar-jun", amount: 1501.03, dueMonth: 6, dueDay: 30, windowLabel: "Mar-Apr-May-Jun" }
      ]
    },
    {
      code: "STANDARD_MONTHLY",
      name: "Standard monthly payment",
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      discountRate: 0,
      originalAmount: 4595,
      reductionAmount: 0,
      finalAmount: 4595,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1838, dueMonth: 8, dueDay: 31 },
        { label: "January", periodKey: "january", amount: 459.5, dueMonth: 1, dueDay: 31 },
        { label: "February", periodKey: "february", amount: 459.5, dueMonth: 2, dueDay: 28 },
        { label: "March", periodKey: "march", amount: 459.5, dueMonth: 3, dueDay: 31 },
        { label: "April", periodKey: "april", amount: 459.5, dueMonth: 4, dueDay: 30 },
        { label: "May-June", periodKey: "may-june", amount: 919, dueMonth: 6, dueDay: 30, windowLabel: "May-June" }
      ]
    }
  ],
  GRADE_9_12: [
    {
      code: "FULL_PRESEPTEMBER",
      name: "Full payment before September",
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      discountRate: 10,
      originalAmount: 5420,
      reductionAmount: 542,
      finalAmount: 4878,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 4878, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS,
      discountRate: 5,
      originalAmount: 5420,
      reductionAmount: 271,
      finalAmount: 5149,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 2574.5, dueMonth: 8, dueDay: 31 },
        { label: "Before February", periodKey: "before-february", amount: 2574.5, dueMonth: 2, dueDay: 28 }
      ]
    },
    {
      code: "THREE_INSTALLMENTS",
      name: "Three-installment payment",
      paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS,
      discountRate: 2,
      originalAmount: 5420,
      reductionAmount: 108.4,
      finalAmount: 5311.6,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 1770.53, dueMonth: 8, dueDay: 31 },
        { label: "Dec-Jan-Feb", periodKey: "dec-jan-feb", amount: 1770.53, dueMonth: 2, dueDay: 28, windowLabel: "Dec-Jan-Feb" },
        { label: "Mar-Apr-May-Jun", periodKey: "mar-jun", amount: 1770.53, dueMonth: 6, dueDay: 30, windowLabel: "Mar-Apr-May-Jun" }
      ]
    },
    {
      code: "STANDARD_MONTHLY",
      name: "Standard monthly payment",
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      discountRate: 0,
      originalAmount: 5420,
      reductionAmount: 0,
      finalAmount: 5420,
      schedule: [
        { label: "Before September", periodKey: "before-september", amount: 2168, dueMonth: 8, dueDay: 31 },
        { label: "January", periodKey: "january", amount: 542, dueMonth: 1, dueDay: 31 },
        { label: "February", periodKey: "february", amount: 542, dueMonth: 2, dueDay: 28 },
        { label: "March", periodKey: "march", amount: 542, dueMonth: 3, dueDay: 31 },
        { label: "April", periodKey: "april", amount: 542, dueMonth: 4, dueDay: 30 },
        { label: "May-June", periodKey: "may-june", amount: 1084, dueMonth: 6, dueDay: 30, windowLabel: "May-June" }
      ]
    }
  ],
  CUSTOM: []
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100000) / 100000;
}

function formatAlertDueDate(value: string) {
  return dayjs(value).format("DD/MM/YYYY");
}

function formatAlertCurrency(value: number) {
  return `$ ${roundCurrency(value).toFixed(2)} USD`;
}

function buildOverdueAlertSeries(input: {
  parentId: string;
  academicYearName: string;
  activeTuitionPlan: string;
  overdueInstallments: SnapshotInstallment[];
  totalDebt: number;
}) {
  if (input.overdueInstallments.length === 0) return [];

  const sortedInstallments = [...input.overdueInstallments].sort(
    (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()
  );
  const firstInstallment = sortedInstallments[0];
  const mostLateInstallment = sortedInstallments.reduce((latest, current) => {
    const latestDelay = Math.max(dayjs().startOf("day").diff(dayjs(latest.dueDate).startOf("day"), "day"), 0);
    const currentDelay = Math.max(dayjs().startOf("day").diff(dayjs(current.dueDate).startOf("day"), "day"), 0);
    return currentDelay > latestDelay ? current : latest;
  }, firstInstallment);

  const firstDelayDays = Math.max(dayjs().startOf("day").diff(dayjs(firstInstallment.dueDate).startOf("day"), "day"), 0);
  const maxDelayDays = Math.max(dayjs().startOf("day").diff(dayjs(mostLateInstallment.dueDate).startOf("day"), "day"), 0);
  const planLabel = input.activeTuitionPlan !== "No active tuition plan"
    ? input.activeTuitionPlan
    : PAYMENT_OPTION_LABELS[firstInstallment.paymentOptionType] ?? "plan de tuition";

  return [
    {
      id: `derived-overdue-1-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_1",
      title: "Alerte 1 - echeance de tuition depassee",
      message: `${firstInstallment.studentName} a depasse l'echeance \"${firstInstallment.label}\" du ${formatAlertDueDate(firstInstallment.dueDate)} selon le plan ${planLabel}. Solde en retard: ${formatAlertCurrency(firstInstallment.balance)}.`,
      severity: "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `derived-overdue-2-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_2",
      title: "Alerte 2 - regularisation attendue immediatement",
      message: `${input.overdueInstallments.length} echeance(s) sont en retard pour ${input.academicYearName}, avec jusqu'a ${maxDelayDays} jour(s) de depassement. Dette totale suivie: ${formatAlertCurrency(input.totalDebt)}.`,
      severity: input.overdueInstallments.length >= 2 || maxDelayDays >= 14 ? "HIGH" : "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `derived-overdue-3-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_3",
      title: "Alerte 3 - dossier remonte au financier",
      message: `Le parent et le financier doivent traiter ce retard maintenant. Premiere echeance non reglee depuis ${firstDelayDays} jour(s), derniere echeance critique ${mostLateInstallment.label} pour ${mostLateInstallment.studentName}.`,
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date().toISOString()
    }
  ];
}

function parseAcademicYearStart(name: string) {
  const match = name.match(/(\d{4})/);
  return match ? Number(match[1]) : 2026;
}

function buildDueDate(academicYearName: string, schedule: ScheduleTemplate) {
  const startYear = parseAcademicYearStart(academicYearName);
  const year = schedule.dueMonth >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, schedule.dueMonth - 1, schedule.dueDay, 23, 59, 59, 999));
}

function getCurrentMonthStart() {
  return dayjs().startOf("month").toDate();
}

function getQuarterStart(reference: dayjs.Dayjs) {
  const quarter = Math.floor(reference.month() / 3);
  return reference.month(quarter * 3).startOf("month");
}

function resolvePeriodBounds(periodType: ReportType, referenceDate?: string) {
  const ref = referenceDate ? dayjs(referenceDate) : dayjs();
  if (periodType === ReportType.MONTHLY) {
    return { start: ref.startOf("month").toDate(), end: ref.endOf("month").toDate(), label: ref.format("YYYY-MM") };
  }
  if (periodType === ReportType.QUARTERLY) {
    const start = getQuarterStart(ref);
    return { start: start.toDate(), end: start.add(2, "month").endOf("month").toDate(), label: `${start.year()}-Q${Math.floor(start.month() / 3) + 1}` };
  }
  if (periodType === ReportType.YEARLY) {
    return { start: ref.startOf("year").toDate(), end: ref.endOf("year").toDate(), label: String(ref.year()) };
  }
  return { start: new Date(0), end: ref.endOf("day").toDate(), label: "cumulative" };
}

export function getGradeGroupLabel(gradeGroup: GradeGroup) {
  return GRADE_GROUP_LABELS[gradeGroup] ?? gradeGroup;
}

export function getPaymentOptionLabel(option: PaymentOptionType) {
  return PAYMENT_OPTION_LABELS[option] ?? option;
}

export function resolveGradeGroup(input: { className?: string | null; level?: string | null; studentName?: string | null }) {
  const raw = [input.className, input.level, input.studentName].filter(Boolean).join(" ").toUpperCase();
  if (/\bK\s*[3-5]\b/.test(raw) || /\bKINDERGARTEN\b/.test(raw)) return GradeGroup.K;
  const gradeMatch = raw.match(/\b(?:GRADE|G)\s*(\d{1,2})/);
  const numeric = gradeMatch ? Number(gradeMatch[1]) : null;
  if (numeric !== null) {
    if (numeric >= 1 && numeric <= 5) return GradeGroup.GRADE_1_5;
    if (numeric >= 6 && numeric <= 8) return GradeGroup.GRADE_6_8;
    if (numeric >= 9 && numeric <= 12) return GradeGroup.GRADE_9_12;
  }
  return GradeGroup.CUSTOM;
}

export function getOfficialPlanTemplate(gradeGroup: GradeGroup, paymentOptionType: PaymentOptionType) {
  return OFFICIAL_KCS_PLANS[gradeGroup]?.find((plan) => plan.paymentOptionType === paymentOptionType) ?? null;
}

function serializePlanSchedule(academicYearName: string, schedule: ScheduleTemplate[]) {
  return schedule.map((row, index) => ({
    sequence: index + 1,
    label: row.label,
    periodKey: row.periodKey,
    amount: roundCurrency(row.amount),
    dueDate: buildDueDate(academicYearName, row).toISOString(),
    dueMonth: row.dueMonth,
    dueDay: row.dueDay,
    windowLabel: row.windowLabel ?? null
  }));
}

export async function ensureOfficialKcsCatalog(schoolId: string, client: DbClient = prisma) {
  await client.academicYear.updateMany({
    where: { schoolId, name: { not: OFFICIAL_ACADEMIC_YEAR_NAME }, isCurrent: true },
    data: { isCurrent: false }
  });

  const academicYear = await client.academicYear.upsert({
    where: { schoolId_name: { schoolId, name: OFFICIAL_ACADEMIC_YEAR_NAME } },
    update: {
      startDate: new Date(OFFICIAL_ACADEMIC_YEAR_START),
      endDate: new Date(OFFICIAL_ACADEMIC_YEAR_END),
      status: "ACTIVE",
      isCurrent: true
    },
    create: {
      schoolId,
      name: OFFICIAL_ACADEMIC_YEAR_NAME,
      startDate: new Date(OFFICIAL_ACADEMIC_YEAR_START),
      endDate: new Date(OFFICIAL_ACADEMIC_YEAR_END),
      status: "ACTIVE",
      isCurrent: true
    }
  });

  const plans = [] as any[];
  for (const [gradeGroup, entries] of Object.entries(OFFICIAL_KCS_PLANS) as Array<[GradeGroup, OfficialPlanTemplate[]]>) {
    for (const entry of entries) {
      const plan = await client.tuitionPlan.upsert({
        where: {
          schoolId_academicYearId_code_gradeGroup: {
            schoolId,
            academicYearId: academicYear.id,
            code: entry.code,
            gradeGroup
          }
        },
        update: {
          name: `${GRADE_GROUP_LABELS[gradeGroup]} - ${entry.name}`,
          paymentOptionType: entry.paymentOptionType,
          discountRate: entry.discountRate,
          originalAmount: entry.originalAmount,
          reductionAmount: entry.reductionAmount,
          finalAmount: entry.finalAmount,
          scheduleVersion: OFFICIAL_ACADEMIC_YEAR_NAME,
          scheduleJson: serializePlanSchedule(academicYear.name, entry.schedule),
          isOfficial: true,
          isActive: true
        },
        create: {
          schoolId,
          academicYearId: academicYear.id,
          code: entry.code,
          name: `${GRADE_GROUP_LABELS[gradeGroup]} - ${entry.name}`,
          paymentOptionType: entry.paymentOptionType,
          gradeGroup,
          discountRate: entry.discountRate,
          originalAmount: entry.originalAmount,
          reductionAmount: entry.reductionAmount,
          finalAmount: entry.finalAmount,
          currency: "USD",
          scheduleVersion: OFFICIAL_ACADEMIC_YEAR_NAME,
          scheduleJson: serializePlanSchedule(academicYear.name, entry.schedule),
          isOfficial: true,
          isActive: true
        }
      });
      plans.push(plan);
    }
  }

  return { academicYear, plans };
}

async function getTargetAcademicYear(schoolId: string, academicYearName?: string) {
  const { academicYear, plans } = await ensureOfficialKcsCatalog(schoolId);
  if (!academicYearName || academicYearName === academicYear.name) {
    return { academicYear, plans };
  }

  const selected = await prisma.academicYear.findFirst({
    where: { schoolId, name: academicYearName },
    include: { tuitionPlans: true }
  });
  if (!selected) return { academicYear, plans };
  return { academicYear: selected, plans: selected.tuitionPlans };
}

function normalizeScheduleJson(value: unknown) {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function deriveInstallmentStatus(amountDue: number, amountPaid: number, dueDate: Date) {
  if (amountPaid >= amountDue && amountDue > 0) return InstallmentStatus.PAID;
  if (amountPaid > 0) return dueDate.getTime() < Date.now() ? InstallmentStatus.OVERDUE : InstallmentStatus.PARTIALLY_PAID;
  if (dueDate.getTime() < Date.now()) return InstallmentStatus.OVERDUE;
  return InstallmentStatus.SCHEDULED;
}

const OVERDUE_REMINDER_STAGES = [
  { stage: 1, minDelayDays: 1, minDaysAfterPreviousNotice: 0, severity: "MEDIUM" },
  { stage: 2, minDelayDays: 7, minDaysAfterPreviousNotice: 6, severity: "HIGH" },
  { stage: 3, minDelayDays: 14, minDaysAfterPreviousNotice: 7, severity: "CRITICAL" }
] as const;

function buildOverdueReminderMarker(installmentId: string, stage: number) {
  return `[OVERDUE_INSTALLMENT:${installmentId}:STAGE:${stage}]`;
}

function buildOverdueReminderMessages(input: {
  stage: number;
  parentName: string;
  studentName: string;
  installmentLabel: string;
  dueDate: Date;
  planName: string;
  balance: number;
  amountDue: number;
  amountPaid: number;
  delayDays: number;
  marker: string;
}) {
  const amount = formatAlertCurrency(input.balance);
  const dueDate = dayjs(input.dueDate).format("DD/MM/YYYY");
  const subject = input.stage === 3
    ? "Avertissement 3/3 - retard de tuition critique"
    : `Rappel ${input.stage}/3 - echeance de tuition depassee`;
  const emailBody = [
    `Bonjour ${input.parentName},`,
    "",
    `Votre echeance "${input.installmentLabel}" pour ${input.studentName} est en retard depuis ${input.delayDays} jour(s).`,
    `Plan de tuition: ${input.planName}`,
    `Date limite: ${dueDate}`,
    `Montant attendu: ${formatAlertCurrency(input.amountDue)}`,
    `Montant deja paye: ${formatAlertCurrency(input.amountPaid)}`,
    `Solde a regulariser: ${amount}`,
    "",
    "Merci de regulariser ce paiement ou de contacter le service financier si un arrangement est necessaire.",
    "",
    `Reference EduPay: ${input.marker}`
  ].join("\n");
  const smsBody = `EduPay ${input.stage}/3: echeance ${input.installmentLabel} en retard pour ${input.studentName}. Solde: ${amount}. Date limite: ${dueDate}. Ref ${input.marker}`;
  return { subject, emailBody, smsBody };
}

function canSendOverdueStage(input: {
  stage: number;
  delayDays: number;
  logs: Array<{ content: string; createdAt: Date }>;
}) {
  const stageConfig = OVERDUE_REMINDER_STAGES.find((entry) => entry.stage === input.stage);
  if (!stageConfig || input.delayDays < stageConfig.minDelayDays) return false;
  if (input.logs.some((log) => log.content.includes(`:STAGE:${input.stage}]`))) return false;
  if (input.stage === 1) return true;

  const previousLog = input.logs
    .filter((log) => log.content.includes(`:STAGE:${input.stage - 1}]`))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (!previousLog) return false;
  const daysAfterPrevious = dayjs().startOf("day").diff(dayjs(previousLog.createdAt).startOf("day"), "day");
  return daysAfterPrevious >= stageConfig.minDaysAfterPreviousNotice;
}

function calculateBehaviorScore(input: { expected: number; paid: number; overdueInstallments: number; delayedPayments: number; carriedOverDebt: number }) {
  const coverage = input.expected > 0 ? (input.paid / input.expected) * 100 : 100;
  return roundCurrency(Math.max(0, Math.min(100,
    coverage - input.overdueInstallments * 9 - input.delayedPayments * 5 - input.carriedOverDebt * 0.02
  )));
}

function buildDerivedPlanReduction(input: {
  parentId: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  studentName: string;
  gradeGroup: GradeGroup;
  paymentOptionType: PaymentOptionType;
  plan: any;
  assignedAt?: Date;
}) {
  if (!input.plan || Number(input.plan.reductionAmount || 0) <= 0) return null;
  return {
    id: `official-${input.studentId}-${input.paymentOptionType}`,
    source: "OFFICIAL_PLAN",
    title: `${getPaymentOptionLabel(input.paymentOptionType)} reduction`,
    amount: roundCurrency(Number(input.plan.reductionAmount || 0)),
    percentage: roundCurrency(Number(input.plan.discountRate || 0)),
    parentId: input.parentId,
    studentId: input.studentId,
    academicYearId: input.academicYearId,
    academicYearName: input.academicYearName,
    gradeGroup: input.gradeGroup,
    paymentOptionType: input.paymentOptionType,
    scope: ReductionScope.PAYMENT_OPTION,
    effectiveDate: (input.assignedAt ?? new Date()).toISOString(),
    studentName: input.studentName
  };
}

function groupCurrencyTotals<T extends string | number>(entries: Array<{ key: T; amount: number }>) {
  const bucket = new Map<T, number>();
  for (const entry of entries) {
    bucket.set(entry.key, roundCurrency((bucket.get(entry.key) ?? 0) + entry.amount));
  }
  return Array.from(bucket.entries()).map(([key, amount]) => ({ key, amount }));
}

export async function runOverdueTuitionReminderSweep(input: {
  schoolId: string;
  parentId?: string;
  academicYearName?: string;
}) {
  const { academicYear } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const now = new Date();
  const installments = await prisma.paymentInstallment.findMany({
    where: {
      schoolId: input.schoolId,
      academicYearId: academicYear.id,
      parentId: input.parentId,
      dueDate: { lt: now },
      status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED, InstallmentStatus.CANCELLED] }
    },
    include: {
      parent: true,
      student: true,
      tuitionPlan: true,
      financialAgreement: true,
      financialProfile: true,
      sourceDebts: true
    },
    orderBy: [{ dueDate: "asc" }, { sequence: "asc" }]
  });

  const result = {
    scannedInstallments: installments.length,
    overdueInstallments: 0,
    debtsUpdated: 0,
    parentEmails: 0,
    parentSms: 0,
    financeAlerts: 0
  };

  for (const installment of installments) {
    if (!installment.parentId || !installment.parent) continue;

    const amountDue = roundCurrency(Number(installment.amountDue || 0));
    const amountPaid = roundCurrency(Number(installment.amountPaid || 0));
    const balance = roundCurrency(Math.max(amountDue - amountPaid, 0));
    if (balance <= 0) continue;

    result.overdueInstallments += 1;
    if (installment.status !== InstallmentStatus.OVERDUE) {
      await prisma.paymentInstallment.update({
        where: { id: installment.id },
        data: { status: InstallmentStatus.OVERDUE }
      });
    }

    const existingDebt = installment.sourceDebts.find((debt) => debt.sourceInstallmentId === installment.id);
    const debtStatus = amountPaid > 0 ? DebtStatus.PARTIALLY_PAID : DebtStatus.OPEN;
    const debt = existingDebt
      ? await prisma.debt.update({
        where: { id: existingDebt.id },
        data: {
          amountRemaining: balance,
          status: debtStatus,
          settledAt: null,
          dueDate: installment.dueDate,
          metadata: {
            source: "TUITION_PLAN_OVERDUE_SWEEP",
            lastCheckedAt: now.toISOString(),
            delayDays: Math.max(dayjs(now).startOf("day").diff(dayjs(installment.dueDate).startOf("day"), "day"), 0)
          }
        }
      })
      : await prisma.debt.create({
        data: {
          schoolId: input.schoolId,
          parentId: installment.parentId,
          studentId: installment.studentId,
          academicYearId: academicYear.id,
          financialProfileId: installment.financialProfileId,
          sourceInstallmentId: installment.id,
          title: `${installment.student?.fullName ?? installment.parent.fullName} tuition overdue balance`,
          reason: `Overdue tuition installment: ${installment.label}`,
          originalAmount: amountDue,
          amountRemaining: balance,
          status: debtStatus,
          dueDate: installment.dueDate,
          metadata: {
            source: "TUITION_PLAN_OVERDUE_SWEEP",
            createdFromPlan: installment.tuitionPlan?.code ?? installment.financialAgreement?.title ?? "CUSTOM",
            delayDays: Math.max(dayjs(now).startOf("day").diff(dayjs(installment.dueDate).startOf("day"), "day"), 0)
          }
        }
      });
    result.debtsUpdated += 1;

    const delayDays = Math.max(dayjs(now).startOf("day").diff(dayjs(installment.dueDate).startOf("day"), "day"), 0);
    const logs = await prisma.notificationLog.findMany({
      where: {
        schoolId: input.schoolId,
        parentId: installment.parentId,
        type: NotificationType.OVERDUE_INSTALLMENT,
        content: { contains: `[OVERDUE_INSTALLMENT:${installment.id}:STAGE:` }
      },
      orderBy: { createdAt: "desc" }
    });

    for (const stageConfig of OVERDUE_REMINDER_STAGES) {
      if (!canSendOverdueStage({ stage: stageConfig.stage, delayDays, logs })) continue;

      const marker = buildOverdueReminderMarker(installment.id, stageConfig.stage);
      const messages = buildOverdueReminderMessages({
        stage: stageConfig.stage,
        parentName: installment.parent.fullName,
        studentName: installment.student?.fullName ?? "Compte parent",
        installmentLabel: installment.label,
        dueDate: installment.dueDate,
        planName: installment.tuitionPlan?.name ?? installment.financialAgreement?.title ?? PAYMENT_OPTION_LABELS[PaymentOptionType.CUSTOM],
        balance,
        amountDue,
        amountPaid,
        delayDays,
        marker
      });

      if (installment.parent.email) {
        const status = await sendEmail({
          to: installment.parent.email,
          subject: messages.subject,
          text: messages.emailBody
        });
        await prisma.notificationLog.create({
          data: {
            schoolId: input.schoolId,
            parentId: installment.parentId,
            type: NotificationType.OVERDUE_INSTALLMENT,
            language: installment.parent.preferredLanguage || "fr",
            channel: NotificationChannel.EMAIL,
            content: messages.emailBody,
            status
          }
        });
        result.parentEmails += 1;
      }

      if (installment.parent.phone) {
        const status = await sendSms({ to: installment.parent.phone, text: messages.smsBody });
        await prisma.notificationLog.create({
          data: {
            schoolId: input.schoolId,
            parentId: installment.parentId,
            type: NotificationType.OVERDUE_INSTALLMENT,
            language: installment.parent.preferredLanguage || "fr",
            channel: NotificationChannel.SMS,
            content: messages.smsBody,
            status
          }
        });
        result.parentSms += 1;
      }

      await prisma.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          parentId: installment.parentId,
          type: NotificationType.OVERDUE_INSTALLMENT,
          language: installment.parent.preferredLanguage || "fr",
          channel: NotificationChannel.DASHBOARD,
          content: `Finance dashboard alert ${marker}: ${messages.subject}`,
          status: "OPEN"
        }
      });

      const existingAlert = await prisma.financialAlert.findFirst({
        where: {
          schoolId: input.schoolId,
          parentId: installment.parentId,
          installmentId: installment.id,
          type: FinancialAlertType.OVERDUE_INSTALLMENT,
          title: { contains: `Avertissement ${stageConfig.stage}/3` }
        }
      });
      if (!existingAlert) {
        await prisma.financialAlert.create({
          data: {
            schoolId: input.schoolId,
            parentId: installment.parentId,
            academicYearId: academicYear.id,
            financialProfileId: installment.financialProfileId,
            installmentId: installment.id,
            debtId: debt.id,
            type: FinancialAlertType.OVERDUE_INSTALLMENT,
            title: `Avertissement ${stageConfig.stage}/3 - retard tuition`,
            message: `${installment.parent.fullName} a ${delayDays} jour(s) de retard sur "${installment.label}" (${installment.student?.fullName ?? "compte parent"}). Solde: ${formatAlertCurrency(balance)}. Le parent a ete notifie par email/SMS lorsque les coordonnees existent.`,
            severity: stageConfig.severity,
            status: "OPEN",
            channel: NotificationChannel.DASHBOARD,
            supportedChannels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL, NotificationChannel.SMS]
          }
        });
        result.financeAlerts += 1;
      }

      break;
    }
  }

  return result;
}

export async function getParentFinancialSnapshot(input: { schoolId: string; parentId: string; academicYearName?: string }) {
  const { academicYear, plans } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  await runOverdueTuitionReminderSweep({
    schoolId: input.schoolId,
    parentId: input.parentId,
    academicYearName: academicYear.name
  });
  const [parent, profile, assignments, discounts, debts, agreements, installments, alerts, payments, notificationLogs] = await Promise.all([
    prisma.parent.findFirst({
      where: { id: input.parentId, schoolId: input.schoolId },
      include: { students: { include: { class: true } } }
    }),
    prisma.parentFinancialProfile.findFirst({
      where: { parentId: input.parentId, academicYearId: academicYear.id },
      include: { activeTuitionPlan: true, activeAgreement: true }
    }),
    prisma.parentPlanAssignment.findMany({
      where: { parentId: input.parentId, academicYearId: academicYear.id, isActive: true },
      include: { student: true, tuitionPlan: true, financialAgreement: true }
    }),
    prisma.discount.findMany({
      where: { parentId: input.parentId },
      orderBy: { effectiveDate: "desc" }
    }),
    prisma.debt.findMany({
      where: { parentId: input.parentId },
      include: {
        academicYear: { select: { id: true, name: true } },
        carriedOverFromYear: { select: { id: true, name: true } }
      },
      orderBy: [{ academicYearId: "desc" }, { createdAt: "desc" }]
    }),
    prisma.financialAgreement.findMany({
      where: { parentId: input.parentId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.paymentInstallment.findMany({
      where: { parentId: input.parentId },
      include: { allocations: true, tuitionPlan: true, student: true }
    }),
    prisma.financialAlert.findMany({
      where: { parentId: input.parentId },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.payment.findMany({
      where: { parentId: input.parentId, schoolId: input.schoolId },
      include: { receipt: true, students: true, allocations: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.notificationLog.findMany({
      where: { parentId: input.parentId, schoolId: input.schoolId },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  if (!parent) {
    throw new Error("Parent financial profile not found");
  }

  const planLookup = new Map(plans.map((plan: any) => [`${plan.gradeGroup}:${plan.paymentOptionType}`, plan]));
  const agreementLookup = new Map(agreements.map((agreement) => [agreement.id, agreement]));
  const assignmentsByStudent = new Map(assignments.filter((assignment) => assignment.studentId).map((assignment) => [assignment.studentId!, assignment]));
  const genericAssignment = assignments.find((assignment) => !assignment.studentId) ?? null;

  const completedPayments = payments.filter((payment) => payment.status === "COMPLETED");
  const completedPaymentsTotal = roundCurrency(completedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const pendingPaymentsTotal = roundCurrency(payments.filter((payment) => payment.status === "PENDING").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const failedPaymentsTotal = roundCurrency(payments.filter((payment) => payment.status === "FAILED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));

  const allocationByInstallmentId = new Map<string, number>();
  for (const installment of installments) {
    const explicitPaid = Number(installment.amountPaid || 0);
    const allocationPaid = installment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
    allocationByInstallmentId.set(installment.id, Math.max(explicitPaid, allocationPaid));
  }

  let accountedAllocatedTotal = roundCurrency(Array.from(allocationByInstallmentId.values()).reduce((sum, value) => sum + value, 0));
  let remainingPool = Math.max(0, roundCurrency(completedPaymentsTotal - accountedAllocatedTotal));

  const studentSummaries = parent.students.map((student) => {
    const assignment = assignmentsByStudent.get(student.id) ?? genericAssignment;
    const gradeGroup = assignment?.gradeGroup ?? resolveGradeGroup({ className: student.class?.name, level: student.class?.level, studentName: student.fullName });
    const paymentOptionType = assignment?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY;
    const plan = assignment?.tuitionPlan ?? planLookup.get(`${gradeGroup}:${paymentOptionType}`) ?? planLookup.get(`${gradeGroup}:${PaymentOptionType.STANDARD_MONTHLY}`) ?? null;
    const agreement = assignment?.financialAgreementId ? agreementLookup.get(assignment.financialAgreementId) ?? null : null;
    const persistedStudentInstallments = installments.filter((installment) => installment.academicYearId === academicYear.id && installment.studentId === student.id);

    const derivedSchedule = persistedStudentInstallments.length > 0
      ? persistedStudentInstallments.map((installment) => ({
        id: `persisted-${installment.id}`,
        persistedId: installment.id,
        label: installment.label,
        periodKey: installment.periodKey,
        dueDate: installment.dueDate.toISOString(),
        amountDue: roundCurrency(Number(installment.amountDue || 0)),
        amountPaid: roundCurrency(allocationByInstallmentId.get(installment.id) ?? 0),
        source: "persisted" as const,
        planCode: installment.tuitionPlan?.code ?? assignment?.tuitionPlan?.code ?? null,
        paymentOptionType: assignment?.paymentOptionType ?? plan?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY,
        gradeGroup
      }))
      : agreement
        ? installments
          .filter((installment) => installment.financialAgreementId === agreement.id)
          .map((installment) => ({
            id: `persisted-${installment.id}`,
            persistedId: installment.id,
            label: installment.label,
            periodKey: installment.periodKey,
            dueDate: installment.dueDate.toISOString(),
            amountDue: roundCurrency(Number(installment.amountDue || 0)),
            amountPaid: roundCurrency(allocationByInstallmentId.get(installment.id) ?? 0),
            source: "persisted" as const,
            planCode: null,
            paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
            gradeGroup: agreement.gradeGroup ?? gradeGroup
          }))
        : normalizeScheduleJson(plan?.scheduleJson).map((row, index) => ({
          id: `derived-${student.id}-${paymentOptionType}-${index + 1}`,
          persistedId: null,
          label: String(row.label ?? `Installment ${index + 1}`),
          periodKey: String(row.periodKey ?? `installment-${index + 1}`),
          dueDate: String(row.dueDate ?? buildDueDate(academicYear.name, {
            label: String(row.label ?? `Installment ${index + 1}`),
            periodKey: String(row.periodKey ?? `installment-${index + 1}`),
            amount: Number(row.amount ?? 0),
            dueMonth: Number(row.dueMonth ?? 8),
            dueDay: Number(row.dueDay ?? 31)
          }).toISOString()),
          amountDue: roundCurrency(Number(row.amount ?? 0)),
          amountPaid: 0,
          source: "derived" as const,
          planCode: plan?.code ?? null,
          paymentOptionType: plan?.paymentOptionType ?? paymentOptionType,
          gradeGroup
        }));

    const expectedTotal = roundCurrency(
      agreement
        ? Number(agreement.customTotal || 0)
        : assignment?.expectedTotal
          ? Number(assignment.expectedTotal)
          : Number(plan?.finalAmount || student.annualFee || 0)
    );
    const reductionTotal = roundCurrency(
      agreement
        ? Number(agreement.reductionAmount || 0)
        : assignment?.reductionTotal
          ? Number(assignment.reductionTotal)
          : Number(plan?.reductionAmount || 0)
    );

    return {
      id: student.id,
      fullName: student.fullName,
      className: student.class?.name ?? null,
      annualFee: roundCurrency(Number(student.annualFee || 0)),
      gradeGroup,
      paymentOptionType: agreement ? PaymentOptionType.SPECIAL_OWNER_AGREEMENT : (assignment?.paymentOptionType ?? plan?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY),
      paymentOptionLabel: agreement ? "Special owner agreement" : getPaymentOptionLabel(assignment?.paymentOptionType ?? plan?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY),
      expectedTotal,
      reductionTotal,
      originalAmount: roundCurrency(Number(plan?.originalAmount || expectedTotal + reductionTotal)),
      planCode: plan?.code ?? null,
      planName: agreement?.title ?? plan?.name ?? "Custom plan",
      agreementId: agreement?.id ?? null,
      installments: derivedSchedule as Array<ReturnType<typeof Object>>
    };
  });

  const flattenedInstallments = studentSummaries
    .flatMap((student) => student.installments.map((installment) => ({ installment, student })))
    .sort((left, right) => new Date(left.installment.dueDate).getTime() - new Date(right.installment.dueDate).getTime());

  const finalizedInstallments: SnapshotInstallment[] = flattenedInstallments.map(({ installment, student }) => {
    const dueDate = new Date(installment.dueDate);
    let amountPaid = roundCurrency(installment.amountPaid);
    if (amountPaid < installment.amountDue && remainingPool > 0) {
      const autoAllocation = Math.min(remainingPool, roundCurrency(installment.amountDue - amountPaid));
      amountPaid = roundCurrency(amountPaid + autoAllocation);
      remainingPool = roundCurrency(remainingPool - autoAllocation);
    }
    const balance = roundCurrency(Math.max(installment.amountDue - amountPaid, 0));
    const status = deriveInstallmentStatus(installment.amountDue, amountPaid, dueDate);
    return {
      id: installment.id,
      persistedId: installment.persistedId,
      label: installment.label,
      periodKey: installment.periodKey,
      dueDate: dueDate.toISOString(),
      amountDue: roundCurrency(installment.amountDue),
      amountPaid,
      balance,
      status,
      isOverdue: status === InstallmentStatus.OVERDUE,
      source: installment.source,
      planCode: installment.planCode,
      paymentOptionType: installment.paymentOptionType,
      studentId: student.id,
      studentName: student.fullName,
      gradeGroup: student.gradeGroup
    };
  });

  const installmentsByStudent = new Map<string, SnapshotInstallment[]>();
  for (const installment of finalizedInstallments) {
    const current = installmentsByStudent.get(installment.studentId ?? "") ?? [];
    current.push(installment);
    installmentsByStudent.set(installment.studentId ?? "", current);
  }

  const explicitDiscounts = discounts.map((discount) => ({
    id: discount.id,
    source: "MANUAL",
    title: discount.title,
    amount: roundCurrency(Number(discount.amount || 0)),
    percentage: discount.percentage ? roundCurrency(Number(discount.percentage)) : null,
    parentId: discount.parentId,
    studentId: discount.studentId,
    academicYearId: discount.academicYearId,
    academicYearName: academicYear.name,
    gradeGroup: discount.gradeGroup,
    paymentOptionType: discount.paymentOptionType,
    scope: discount.scope,
    effectiveDate: discount.effectiveDate.toISOString(),
    studentName: parent.students.find((student) => student.id === discount.studentId)?.fullName ?? null
  }));

  const derivedDiscounts = studentSummaries
    .map((student) => buildDerivedPlanReduction({
      parentId: parent.id,
      studentId: student.id,
      academicYearId: academicYear.id,
      academicYearName: academicYear.name,
      studentName: student.fullName,
      gradeGroup: student.gradeGroup,
      paymentOptionType: student.paymentOptionType,
      plan: student.planCode ? planLookup.get(`${student.gradeGroup}:${student.paymentOptionType}`) : null,
      assignedAt: assignmentsByStudent.get(student.id)?.assignedAt ?? genericAssignment?.assignedAt ?? new Date()
    }))
    .filter(Boolean);

  const studentRows = studentSummaries.map((student) => {
    const studentInstallments = installmentsByStudent.get(student.id) ?? [];
    const paid = roundCurrency(studentInstallments.reduce((sum, installment) => sum + installment.amountPaid, 0));
    const balance = roundCurrency(studentInstallments.reduce((sum, installment) => sum + installment.balance, 0));
    return {
      ...student,
      installments: studentInstallments,
      paid,
      balance,
      overdueInstallments: studentInstallments.filter((installment) => installment.isOverdue).length,
      completionRate: student.expectedTotal > 0 ? roundCurrency((paid / student.expectedTotal) * 100) : 0
    };
  });

  const carriedOverDebt = roundCurrency(
    debts
      .filter((debt) => debt.status !== "CLEARED" && debt.status !== "WRITTEN_OFF" && debt.academicYearId !== academicYear.id)
      .reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0)
  );

  const openManualDebt = roundCurrency(
    debts
      .filter((debt) => debt.status !== "CLEARED" && debt.status !== "WRITTEN_OFF" && !debt.sourceInstallmentId && debt.academicYearId === academicYear.id)
      .reduce((sum, debt) => sum + Number(debt.amountRemaining || 0), 0)
  );

  const tuitionDebt = roundCurrency(studentRows.reduce((sum, student) => sum + student.balance, 0));
  const totalDebt = roundCurrency(tuitionDebt + openManualDebt + carriedOverDebt);
  const totalExpected = roundCurrency(studentRows.reduce((sum, student) => sum + student.expectedTotal, 0));
  const totalReduction = roundCurrency([
    ...explicitDiscounts.map((discount) => discount.amount),
    ...derivedDiscounts.map((discount) => Number(discount?.amount || 0))
  ].reduce((sum, amount) => sum + amount, 0));
  const overdueInstallments = finalizedInstallments.filter((installment) => installment.isOverdue).length;
  const delayedPayments = payments.filter((payment) => payment.status === "PENDING" || payment.status === "FAILED").length;
  const paymentBehaviorScore = profile?.paymentBehaviorScore && profile.paymentBehaviorScore > 0
    ? roundCurrency(Number(profile.paymentBehaviorScore))
    : calculateBehaviorScore({
      expected: totalExpected || 1,
      paid: completedPaymentsTotal,
      overdueInstallments,
      delayedPayments,
      carriedOverDebt
    });

  const activePlanNames = Array.from(new Set(studentRows.map((student) => student.planName))).filter(Boolean);
  const activeTuitionPlan = activePlanNames.length === 1 ? activePlanNames[0] : activePlanNames.length > 1 ? "Mixed tuition plans" : "No active tuition plan";

  const overdueInstallmentRows = finalizedInstallments.filter((installment) => installment.isOverdue);

  const derivedAlerts = [] as Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
    status: string;
    createdAt: string;
  }>;

  if (overdueInstallmentRows.length > 0) {
    derivedAlerts.push(...buildOverdueAlertSeries({
      parentId: parent.id,
      academicYearName: academicYear.name,
      activeTuitionPlan,
      overdueInstallments: overdueInstallmentRows,
      totalDebt
    }));
  } else if (totalDebt > Math.max(totalExpected * 0.4, 500)) {
    derivedAlerts.push({
      id: `derived-debt-${parent.id}`,
      type: "ABNORMAL_DEBT_ACCUMULATION",
      title: "Debt accumulation requires action",
      message: `Outstanding debt is $ ${totalDebt.toFixed(2)} USD.`,
      severity: totalDebt >= Math.max(totalExpected * 0.75, 1500) ? "HIGH" : "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    });
  }
  if (finalizedInstallments.length === 0) {
    derivedAlerts.push({
      id: `derived-schedule-${parent.id}`,
      type: "INCOMPLETE_TUITION_SCHEDULE",
      title: "Incomplete tuition schedule",
      message: "No tuition schedule has been generated for this parent yet.",
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date().toISOString()
    });
  }

  return {
    academicYear: {
      id: academicYear.id,
      name: academicYear.name,
      startDate: academicYear.startDate.toISOString(),
      endDate: academicYear.endDate.toISOString()
    },
    parent: {
      id: parent.id,
      fullName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      preferredLanguage: parent.preferredLanguage
    },
    profile: {
      id: profile?.id ?? null,
      activeTuitionPlan,
      activeTuitionPlanId: profile?.activeTuitionPlanId ?? null,
      activeAgreementId: profile?.activeAgreementId ?? null,
      totalPaid: completedPaymentsTotal,
      totalDebt,
      totalReduction,
      carriedOverDebt,
      overdueInstallments,
      pendingPaymentsTotal,
      failedPaymentsTotal,
      paymentBehaviorScore,
      lastPaymentAt: completedPayments.at(-1)?.createdAt?.toISOString() ?? profile?.lastPaymentAt?.toISOString() ?? null,
      childrenLinkedToAccount: parent.students.length,
      expectedNetRevenue: roundCurrency(totalExpected),
      completionRate: totalExpected > 0 ? roundCurrency((completedPaymentsTotal / totalExpected) * 100) : 0
    },
    students: studentRows,
    installments: finalizedInstallments,
    reductions: [...explicitDiscounts, ...derivedDiscounts],
    debts: debts.map((debt) => ({
      id: debt.id,
      title: debt.title,
      reason: debt.reason,
      originalAmount: roundCurrency(Number(debt.originalAmount || 0)),
      amountRemaining: roundCurrency(Number(debt.amountRemaining || 0)),
      status: debt.status,
      academicYearId: debt.academicYearId,
      academicYearName: debt.academicYear?.name ?? null,
      carriedOverFromYearId: debt.carriedOverFromYearId,
      carriedOverFromYearName: debt.carriedOverFromYear?.name ?? null,
      dueDate: debt.dueDate?.toISOString() ?? null,
      settledAt: debt.settledAt?.toISOString() ?? null,
      createdAt: debt.createdAt.toISOString()
    })),
    agreements: agreements.map((agreement) => ({
      id: agreement.id,
      title: agreement.title,
      status: agreement.status,
      customTotal: roundCurrency(Number(agreement.customTotal || 0)),
      reductionAmount: roundCurrency(Number(agreement.reductionAmount || 0)),
      balanceDue: roundCurrency(Number(agreement.balanceDue || 0)),
      paymentOptionType: agreement.paymentOptionType,
      gradeGroup: agreement.gradeGroup,
      approvedAt: agreement.approvedAt?.toISOString() ?? null,
      approvalRequestedAt: agreement.approvalRequestedAt?.toISOString() ?? null,
      notes: agreement.notes,
      privateNotes: agreement.privateNotes,
      createdAt: agreement.createdAt.toISOString()
    })),
    alerts: [
      ...alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        status: alert.status,
        createdAt: alert.createdAt.toISOString()
      })),
      ...derivedAlerts
    ],
    paymentHistory: payments
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((payment) => ({
        id: payment.id,
        transactionNumber: payment.transactionNumber,
        amount: roundCurrency(Number(payment.amount || 0)),
        reason: payment.reason,
        method: payment.method,
        status: payment.status,
        createdAt: payment.createdAt.toISOString(),
        receiptId: payment.receipt?.id ?? null,
        receiptNumber: payment.receipt?.receiptNumber ?? null,
        students: payment.students.map((student) => ({ id: student.id, fullName: student.fullName }))
      })),
    historicalReceipts: payments
      .filter((payment) => payment.receipt)
      .map((payment) => ({
        id: payment.receipt!.id,
        receiptNumber: payment.receipt!.receiptNumber,
        paymentId: payment.id,
        transactionNumber: payment.transactionNumber,
        createdAt: payment.receipt!.createdAt.toISOString()
      })),
    notificationHistory: notificationLogs.map((log) => ({
      id: log.id,
      type: log.type,
      channel: log.channel,
      content: log.content,
      status: log.status,
      createdAt: log.createdAt.toISOString()
      }))
  };
}

export async function getSchoolFinanceOverview(input: { schoolId: string; academicYearName?: string }) {
  const { academicYear } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const [parents, payments] = await Promise.all([
    prisma.parent.findMany({ where: { schoolId: input.schoolId }, select: { id: true, fullName: true } }),
    prisma.payment.findMany({
      where: { schoolId: input.schoolId },
      include: { students: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const parentSnapshots = await Promise.all(parents.map((parent) => getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: parent.id,
    academicYearName: academicYear.name
  })));

  const monthStart = getCurrentMonthStart();
  const totalRevenue = roundCurrency(payments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const monthlyRevenue = roundCurrency(payments.filter((payment) => payment.status === "COMPLETED" && payment.createdAt >= monthStart).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const totalDebt = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + snapshot.profile.totalDebt, 0));
  const expectedRevenue = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + snapshot.profile.expectedNetRevenue, 0));
  const totalReduction = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + snapshot.profile.totalReduction, 0));
  const paymentCompletionRate = expectedRevenue > 0 ? roundCurrency((totalRevenue / expectedRevenue) * 100) : 0;
  const parentDebtAnalytics = parentSnapshots
    .map((snapshot) => ({
      parentId: snapshot.parent.id,
      parentName: snapshot.parent.fullName,
      totalDebt: snapshot.profile.totalDebt,
      totalPaid: snapshot.profile.totalPaid,
      carriedOverDebt: snapshot.profile.carriedOverDebt,
      overdueInstallments: snapshot.profile.overdueInstallments,
      paymentBehaviorScore: snapshot.profile.paymentBehaviorScore
    }))
    .sort((left, right) => right.totalDebt - left.totalDebt)
    .slice(0, 10);

  const classAnalyticsMap = new Map<string, {
    expected: number;
    collected: number;
    debt: number;
    reductions: number;
    students: number;
  }>();

  for (const snapshot of parentSnapshots) {
    for (const student of snapshot.students) {
      const key = student.className ?? getGradeGroupLabel(student.gradeGroup);
      const current = classAnalyticsMap.get(key) ?? { expected: 0, collected: 0, debt: 0, reductions: 0, students: 0 };
      current.expected = roundCurrency(current.expected + student.expectedTotal);
      current.collected = roundCurrency(current.collected + student.paid);
      current.debt = roundCurrency(current.debt + student.balance);
      current.reductions = roundCurrency(current.reductions + student.reductionTotal);
      current.students += 1;
      classAnalyticsMap.set(key, current);
    }
  }

  const reductionReport = await getReductionAnalytics({
    schoolId: input.schoolId,
    academicYearName: academicYear.name,
    periodType: ReportType.CUMULATIVE
  });

  const alerts = parentSnapshots.flatMap((snapshot) => snapshot.alerts);
  const financialHealthIndicators = {
    collectionEfficiency: paymentCompletionRate,
    debtExposure: expectedRevenue > 0 ? roundCurrency((totalDebt / expectedRevenue) * 100) : 0,
    reductionLoad: expectedRevenue > 0 ? roundCurrency((totalReduction / expectedRevenue) * 100) : 0,
    alertPressure: alerts.length,
    averageBehaviorScore: parentSnapshots.length > 0
      ? roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + snapshot.profile.paymentBehaviorScore, 0) / parentSnapshots.length)
      : 0
  };

  return {
    academicYear: {
      id: academicYear.id,
      name: academicYear.name,
      startDate: academicYear.startDate.toISOString(),
      endDate: academicYear.endDate.toISOString()
    },
    totalRevenue,
    monthlyRevenue,
    outstandingDebt: totalDebt,
    expectedRevenue,
    collectedRevenue: totalRevenue,
    totalDebt,
    totalReduction,
    paymentSuccessRate: payments.length > 0
      ? roundCurrency((payments.filter((payment) => payment.status === "COMPLETED").length / payments.length) * 100)
      : 0,
    paymentCompletionRate,
    classAnalytics: Array.from(classAnalyticsMap.entries()).map(([className, value]) => ({
      className,
      ...value,
      collectionRate: value.expected > 0 ? roundCurrency((value.collected / value.expected) * 100) : 0
    })).sort((left, right) => right.debt - left.debt),
    parentDebtAnalytics,
    reductionStatistics: reductionReport,
    financialHealthIndicators,
    activeAlerts: alerts.length,
    overdueParents: parentSnapshots.filter((snapshot) => snapshot.profile.overdueInstallments > 0).length,
    parentsTracked: parentSnapshots.length
  };
}

export async function getReductionAnalytics(input: {
  schoolId: string;
  academicYearName?: string;
  periodType: ReportType;
  referenceDate?: string;
}) {
  const { academicYear } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const bounds = resolvePeriodBounds(input.periodType, input.referenceDate);
  const parents = await prisma.parent.findMany({ where: { schoolId: input.schoolId }, select: { id: true } });
  const parentSnapshots = await Promise.all(parents.map((parent) => getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: parent.id,
    academicYearName: academicYear.name
  })));

  const reductions = parentSnapshots
    .flatMap((snapshot) => snapshot.reductions)
    .filter((reduction): reduction is NonNullable<(typeof parentSnapshots)[number]["reductions"][number]> => Boolean(reduction))
    .filter((reduction) => {
      const date = new Date(reduction.effectiveDate);
      return date >= bounds.start && date <= bounds.end;
    });

  const byScope = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.scope ?? "UNKNOWN"), amount: reduction.amount })));
  const byGradeGroup = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.gradeGroup ?? GradeGroup.CUSTOM), amount: reduction.amount })));
  const byPaymentOption = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.paymentOptionType ?? PaymentOptionType.CUSTOM), amount: reduction.amount })));

  return {
    academicYear: academicYear.name,
    periodType: input.periodType,
    periodLabel: bounds.label,
    totalReductions: roundCurrency(reductions.reduce((sum, reduction) => sum + reduction.amount, 0)),
    reductionCount: reductions.length,
    byScope: byScope.map((entry) => ({ scope: entry.key, amount: entry.amount })),
    byGradeGroup: byGradeGroup.map((entry) => ({ gradeGroup: entry.key, amount: entry.amount })),
    byPaymentOption: byPaymentOption.map((entry) => ({ paymentOptionType: entry.key, amount: entry.amount })),
    reductions
  };
}

export async function upsertParentPlanAssignment(input: {
  schoolId: string;
  parentId: string;
  studentId?: string;
  academicYearName?: string;
  paymentOptionType: PaymentOptionType;
  gradeGroup?: GradeGroup;
  notes?: string;
}) {
  const { academicYear, plans } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const student = input.studentId
    ? await prisma.student.findFirst({ where: { id: input.studentId, parentId: input.parentId, schoolId: input.schoolId }, include: { class: true } })
    : null;
  const gradeGroup = input.gradeGroup ?? resolveGradeGroup({ className: student?.class?.name, level: student?.class?.level, studentName: student?.fullName });
  const plan = plans.find((entry: any) => entry.gradeGroup === gradeGroup && entry.paymentOptionType === input.paymentOptionType);
  if (!plan) {
    throw new Error("No official KCS tuition plan matches the selected grade group and payment option.");
  }

  const profile = await prisma.parentFinancialProfile.upsert({
    where: { parentId_academicYearId: { parentId: input.parentId, academicYearId: academicYear.id } },
    update: { activeTuitionPlanId: plan.id },
    create: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      activeTuitionPlanId: plan.id,
      totalDebt: roundCurrency(Number(plan.finalAmount || 0)),
      totalReduction: roundCurrency(Number(plan.reductionAmount || 0))
    }
  });

  const existingAssignment = await prisma.parentPlanAssignment.findFirst({
    where: {
      parentId: input.parentId,
      academicYearId: academicYear.id,
      studentId: input.studentId ?? null
    }
  });

  if (existingAssignment) {
    await prisma.paymentInstallment.deleteMany({
      where: {
        academicYearId: academicYear.id,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        tuitionPlanId: existingAssignment.tuitionPlanId ?? undefined
      }
    });
  }

  const assignment = existingAssignment
    ? await prisma.parentPlanAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        financialProfileId: profile.id,
        tuitionPlanId: plan.id,
        financialAgreementId: null,
        gradeGroup,
        paymentOptionType: input.paymentOptionType,
        expectedTotal: roundCurrency(Number(plan.finalAmount || 0)),
        reductionTotal: roundCurrency(Number(plan.reductionAmount || 0)),
        remainingBalanceSnapshot: roundCurrency(Number(plan.finalAmount || 0)),
        isActive: true,
        notes: input.notes ?? null
      }
    })
    : await prisma.parentPlanAssignment.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id,
        financialProfileId: profile.id,
        tuitionPlanId: plan.id,
        gradeGroup,
        paymentOptionType: input.paymentOptionType,
        expectedTotal: roundCurrency(Number(plan.finalAmount || 0)),
        reductionTotal: roundCurrency(Number(plan.reductionAmount || 0)),
        remainingBalanceSnapshot: roundCurrency(Number(plan.finalAmount || 0)),
        notes: input.notes ?? null
      }
    });

  const schedule = normalizeScheduleJson(plan.scheduleJson);
  for (const [index, row] of schedule.entries()) {
    await prisma.paymentInstallment.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id,
        financialProfileId: profile.id,
        tuitionPlanId: plan.id,
        label: String(row.label ?? `Installment ${index + 1}`),
        sequence: Number(row.sequence ?? index + 1),
        periodKey: String(row.periodKey ?? `installment-${index + 1}`),
        dueDate: new Date(String(row.dueDate ?? new Date().toISOString())),
        amountDue: roundCurrency(Number(row.amount ?? 0)),
        reductionAmount: 0,
        status: "SCHEDULED",
        notes: input.notes ?? null
      }
    });
  }

  if (Number(plan.reductionAmount || 0) > 0) {
    await prisma.discount.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id,
        financialProfileId: profile.id,
        tuitionPlanId: plan.id,
        title: `${getPaymentOptionLabel(input.paymentOptionType)} reduction`,
        scope: ReductionScope.PAYMENT_OPTION,
        amount: roundCurrency(Number(plan.reductionAmount || 0)),
        percentage: roundCurrency(Number(plan.discountRate || 0)),
        paymentOptionType: input.paymentOptionType,
        gradeGroup,
        description: `Official KCS ${academicYear.name} reduction for ${getGradeGroupLabel(gradeGroup)}.`
      }
    });
  }

  return {
    academicYear,
    profile,
    assignment,
    plan
  };
}

export async function createSpecialFinancialAgreement(input: {
  schoolId: string;
  parentId: string;
  studentId?: string;
  academicYearName?: string;
  title: string;
  customTotal: number;
  reductionAmount?: number;
  gradeGroup?: GradeGroup;
  notes?: string;
  privateNotes?: string;
  approvedById?: string;
  status?: AgreementStatus;
  installments: Array<{ label: string; dueDate: string; amountDue: number; notes?: string }>;
}) {
  const { academicYear } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const profile = await prisma.parentFinancialProfile.upsert({
    where: { parentId_academicYearId: { parentId: input.parentId, academicYearId: academicYear.id } },
    update: {},
    create: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      totalDebt: roundCurrency(input.customTotal - (input.reductionAmount ?? 0)),
      totalReduction: roundCurrency(input.reductionAmount ?? 0)
    }
  });

  const agreementStatus = input.status ?? AgreementStatus.PENDING_APPROVAL;
  const agreement = await prisma.financialAgreement.create({
    data: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      financialProfileId: profile.id,
      approvedById: input.approvedById,
      title: input.title,
      paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
      gradeGroup: input.gradeGroup,
      status: agreementStatus,
      customTotal: roundCurrency(input.customTotal),
      reductionAmount: roundCurrency(input.reductionAmount ?? 0),
      balanceDue: roundCurrency(input.customTotal - (input.reductionAmount ?? 0)),
      notes: input.notes ?? null,
      privateNotes: input.privateNotes ?? null,
      history: [
        {
          at: new Date().toISOString(),
          event: "AGREEMENT_CREATED",
          status: agreementStatus
        }
      ],
      approvalRequestedAt: new Date(),
      approvedAt: agreementStatus === AgreementStatus.APPROVED ? new Date() : null
    }
  });

  await prisma.parentFinancialProfile.update({
    where: { id: profile.id },
    data: { activeAgreementId: agreement.id }
  });

  await prisma.parentPlanAssignment.create({
    data: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      studentId: input.studentId ?? null,
      academicYearId: academicYear.id,
      financialProfileId: profile.id,
      financialAgreementId: agreement.id,
      gradeGroup: input.gradeGroup ?? GradeGroup.CUSTOM,
      paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
      expectedTotal: roundCurrency(input.customTotal),
      reductionTotal: roundCurrency(input.reductionAmount ?? 0),
      remainingBalanceSnapshot: roundCurrency(input.customTotal - (input.reductionAmount ?? 0)),
      notes: input.notes ?? null
    }
  });

  for (const [index, row] of input.installments.entries()) {
    await prisma.paymentInstallment.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id,
        financialProfileId: profile.id,
        financialAgreementId: agreement.id,
        label: row.label,
        sequence: index + 1,
        periodKey: `agreement-${agreement.id}-${index + 1}`,
        dueDate: new Date(row.dueDate),
        amountDue: roundCurrency(row.amountDue),
        reductionAmount: 0,
        status: "SCHEDULED",
        notes: row.notes ?? null
      }
    });
  }

  if ((input.reductionAmount ?? 0) > 0) {
    await prisma.discount.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id,
        financialProfileId: profile.id,
        sourceAgreementId: agreement.id,
        title: `${input.title} reduction`,
        scope: ReductionScope.AGREEMENT,
        amount: roundCurrency(input.reductionAmount ?? 0),
        paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
        gradeGroup: input.gradeGroup ?? GradeGroup.CUSTOM,
        description: input.notes ?? "Special owner agreement reduction"
      }
    });
  }

  return {
    academicYear,
    profileId: profile.id,
    agreementId: agreement.id,
    status: agreement.status
  };
}

export async function applyPaymentToFinanceLedger(input: {
  schoolId: string;
  paymentId: string;
  parentId: string;
  studentIds?: string[];
  client?: DbClient;
}) {
  const client = input.client ?? prisma;
  const { academicYear } = await ensureOfficialKcsCatalog(input.schoolId, client);

  const payment = await client.payment.findFirst({
    where: { id: input.paymentId, schoolId: input.schoolId, parentId: input.parentId },
    include: { students: true, allocations: true }
  });

  if (!payment || payment.status !== PaymentStatus.COMPLETED) {
    return null;
  }

  const profile = await client.parentFinancialProfile.upsert({
    where: { parentId_academicYearId: { parentId: input.parentId, academicYearId: academicYear.id } },
    update: {},
    create: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id
    }
  });

  const targetStudentIds = (input.studentIds && input.studentIds.length > 0)
    ? input.studentIds
    : payment.students.map((student) => student.id);

  const installments = await client.paymentInstallment.findMany({
    where: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      ...(targetStudentIds.length > 0 ? { OR: [{ studentId: { in: targetStudentIds } }, { studentId: null }] } : {})
    },
    include: { allocations: true, student: true },
    orderBy: [{ dueDate: "asc" }, { sequence: "asc" }]
  });

  let remaining = roundCurrency(Number(payment.amount || 0));
  for (const installment of installments) {
    if (remaining <= 0) break;
    const alreadyAllocated = roundCurrency(installment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
    const currentPaid = roundCurrency(Math.max(Number(installment.amountPaid || 0), alreadyAllocated));
    const outstanding = roundCurrency(Math.max(Number(installment.amountDue || 0) - currentPaid, 0));
    if (outstanding <= 0) continue;

    const allocationAmount = roundCurrency(Math.min(remaining, outstanding));
    await client.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        installmentId: installment.id,
        amount: allocationAmount
      }
    });

    const updatedPaid = roundCurrency(currentPaid + allocationAmount);
    const updatedStatus = deriveInstallmentStatus(Number(installment.amountDue || 0), updatedPaid, installment.dueDate);
    await client.paymentInstallment.update({
      where: { id: installment.id },
      data: {
        amountPaid: updatedPaid,
        status: updatedStatus
      }
    });

    const remainingBalance = roundCurrency(Math.max(Number(installment.amountDue || 0) - updatedPaid, 0));
    const existingDebt = await client.debt.findFirst({ where: { sourceInstallmentId: installment.id } });
    if (existingDebt) {
      await client.debt.update({
        where: { id: existingDebt.id },
        data: {
          amountRemaining: remainingBalance,
          status: remainingBalance > 0 ? (updatedPaid > 0 ? "PARTIALLY_PAID" : "OPEN") : "CLEARED",
          settledAt: remainingBalance === 0 ? new Date() : null,
          dueDate: installment.dueDate
        }
      });
    } else if (remainingBalance > 0) {
      await client.debt.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: installment.studentId,
          academicYearId: academicYear.id,
          financialProfileId: profile.id,
          sourceInstallmentId: installment.id,
          sourcePaymentId: payment.id,
          title: `${installment.student?.fullName ?? "Parent"} installment balance`,
          reason: `Outstanding balance for ${installment.label}`,
          originalAmount: roundCurrency(Number(installment.amountDue || 0)),
          amountRemaining: remainingBalance,
          status: updatedPaid > 0 ? "PARTIALLY_PAID" : "OPEN",
          dueDate: installment.dueDate
        }
      });
    }

    remaining = roundCurrency(remaining - allocationAmount);
  }

  await client.payment.update({
    where: { id: payment.id },
    data: {
      academicYearId: academicYear.id,
      parentFinancialProfileId: profile.id,
      tuitionPlanId: profile.activeTuitionPlanId ?? undefined
    }
  });

  const snapshot = await getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: input.parentId,
    academicYearName: academicYear.name
  });

  await client.parentFinancialProfile.update({
    where: { id: profile.id },
    data: {
      activeTuitionPlanId: profile.activeTuitionPlanId,
      activeAgreementId: profile.activeAgreementId,
      totalPaid: snapshot.profile.totalPaid,
      totalDebt: snapshot.profile.totalDebt,
      totalReduction: snapshot.profile.totalReduction,
      carriedOverDebt: snapshot.profile.carriedOverDebt,
      overdueInstallments: snapshot.profile.overdueInstallments,
      paymentBehaviorScore: snapshot.profile.paymentBehaviorScore,
      lastPaymentAt: snapshot.profile.lastPaymentAt ? new Date(snapshot.profile.lastPaymentAt) : null
    }
  });

  return snapshot;
}
