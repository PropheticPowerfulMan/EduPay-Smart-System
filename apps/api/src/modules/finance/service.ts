import {
  AgreementStatus,
  DebtStatus,
  FinancialAlertType,
  GradeGroup,
  InstallmentStatus,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  PaymentOptionType,
  PaymentStatus,
  Prisma,
  ReductionScope,
  ReportType
} from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "../../prisma";
import { amountToWords } from "../../utils/amount-words";
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
const OFFICIAL_ACADEMIC_YEAR_START = "2026-09-01T00:00:00.000Z";
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
  const planLabel = input.activeTuitionPlan !== "Aucun plan de scolarité actif"
    ? input.activeTuitionPlan
    : PAYMENT_OPTION_LABELS[firstInstallment.paymentOptionType] ?? "plan de scolarité";

  return [
    {
      id: `derived-overdue-1-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_1",
      title: "Alerte 1 - échéance de scolarité dépassée",
      message: `${firstInstallment.studentName} a dépassé l'échéance « ${firstInstallment.label} » du ${formatAlertDueDate(firstInstallment.dueDate)} selon le plan ${planLabel}. Solde en retard : ${formatAlertCurrency(firstInstallment.balance)}.`,
      severity: "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `derived-overdue-2-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_2",
      title: "Alerte 2 - régularisation attendue immédiatement",
      message: `${input.overdueInstallments.length} échéance(s) sont en retard pour ${input.academicYearName}, avec jusqu'à ${maxDelayDays} jour(s) de dépassement. Dette totale suivie : ${formatAlertCurrency(input.totalDebt)}.`,
      severity: input.overdueInstallments.length >= 2 || maxDelayDays >= 14 ? "HIGH" : "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `derived-overdue-3-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_3",
      title: "Alerte 3 - dossier remonté au financier",
      message: `Le parent et le financier doivent traiter ce retard maintenant. Première échéance non réglée depuis ${firstDelayDays} jour(s), dernière échéance critique : ${mostLateInstallment.label} pour ${mostLateInstallment.studentName}.`,
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date().toISOString()
    }
  ];
}

function parseAcademicYearStart(name: string) {
  // Toujours prendre la première année comme début (ex: 2025-2026 => 2025)
  const match = name.match(/(\d{4})/);
  return match ? Number(match[1]) : new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

function buildDueDate(academicYearName: string, schedule: ScheduleTemplate) {
  // Si le mois est de septembre (8) à juin (6), l’année scolaire commence en septembre N et finit en juin N+1
  const startYear = parseAcademicYearStart(academicYearName);
  let year = startYear;
  if (schedule.dueMonth >= 9) year = startYear; // septembre à décembre de l’année N
  else year = startYear + 1; // janvier à juin de l’année N+1
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

function scaleScheduleRowsToExpectedTotal(rows: Array<Record<string, unknown>>, expectedTotal: number): Array<Record<string, unknown> & { amount: number }> {
  const total = roundCurrency(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
  if (rows.length === 0 || total <= 0 || expectedTotal <= 0 || total === expectedTotal) {
    return rows.map((row) => ({ ...row, amount: roundCurrency(Number(row.amount ?? 0)) }));
  }

  let runningTotal = 0;
  return rows.map((row, index) => {
    const amount = index === rows.length - 1
      ? roundCurrency(expectedTotal - runningTotal)
      : roundCurrency((Number(row.amount ?? 0) / total) * expectedTotal);
    runningTotal = roundCurrency(runningTotal + amount);
    return { ...row, amount };
  });
}

function deriveInstallmentStatus(amountDue: number, amountPaid: number, dueDate: Date) {
  if (amountPaid >= amountDue && amountDue > 0) return InstallmentStatus.PAID;
  if (amountPaid > 0) return dueDate.getTime() < Date.now() ? InstallmentStatus.OVERDUE : InstallmentStatus.PARTIALLY_PAID;
  if (dueDate.getTime() < Date.now()) return InstallmentStatus.OVERDUE;
  return InstallmentStatus.SCHEDULED;
}

async function reconcileInstallmentAfterAllocationChange(client: DbClient, installmentId: string) {
  const installment = await client.paymentInstallment.findUnique({
    where: { id: installmentId },
    include: {
      allocations: true,
      student: true
    }
  });
  if (!installment) return null;

  const amountPaid = roundCurrency(
    installment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
  );
  const amountDue = Number(installment.amountDue || 0);
  const remainingBalance = roundCurrency(Math.max(amountDue - amountPaid, 0));

  const updatedInstallment = await client.paymentInstallment.update({
    where: { id: installment.id },
    data: {
      amountPaid,
      status: deriveInstallmentStatus(amountDue, amountPaid, installment.dueDate)
    },
    include: { student: true }
  });

  const existingDebt = await client.debt.findFirst({ where: { sourceInstallmentId: installment.id } });
  if (existingDebt) {
    await client.debt.update({
      where: { id: existingDebt.id },
      data: {
        amountRemaining: remainingBalance,
        status: remainingBalance > 0 ? (amountPaid > 0 ? DebtStatus.PARTIALLY_PAID : DebtStatus.OPEN) : DebtStatus.CLEARED,
        settledAt: remainingBalance === 0 ? new Date() : null,
        dueDate: installment.dueDate
      }
    });
  } else if (remainingBalance > 0 && installment.parentId) {
    await client.debt.create({
      data: {
        schoolId: installment.schoolId,
        parentId: installment.parentId,
        studentId: installment.studentId,
        academicYearId: installment.academicYearId,
        financialProfileId: installment.financialProfileId,
        sourceInstallmentId: installment.id,
        title: `${installment.student?.fullName ?? "Parent"} installment balance`,
        reason: `Outstanding balance after payment adjustment: ${installment.label}`,
        originalAmount: amountDue,
        amountRemaining: remainingBalance,
        status: amountPaid > 0 ? DebtStatus.PARTIALLY_PAID : DebtStatus.OPEN,
        dueDate: installment.dueDate
      }
    });
  }

  return { installment: updatedInstallment, amountPaid, remainingBalance };
}

export const OVERDUE_REMINDER_STAGES = [
  { stage: 1, minDelayDays: 1, minDaysAfterPreviousNotice: 0, severity: "MEDIUM" },
  { stage: 2, minDelayDays: 2, minDaysAfterPreviousNotice: 1, severity: "MEDIUM" },
  { stage: 3, minDelayDays: 3, minDaysAfterPreviousNotice: 1, severity: "HIGH" },
  { stage: 4, minDelayDays: 4, minDaysAfterPreviousNotice: 1, severity: "HIGH" },
  { stage: 5, minDelayDays: 5, minDaysAfterPreviousNotice: 1, severity: "HIGH" },
  { stage: 6, minDelayDays: 6, minDaysAfterPreviousNotice: 1, severity: "CRITICAL" },
  { stage: 7, minDelayDays: 7, minDaysAfterPreviousNotice: 1, severity: "CRITICAL" }
] as const;

function normalizeMessageLanguage(language?: string | null): "fr" | "en" {
  return String(language ?? "fr").toLowerCase().startsWith("en") ? "en" : "fr";
}

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
  language?: string | null;
}) {
  const language = normalizeMessageLanguage(input.language);
  const amount = formatAlertCurrency(input.balance);
  const dueDate = dayjs(input.dueDate).format("DD/MM/YYYY");
  if (language === "en") {
    const subject = input.stage >= 6
      ? `Warning ${input.stage}/7 - critical tuition overdue`
      : `Warning ${input.stage}/7 - tuition plan overdue`;
    const emailBody = [
      `Hello ${input.parentName},`,
      "",
      `Your installment "${input.installmentLabel}" for ${input.studentName} has been overdue for ${input.delayDays} day(s).`,
      `Tuition plan: ${input.planName}`,
      `Due date: ${dueDate}`,
      `Expected amount: ${formatAlertCurrency(input.amountDue)}`,
      `Amount already paid: ${formatAlertCurrency(input.amountPaid)}`,
      `Balance to regularize: ${amount}`,
      "",
      "Please make this payment or contact the finance office if a payment arrangement is needed.",
      "",
      `EduPay reference: ${input.marker}`
    ].join("\n");
    const smsBody = `EduPay warning ${input.stage}/7: ${input.installmentLabel} is overdue for ${input.studentName}. Balance: ${amount}. Due date: ${dueDate}. Ref ${input.marker}`;
    const dashboardBody = `Warning ${input.stage}/7: ${input.installmentLabel} is overdue for ${input.studentName}. Balance ${amount}. Due date ${dueDate}.`;
    return { subject, emailBody, smsBody, dashboardBody };
  }

  const subject = input.stage >= 6
    ? `Avertissement ${input.stage}/7 - retard de scolarité critique`
    : `Avertissement ${input.stage}/7 - échéance de scolarité dépassée`;
  const emailBody = [
    `Bonjour ${input.parentName},`,
    "",
    `Votre échéance « ${input.installmentLabel} » pour ${input.studentName} est en retard depuis ${input.delayDays} jour(s).`,
    `Plan de scolarité : ${input.planName}`,
    `Date limite : ${dueDate}`,
    `Montant attendu : ${formatAlertCurrency(input.amountDue)}`,
    `Montant déjà payé : ${formatAlertCurrency(input.amountPaid)}`,
    `Solde à régulariser : ${amount}`,
    "",
    "Merci de régulariser ce paiement ou de contacter le service financier si un arrangement est nécessaire.",
    "",
    `Référence EduPay : ${input.marker}`
  ].join("\n");
  const smsBody = `EduPay avertissement ${input.stage}/7 : échéance ${input.installmentLabel} en retard pour ${input.studentName}. Solde : ${amount}. Date limite : ${dueDate}. Réf. ${input.marker}`;
  const dashboardBody = `Avertissement ${input.stage}/7 : échéance ${input.installmentLabel} en retard pour ${input.studentName}. Solde : ${amount}. Date limite : ${dueDate}.`;
  return { subject, emailBody, smsBody, dashboardBody };
}

export function canSendOverdueStage(input: {
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

function reductionDedupKey(reduction: {
  studentId?: string | null;
  scope?: ReductionScope | string | null;
  paymentOptionType?: PaymentOptionType | string | null;
  amount?: number | null;
  title?: string | null;
}) {
  return [
    reduction.studentId ?? "parent",
    reduction.scope ?? "UNKNOWN",
    reduction.paymentOptionType ?? "CUSTOM",
    roundCurrency(Number(reduction.amount || 0)).toFixed(5),
    String(reduction.title ?? "").trim().toLowerCase()
  ].join("|");
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
        marker,
        language: installment.parent.preferredLanguage
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
          language: normalizeMessageLanguage(installment.parent.preferredLanguage),
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
            language: normalizeMessageLanguage(installment.parent.preferredLanguage),
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
          language: normalizeMessageLanguage(installment.parent.preferredLanguage),
          channel: NotificationChannel.DASHBOARD,
          content: `${marker} ${messages.dashboardBody}`,
          status: "OPEN"
        }
      });

      const existingAlert = await prisma.financialAlert.findFirst({
        where: {
          schoolId: input.schoolId,
          parentId: installment.parentId,
          installmentId: installment.id,
          type: FinancialAlertType.OVERDUE_INSTALLMENT,
            title: { contains: `Avertissement ${stageConfig.stage}/7` }
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
            title: `Avertissement ${stageConfig.stage}/7 - retard de scolarité`,
            message: messages.dashboardBody,
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

export async function getParentFinancialSnapshot(input: { schoolId: string; parentId: string; academicYearName?: string; refreshOverdue?: boolean }) {
  const { academicYear, plans } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  if (input.refreshOverdue) {
    await runOverdueTuitionReminderSweep({
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearName: academicYear.name
    });
  }
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
      include: {
        receipt: true,
        students: true,
        allocations: {
          include: {
            installment: { include: { student: true } }
          }
        }
      },
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

  const studentSummaries = parent.students.map((student) => {
    const assignment = assignmentsByStudent.get(student.id) ?? genericAssignment;
    const gradeGroup = assignment?.gradeGroup ?? resolveGradeGroup({ className: student.class?.name, level: student.class?.level, studentName: student.fullName });
    const paymentOptionType = assignment?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY;
    const plan = assignment?.tuitionPlan ?? planLookup.get(`${gradeGroup}:${paymentOptionType}`) ?? planLookup.get(`${gradeGroup}:${PaymentOptionType.STANDARD_MONTHLY}`) ?? null;
    const agreement = assignment?.financialAgreementId ? agreementLookup.get(assignment.financialAgreementId) ?? null : null;
    const persistedStudentInstallments = installments.filter((installment) => installment.academicYearId === academicYear.id && installment.studentId === student.id);
    const expectedTotal = roundCurrency(
      agreement
        ? Number(agreement.balanceDue || agreement.customTotal || 0)
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
    const assignedSchedule = scaleScheduleRowsToExpectedTotal(normalizeScheduleJson(plan?.scheduleJson), expectedTotal);

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
        : assignedSchedule.map((row, index) => ({
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
    const amountPaid = roundCurrency(installment.amountPaid);
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

  const explicitDiscountRows = discounts.map((discount) => ({
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
  const explicitDiscounts = Array.from(
    explicitDiscountRows.reduce((acc, discount) => {
      const key = reductionDedupKey(discount);
      if (!acc.has(key)) acc.set(key, discount);
      return acc;
    }, new Map<string, (typeof explicitDiscountRows)[number]>()).values()
  );

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
    .filter(Boolean)
    .filter((discount) => !explicitDiscounts.some((explicit) => reductionDedupKey(explicit) === reductionDedupKey(discount!)));
  const reductions = [...explicitDiscounts, ...derivedDiscounts];

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
    ...reductions.map((discount) => Number(discount?.amount || 0))
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
  const activeTuitionPlan = activePlanNames.length === 1 ? activePlanNames[0] : activePlanNames.length > 1 ? "Plans de scolarité mixtes" : "Aucun plan de scolarité actif";

  const overdueInstallmentRows = finalizedInstallments.filter((installment) => installment.isOverdue);

  const getReceiptAllocationMode = (payment: typeof payments[number]) => {
    if (!payment.receipt?.pdfBase64) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payment.receipt.pdfBase64, "base64").toString("utf8")) as { allocation?: { mode?: string } };
      return parsed.allocation?.mode ?? null;
    } catch {
      return null;
    }
  };

  const summarizePersistedPaymentAllocation = (payment: typeof payments[number]) => {
    if (!payment.allocations.length) return null;
    const lines = payment.allocations
      .slice()
      .sort((left, right) => left.installment.dueDate.getTime() - right.installment.dueDate.getTime())
      .map((allocation) => {
        const installment = allocation.installment;
        const amountDue = roundCurrency(Number(installment.amountDue || 0));
        const amountPaid = roundCurrency(Number(installment.amountPaid || 0));
        const allocated = roundCurrency(Number(allocation.amount || 0));
        return {
          allocationId: allocation.id,
          installmentId: installment.id,
          studentId: installment.studentId,
          studentName: installment.student?.fullName ?? "Parent account",
          label: installment.label,
          periodKey: installment.periodKey,
          dueDate: installment.dueDate.toISOString(),
          amountDue,
          allocated,
          amountPaidAfterAllocation: amountPaid,
          outstandingAfter: roundCurrency(Math.max(amountDue - amountPaid, 0)),
          status: installment.status,
          createdAt: allocation.createdAt.toISOString()
        };
      });
    const perChild = Object.values(lines.reduce<Record<string, {
      studentId: string | null;
      studentName: string;
      allocated: number;
      remaining: number;
      lines: typeof lines;
    }>>((acc, line) => {
      const key = line.studentId ?? line.studentName;
      const current = acc[key] ?? {
        studentId: line.studentId,
        studentName: line.studentName,
        allocated: 0,
        remaining: 0,
        lines: []
      };
      current.allocated = roundCurrency(current.allocated + line.allocated);
      current.remaining = roundCurrency(current.remaining + line.outstandingAfter);
      current.lines.push(line);
      acc[key] = current;
      return acc;
    }, {}));
    const allocatedTotal = roundCurrency(lines.reduce((sum, line) => sum + line.allocated, 0));
    return {
      mode: getReceiptAllocationMode(payment) ?? "LEDGER_AUTO",
      traceSource: "PaymentAllocation",
      totalReceived: roundCurrency(Number(payment.amount || 0)),
      allocatedTotal,
      advanceBalance: roundCurrency(Math.max(Number(payment.amount || 0) - allocatedTotal, 0)),
      perChild,
      lines
    };
  };

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
    reductions,
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
      .map((payment) => {
        const allocationTrace = summarizePersistedPaymentAllocation(payment);
        return {
          id: payment.id,
          transactionNumber: payment.transactionNumber,
          amount: roundCurrency(Number(payment.amount || 0)),
          reason: payment.reason,
          method: payment.method,
          status: payment.status,
          createdAt: payment.createdAt.toISOString(),
          receiptId: payment.receipt?.id ?? null,
          receiptNumber: payment.receipt?.receiptNumber ?? null,
          allocationTrace,
          students: payment.students.map((student) => ({ id: student.id, fullName: student.fullName }))
        };
      }),
    historicalReceipts: payments
      .filter((payment) => payment.receipt)
      .map((payment) => ({
        id: payment.receipt!.id,
        receiptNumber: payment.receipt!.receiptNumber,
        paymentId: payment.id,
        transactionNumber: payment.transactionNumber,
        allocationTrace: summarizePersistedPaymentAllocation(payment),
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
  const [parents, payments, discounts, alerts] = await Promise.all([
    prisma.parent.findMany({
      where: { schoolId: input.schoolId },
      select: {
        id: true,
        fullName: true,
        students: {
          select: {
            id: true,
            fullName: true,
            annualFee: true,
            class: { select: { name: true, level: true } },
            planAssignments: {
              where: { isActive: true, academicYearId: academicYear.id },
              include: { tuitionPlan: true, financialAgreement: true },
              orderBy: { updatedAt: "desc" },
              take: 1
            }
          }
        }
      }
    }),
    prisma.payment.findMany({
      where: { schoolId: input.schoolId },
      include: { students: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.discount.findMany({
      where: { schoolId: input.schoolId },
      include: {
        parent: { select: { fullName: true } },
        student: { select: { fullName: true } }
      },
      orderBy: { effectiveDate: "desc" }
    }),
    prisma.financialAlert.findMany({
      where: { schoolId: input.schoolId, status: "OPEN" },
      select: { id: true, parentId: true }
    })
  ]);

  const monthStart = getCurrentMonthStart();
  const totalRevenue = roundCurrency(payments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const monthlyRevenue = roundCurrency(payments.filter((payment) => payment.status === "COMPLETED" && payment.createdAt >= monthStart).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const paidByParent = new Map<string, number>();
  const paidByStudent = new Map<string, number>();
  for (const payment of payments.filter((payment) => payment.status === "COMPLETED")) {
    if (payment.parentId) paidByParent.set(payment.parentId, roundCurrency((paidByParent.get(payment.parentId) ?? 0) + Number(payment.amount || 0)));
    const studentShare = payment.students.length > 0 ? roundCurrency(Number(payment.amount || 0) / payment.students.length) : 0;
    for (const student of payment.students) {
      paidByStudent.set(student.id, roundCurrency((paidByStudent.get(student.id) ?? 0) + studentShare));
    }
  }

  const studentRows = parents.flatMap((parent) => parent.students.map((student) => {
    const assignment = student.planAssignments[0] ?? null;
    const expected = roundCurrency(Number(
      assignment?.financialAgreement?.balanceDue ??
      assignment?.expectedTotal ??
      assignment?.tuitionPlan?.finalAmount ??
      student.annualFee ??
      0
    ));
    const reduction = roundCurrency(Number(
      assignment?.financialAgreement?.reductionAmount ??
      assignment?.reductionTotal ??
      assignment?.tuitionPlan?.reductionAmount ??
      0
    ));
    const paid = roundCurrency(paidByStudent.get(student.id) ?? 0);
    const gradeGroup = assignment?.gradeGroup ?? resolveGradeGroup({ className: student.class?.name, level: student.class?.level, studentName: student.fullName });
    return {
      parentId: parent.id,
      parentName: parent.fullName,
      className: student.class?.name ?? getGradeGroupLabel(gradeGroup),
      expected,
      collected: paid,
      debt: roundCurrency(Math.max(expected - paid, 0)),
      reductions: reduction,
      gradeGroup,
      paymentOptionType: assignment?.paymentOptionType ?? PaymentOptionType.STANDARD_MONTHLY
    };
  }));

  const parentTotals = Array.from(parents.reduce((acc, parent) => {
    const rows = studentRows.filter((row) => row.parentId === parent.id);
    acc.set(parent.id, {
      parentId: parent.id,
      parentName: parent.fullName,
      totalDebt: roundCurrency(rows.reduce((sum, row) => sum + row.debt, 0)),
      totalPaid: roundCurrency((paidByParent.get(parent.id) ?? 0) || rows.reduce((sum, row) => sum + row.collected, 0)),
      carriedOverDebt: 0,
      overdueInstallments: 0,
      paymentBehaviorScore: rows.length ? roundCurrency(Math.min(100, (rows.reduce((sum, row) => sum + row.collected, 0) / Math.max(rows.reduce((sum, row) => sum + row.expected, 0), 1)) * 100)) : 0
    });
    return acc;
  }, new Map<string, {
    parentId: string;
    parentName: string;
    totalDebt: number;
    totalPaid: number;
    carriedOverDebt: number;
    overdueInstallments: number;
    paymentBehaviorScore: number;
  }>()).values());

  const totalDebt = roundCurrency(studentRows.reduce((sum, row) => sum + row.debt, 0));
  const expectedRevenue = roundCurrency(studentRows.reduce((sum, row) => sum + row.expected, 0));
  const totalReduction = roundCurrency(studentRows.reduce((sum, row) => sum + row.reductions, 0));
  const paymentCompletionRate = expectedRevenue > 0 ? roundCurrency(Math.min(100, (totalRevenue / expectedRevenue) * 100)) : 0;
  const parentDebtAnalytics = parentTotals
    .sort((left, right) => right.totalDebt - left.totalDebt)
    .slice(0, 10);

  const classAnalyticsMap = new Map<string, {
    expected: number;
    collected: number;
    debt: number;
    reductions: number;
    students: number;
  }>();

  for (const student of studentRows) {
      const key = student.className;
      const current = classAnalyticsMap.get(key) ?? { expected: 0, collected: 0, debt: 0, reductions: 0, students: 0 };
      current.expected = roundCurrency(current.expected + student.expected);
      current.collected = roundCurrency(current.collected + student.collected);
      current.debt = roundCurrency(current.debt + student.debt);
      current.reductions = roundCurrency(current.reductions + student.reductions);
      current.students += 1;
      classAnalyticsMap.set(key, current);
  }

  const reductionReport = buildFastReductionAnalytics({
    academicYearName: academicYear.name,
    discounts,
    studentRows
  });

  const parentsWithAlerts = new Set(alerts.map((alert) => alert.parentId).filter(Boolean)).size;
  const financialHealthIndicators = {
    collectionEfficiency: paymentCompletionRate,
    debtExposure: expectedRevenue > 0 ? roundCurrency((totalDebt / expectedRevenue) * 100) : 0,
    reductionLoad: expectedRevenue > 0 ? roundCurrency((totalReduction / expectedRevenue) * 100) : 0,
    alertPressure: parents.length > 0 ? roundCurrency((parentsWithAlerts / parents.length) * 100) : 0,
    averageBehaviorScore: parentTotals.length > 0
      ? roundCurrency(parentTotals.reduce((sum, parent) => sum + parent.paymentBehaviorScore, 0) / parentTotals.length)
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
    overdueParents: parentTotals.filter((parent) => parent.totalDebt > 0).length,
    parentsTracked: parents.length
  };
}

function buildFastReductionAnalytics(input: {
  academicYearName: string;
  discounts: Array<{
    id: string;
    title: string;
    amount: any;
    percentage: any;
    parentId: string | null;
    studentId: string | null;
    academicYearId: string | null;
    gradeGroup: GradeGroup | null;
    paymentOptionType: PaymentOptionType | null;
    scope: ReductionScope;
    effectiveDate: Date;
    parent?: { fullName: string } | null;
    student?: { fullName: string } | null;
  }>;
  studentRows: Array<{ parentName: string; reductions: number; gradeGroup: GradeGroup; paymentOptionType: PaymentOptionType }>;
}) {
  const explicitRows = input.discounts.map((discount) => ({
    id: discount.id,
    title: discount.title,
    amount: roundCurrency(Number(discount.amount || 0)),
    percentage: discount.percentage ? roundCurrency(Number(discount.percentage)) : null,
    parentId: discount.parentId,
    parentName: discount.parent?.fullName ?? null,
    studentId: discount.studentId,
    studentName: discount.student?.fullName ?? null,
    academicYearId: discount.academicYearId,
    academicYearName: input.academicYearName,
    gradeGroup: discount.gradeGroup,
    paymentOptionType: discount.paymentOptionType,
    scope: discount.scope,
    source: "MANUAL",
    effectiveDate: discount.effectiveDate.toISOString()
  }));
  const derivedRows = input.studentRows
    .filter((row) => row.reductions > 0)
    .map((row, index) => ({
      id: `derived-plan-reduction-${index}`,
      title: "Plan tuition reduction",
      amount: row.reductions,
      percentage: null,
      parentId: null,
      parentName: row.parentName,
      studentId: null,
      studentName: null,
      academicYearId: null,
      academicYearName: input.academicYearName,
      gradeGroup: row.gradeGroup,
      paymentOptionType: row.paymentOptionType,
      scope: ReductionScope.PAYMENT_OPTION,
      source: "TUITION_PLAN",
      effectiveDate: new Date().toISOString()
    }));
  const reductions = [...explicitRows, ...derivedRows];
  const byScope = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.scope ?? "UNKNOWN"), amount: reduction.amount })));
  const byGradeGroup = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.gradeGroup ?? GradeGroup.CUSTOM), amount: reduction.amount })));
  const byPaymentOption = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.paymentOptionType ?? PaymentOptionType.CUSTOM), amount: reduction.amount })));

  return {
    academicYear: input.academicYearName,
    periodType: ReportType.CUMULATIVE,
    periodLabel: "Cumulative",
    totalReductions: roundCurrency(reductions.reduce((sum, reduction) => sum + reduction.amount, 0)),
    reductionCount: reductions.length,
    scholarshipTotal: roundCurrency(reductions.reduce((sum, reduction) => sum + reduction.amount, 0)),
    scholarshipCount: reductions.length,
    manualScholarshipTotal: roundCurrency(explicitRows.reduce((sum, reduction) => sum + reduction.amount, 0)),
    manualScholarshipCount: explicitRows.length,
    byScope: byScope.map((entry) => ({ scope: entry.key, amount: entry.amount })),
    byGradeGroup: byGradeGroup.map((entry) => ({ gradeGroup: entry.key, amount: entry.amount })),
    byPaymentOption: byPaymentOption.map((entry) => ({ paymentOptionType: entry.key, amount: entry.amount })),
    scholarships: reductions,
    reductions
  };
}

function buildReductionAnalyticsFromSnapshots(input: {
  academicYearName: string;
  periodType: ReportType;
  referenceDate?: string;
  parentSnapshots: Awaited<ReturnType<typeof getParentFinancialSnapshot>>[];
}) {
  const bounds = resolvePeriodBounds(input.periodType, input.referenceDate);

  const reductions = input.parentSnapshots
    .flatMap((snapshot) => snapshot.reductions)
    .filter((reduction): reduction is NonNullable<(typeof input.parentSnapshots)[number]["reductions"][number]> => Boolean(reduction))
    .filter((reduction) => {
      const date = new Date(reduction.effectiveDate);
      return date >= bounds.start && date <= bounds.end;
    })
    .map((reduction) => {
      const ownerSnapshot = input.parentSnapshots.find((snapshot) => snapshot.parent.id === reduction.parentId);
      return {
        ...reduction,
        parentName: ownerSnapshot?.parent.fullName ?? null
      };
    });

  const uniqueReductions = Array.from(
    reductions.reduce((acc, reduction) => {
      const key = [
        reduction.parentId ?? "parent",
        reductionDedupKey(reduction)
      ].join("|");
      if (!acc.has(key)) acc.set(key, reduction);
      return acc;
    }, new Map<string, (typeof reductions)[number]>()).values()
  );

  const byScope = groupCurrencyTotals(uniqueReductions.map((reduction) => ({ key: String(reduction.scope ?? "UNKNOWN"), amount: reduction.amount })));
  const byGradeGroup = groupCurrencyTotals(uniqueReductions.map((reduction) => ({ key: String(reduction.gradeGroup ?? GradeGroup.CUSTOM), amount: reduction.amount })));
  const byPaymentOption = groupCurrencyTotals(uniqueReductions.map((reduction) => ({ key: String(reduction.paymentOptionType ?? PaymentOptionType.CUSTOM), amount: reduction.amount })));
  const scholarships = uniqueReductions.filter((reduction) =>
    reduction.scope === ReductionScope.MANUAL ||
    reduction.title.toLowerCase().includes("bourse") ||
    reduction.title.toLowerCase().includes("scholarship")
  );

  return {
    academicYear: input.academicYearName,
    periodType: input.periodType,
    periodLabel: bounds.label,
    totalReductions: roundCurrency(uniqueReductions.reduce((sum, reduction) => sum + reduction.amount, 0)),
    reductionCount: uniqueReductions.length,
    scholarshipTotal: roundCurrency(uniqueReductions.reduce((sum, reduction) => sum + reduction.amount, 0)),
    scholarshipCount: uniqueReductions.length,
    manualScholarshipTotal: roundCurrency(scholarships.reduce((sum, reduction) => sum + reduction.amount, 0)),
    manualScholarshipCount: scholarships.length,
    byScope: byScope.map((entry) => ({ scope: entry.key, amount: entry.amount })),
    byGradeGroup: byGradeGroup.map((entry) => ({ gradeGroup: entry.key, amount: entry.amount })),
    byPaymentOption: byPaymentOption.map((entry) => ({ paymentOptionType: entry.key, amount: entry.amount })),
    scholarships,
    reductions: uniqueReductions
  };
}

export async function getReductionAnalytics(input: {
  schoolId: string;
  academicYearName?: string;
  periodType: ReportType;
  referenceDate?: string;
}) {
  const { academicYear } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const parents = await prisma.parent.findMany({ where: { schoolId: input.schoolId }, select: { id: true } });
  const parentSnapshots = await Promise.all(parents.map((parent) => getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: parent.id,
    academicYearName: academicYear.name
  })));

  return buildReductionAnalyticsFromSnapshots({
    academicYearName: academicYear.name,
    periodType: input.periodType,
    referenceDate: input.referenceDate,
    parentSnapshots
  });
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
  const existingInstallments = await prisma.paymentInstallment.findMany({
    where: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      studentId: input.studentId ?? null
    },
    include: { allocations: true }
  });
  const hasLockedInstallments = existingInstallments.some((installment) =>
    Number(installment.amountPaid || 0) > 0 || installment.allocations.length > 0
  );
  const assignmentAlreadyMatches = Boolean(
    existingAssignment
    && existingAssignment.tuitionPlanId === plan.id
    && existingAssignment.paymentOptionType === input.paymentOptionType
    && existingAssignment.gradeGroup === gradeGroup
  );

  if (hasLockedInstallments) {
    if (!assignmentAlreadyMatches) {
      throw new Error("Ce plan ne peut pas être remplacé car des paiements sont déjà alloués à cet élève.");
    }
    return existingAssignment;
  }

  if (assignmentAlreadyMatches && existingInstallments.length > 0) {
    return existingAssignment;
  }

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
  const installmentTotal = roundCurrency(input.installments.reduce((sum, row) => sum + Number(row.amountDue || 0), 0));
  const effectiveReductionAmount = roundCurrency(
    (input.reductionAmount ?? 0) > 0
      ? Number(input.reductionAmount)
      : Math.max(Number(input.customTotal || 0) - installmentTotal, 0)
  );
  const agreementBalanceDue = roundCurrency(input.customTotal - effectiveReductionAmount);

  const targetInstallments = await prisma.paymentInstallment.findMany({
    where: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      studentId: input.studentId ?? null,
      academicYearId: academicYear.id
    },
    include: { allocations: true }
  });
  const hasLockedInstallments = targetInstallments.some((installment) =>
    Number(installment.amountPaid || 0) > 0 || installment.allocations.length > 0
  );
  if (hasLockedInstallments) {
    throw new Error("Ce dossier a déjà des paiements alloués. Annulez ou régularisez les paiements avant de remplacer le plan par un accord manuel.");
  }

  const profile = await prisma.parentFinancialProfile.upsert({
    where: { parentId_academicYearId: { parentId: input.parentId, academicYearId: academicYear.id } },
    update: {
      totalDebt: agreementBalanceDue,
      totalReduction: effectiveReductionAmount
    },
    create: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      totalDebt: agreementBalanceDue,
      totalReduction: effectiveReductionAmount
    }
  });

  const agreementStatus = input.status ?? AgreementStatus.PENDING_APPROVAL;
  const agreement = await prisma.$transaction(async (tx) => {
    await tx.paymentInstallment.deleteMany({
      where: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id
      }
    });
    await tx.discount.deleteMany({
      where: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        studentId: input.studentId ?? null,
        academicYearId: academicYear.id
      }
    });

    const createdAgreement = await tx.financialAgreement.create({
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
        reductionAmount: effectiveReductionAmount,
        balanceDue: agreementBalanceDue,
        notes: input.notes ?? null,
        privateNotes: input.privateNotes ?? null,
        history: [
          {
            at: new Date().toISOString(),
            event: "AGREEMENT_CREATED",
            status: agreementStatus,
            scholarshipAmount: effectiveReductionAmount
          }
        ],
        approvalRequestedAt: new Date(),
        approvedAt: agreementStatus === AgreementStatus.APPROVED ? new Date() : null
      }
    });

    await tx.parentFinancialProfile.update({
      where: { id: profile.id },
      data: {
        activeTuitionPlanId: null,
        activeAgreementId: createdAgreement.id,
        totalDebt: agreementBalanceDue,
        totalReduction: effectiveReductionAmount
      }
    });

    const existingAssignment = await tx.parentPlanAssignment.findFirst({
      where: {
        academicYearId: academicYear.id,
        parentId: input.parentId,
        studentId: input.studentId ?? null
      }
    });
    const assignmentData = {
      financialProfileId: profile.id,
      tuitionPlanId: null,
      financialAgreementId: createdAgreement.id,
      gradeGroup: input.gradeGroup ?? GradeGroup.CUSTOM,
      paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
      expectedTotal: roundCurrency(input.customTotal),
      reductionTotal: effectiveReductionAmount,
      remainingBalanceSnapshot: agreementBalanceDue,
      isActive: true,
      notes: input.notes ?? "Accord manuel owner-parent classe dans Bourse"
    };
    if (existingAssignment) {
      await tx.parentPlanAssignment.update({ where: { id: existingAssignment.id }, data: assignmentData });
    } else {
      await tx.parentPlanAssignment.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: input.studentId ?? null,
          academicYearId: academicYear.id,
          ...assignmentData
        }
      });
    }

    for (const [index, row] of input.installments.entries()) {
      await tx.paymentInstallment.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: input.studentId ?? null,
          academicYearId: academicYear.id,
          financialProfileId: profile.id,
          financialAgreementId: createdAgreement.id,
          label: row.label,
          sequence: index + 1,
          periodKey: `agreement-${createdAgreement.id}-${index + 1}`,
          dueDate: new Date(row.dueDate),
          amountDue: roundCurrency(row.amountDue),
          reductionAmount: 0,
          status: "SCHEDULED",
          notes: row.notes ?? null
        }
      });
    }

    if (effectiveReductionAmount > 0) {
      await tx.discount.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: input.studentId ?? null,
          academicYearId: academicYear.id,
          financialProfileId: profile.id,
          sourceAgreementId: createdAgreement.id,
          approvedById: input.approvedById,
          title: `Bourse - ${input.title}`,
          scope: ReductionScope.MANUAL,
          amount: effectiveReductionAmount,
          paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT,
          gradeGroup: input.gradeGroup ?? GradeGroup.CUSTOM,
          description: input.notes ?? "Bourse issue d'un accord personnel parent-owner."
        }
      });
    }

    return createdAgreement;
  });

  return {
    academicYear,
    profileId: profile.id,
    agreementId: agreement.id,
    status: agreement.status
  };
}

const TUITION_BASE_RATES: Record<GradeGroup, number> = {
  K: 3082.5,
  GRADE_1_5: 3770,
  GRADE_6_8: 4595,
  GRADE_9_12: 5420,
  CUSTOM: 0
};

const PLAN_DISCOUNT_RATES: Record<PaymentOptionType, number> = {
  FULL_PRESEPTEMBER: 10,
  TWO_INSTALLMENTS: 5,
  THREE_INSTALLMENTS: 2,
  STANDARD_MONTHLY: 0,
  SPECIAL_OWNER_AGREEMENT: 0,
  CUSTOM: 0
};

type TuitionEngineStudent = {
  id: string;
  fullName: string;
  class?: { name: string; level: string } | null;
  annualFee?: number | null;
};

type TuitionEngineScheduleRow = {
  sequence: number;
  label: string;
  periodKey: string;
  dueDate: Date;
  amountDue: number;
};

type TuitionEngineCalculation = {
  studentId: string;
  studentName: string;
  gradeGroup: GradeGroup;
  paymentOptionType: PaymentOptionType;
  baseAnnualTuition: number;
  familyDiscountRate: number;
  familyDiscountAmount: number;
  familyAdjustedTuition: number;
  planDiscountRate: number;
  planDiscountAmount: number;
  additionalReductionAmount: number;
  totalReductionAmount: number;
  finalTuition: number;
  monthlyAmount: number | null;
  schedule: TuitionEngineScheduleRow[];
};

type TuitionAllocationLine = {
  installmentId: string;
  studentId: string | null;
  studentName: string;
  label: string;
  dueDate: string;
  dueBucket: "OVERDUE" | "CURRENT" | "FUTURE";
  amountDue: number;
  alreadyPaid: number;
  outstandingBefore: number;
  allocated: number;
  outstandingAfter: number;
};

function getBaseTuitionForGrade(gradeGroup: GradeGroup, fallbackAnnualFee?: number | null) {
  const official = TUITION_BASE_RATES[gradeGroup] ?? 0;
  return roundCurrency(official > 0 ? official : Number(fallbackAnnualFee || 0));
}

function buildEngineSchedule(input: {
  academicYearName: string;
  paymentOptionType: PaymentOptionType;
  finalTuition: number;
}) {
  const split = (count: number, rows: Array<Omit<ScheduleTemplate, "amount">>) => {
    const base = Math.floor((input.finalTuition / count) * 100) / 100;
    let running = 0;
    return rows.map((row, index) => {
      const amount = index === rows.length - 1 ? roundCurrency(input.finalTuition - running) : roundCurrency(base);
      running = roundCurrency(running + amount);
      return {
        sequence: index + 1,
        label: row.label,
        periodKey: row.periodKey,
        dueDate: buildDueDate(input.academicYearName, { ...row, amount }),
        amountDue: amount
      };
    });
  };

  if (input.paymentOptionType === PaymentOptionType.FULL_PRESEPTEMBER) {
    return split(1, [{ label: "Full annual payment before September", periodKey: "before-september", dueMonth: 8, dueDay: 31 }]);
  }
  if (input.paymentOptionType === PaymentOptionType.TWO_INSTALLMENTS) {
    return split(2, [
      { label: "Installment 1 - before September", periodKey: "before-september", dueMonth: 8, dueDay: 31 },
      { label: "Installment 2 - before February", periodKey: "before-february", dueMonth: 2, dueDay: 28 }
    ]);
  }
  if (input.paymentOptionType === PaymentOptionType.THREE_INSTALLMENTS) {
    return split(3, [
      { label: "Installment 1 - before September", periodKey: "before-september", dueMonth: 8, dueDay: 31 },
      { label: "Installment 2 - Dec/Jan/Feb period", periodKey: "dec-jan-feb", dueMonth: 2, dueDay: 28 },
      { label: "Installment 3 - Mar/Apr/May/June period", periodKey: "mar-apr-may-jun", dueMonth: 6, dueDay: 30 }
    ]);
  }

  const monthlyAmount = roundCurrency(input.finalTuition / 10);
  return [
    { sequence: 1, label: "Initial 4-month payment", periodKey: "initial-four-months", dueDate: buildDueDate(input.academicYearName, { label: "Initial", periodKey: "initial", amount: monthlyAmount * 4, dueMonth: 8, dueDay: 31 }), amountDue: roundCurrency(monthlyAmount * 4) },
    { sequence: 2, label: "Month 5 payment", periodKey: "month-5", dueDate: buildDueDate(input.academicYearName, { label: "Month 5", periodKey: "month-5", amount: monthlyAmount, dueMonth: 9, dueDay: 30 }), amountDue: monthlyAmount },
    { sequence: 3, label: "Month 6 payment", periodKey: "month-6", dueDate: buildDueDate(input.academicYearName, { label: "Month 6", periodKey: "month-6", amount: monthlyAmount, dueMonth: 10, dueDay: 31 }), amountDue: monthlyAmount },
    { sequence: 4, label: "Month 7 payment", periodKey: "month-7", dueDate: buildDueDate(input.academicYearName, { label: "Month 7", periodKey: "month-7", amount: monthlyAmount, dueMonth: 11, dueDay: 30 }), amountDue: monthlyAmount },
    { sequence: 5, label: "Month 8 payment", periodKey: "month-8", dueDate: buildDueDate(input.academicYearName, { label: "Month 8", periodKey: "month-8", amount: monthlyAmount, dueMonth: 12, dueDay: 31 }), amountDue: monthlyAmount },
    { sequence: 6, label: "Month 9 payment", periodKey: "month-9", dueDate: buildDueDate(input.academicYearName, { label: "Month 9", periodKey: "month-9", amount: monthlyAmount, dueMonth: 1, dueDay: 31 }), amountDue: monthlyAmount },
    { sequence: 7, label: "Month 10 payment", periodKey: "month-10", dueDate: buildDueDate(input.academicYearName, { label: "Month 10", periodKey: "month-10", amount: monthlyAmount, dueMonth: 2, dueDay: 28 }), amountDue: roundCurrency(input.finalTuition - roundCurrency(monthlyAmount * 9)) }
  ];
}

function calculateTuitionForStudent(input: {
  student: TuitionEngineStudent;
  childrenCount: number;
  paymentOptionType: PaymentOptionType;
  academicYearName: string;
  customAgreementFinalTuition?: number;
  additionalReductionAmount?: number;
}) {
  const gradeGroup = resolveGradeGroup({
    className: input.student.class?.name,
    level: input.student.class?.level,
    studentName: input.student.fullName
  });
  const baseAnnualTuition = getBaseTuitionForGrade(gradeGroup, input.student.annualFee);
  const familyDiscountRate = input.childrenCount >= 2 ? 10 : 0;
  const familyDiscountAmount = roundCurrency(baseAnnualTuition * (familyDiscountRate / 100));
  const familyAdjustedTuition = roundCurrency(baseAnnualTuition - familyDiscountAmount);
  const planDiscountRate = PLAN_DISCOUNT_RATES[input.paymentOptionType] ?? 0;
  const customAgreementFinalTuition = input.paymentOptionType === PaymentOptionType.SPECIAL_OWNER_AGREEMENT
    && Number.isFinite(input.customAgreementFinalTuition)
    && Number(input.customAgreementFinalTuition) >= 0
    ? roundCurrency(Number(input.customAgreementFinalTuition))
    : null;
  const planDiscountAmount = customAgreementFinalTuition !== null
    ? roundCurrency(Math.max(familyAdjustedTuition - customAgreementFinalTuition, 0))
    : roundCurrency(familyAdjustedTuition * (planDiscountRate / 100));
  const additionalReductionAmount = roundCurrency(Math.max(Number(input.additionalReductionAmount || 0), 0));
  const finalTuitionBeforeAdditionalReduction = customAgreementFinalTuition ?? roundCurrency(familyAdjustedTuition - planDiscountAmount);
  const finalTuition = roundCurrency(Math.max(finalTuitionBeforeAdditionalReduction - additionalReductionAmount, 0));
  const totalReductionAmount = roundCurrency(familyDiscountAmount + planDiscountAmount + additionalReductionAmount);

  return {
    studentId: input.student.id,
    studentName: input.student.fullName,
    gradeGroup,
    paymentOptionType: input.paymentOptionType,
    baseAnnualTuition,
    familyDiscountRate,
    familyDiscountAmount,
    familyAdjustedTuition,
    planDiscountRate,
    planDiscountAmount,
    additionalReductionAmount,
    totalReductionAmount,
    finalTuition,
    monthlyAmount: input.paymentOptionType === PaymentOptionType.STANDARD_MONTHLY ? roundCurrency(finalTuition / 10) : null,
    schedule: buildEngineSchedule({
      academicYearName: input.academicYearName,
      paymentOptionType: input.paymentOptionType,
      finalTuition
    })
  } satisfies TuitionEngineCalculation;
}

function summarizeTuitionMessage(input: {
  totalReceived: number;
  lines: TuitionAllocationLine[];
  advanceBalance: number;
}) {
  const byStudent = groupCurrencyTotals(input.lines.map((line) => ({ key: line.studentName, amount: line.allocated })));
  const unpaid = input.lines.filter((line) => line.outstandingAfter > 0);
  const overdue = input.lines.filter((line) => line.dueBucket === "OVERDUE" && line.outstandingAfter > 0);
  const next = input.lines
    .filter((line) => line.outstandingAfter > 0)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0];

  return [
    `Total amount received: ${formatAlertCurrency(input.totalReceived)}.`,
    byStudent.length
      ? `Allocated: ${byStudent.map((row) => `${row.key} ${formatAlertCurrency(row.amount)}`).join("; ")}.`
      : "No allocation was applied.",
    unpaid.length
      ? `Remaining unpaid: ${formatAlertCurrency(unpaid.reduce((sum, line) => sum + line.outstandingAfter, 0))}.`
      : "All targeted obligations are fully paid.",
    next ? `Next required payment: ${next.studentName} - ${next.label}, ${formatAlertCurrency(next.outstandingAfter)} due by ${dayjs(next.dueDate).format("DD/MM/YYYY")}.` : "No next payment is currently required.",
    overdue.length ? `Overdue balance: ${formatAlertCurrency(overdue.reduce((sum, line) => sum + line.outstandingAfter, 0))}.` : "No overdue balance remains in this allocation preview.",
    input.advanceBalance > 0 ? `Advance retained: ${formatAlertCurrency(input.advanceBalance)}.` : ""
  ].filter(Boolean).join(" ");
}

function calculateRetainedReductionForStudent(input: {
  discounts: Array<{
    studentId: string | null;
    sourceAgreementId: string | null;
    scope: ReductionScope;
    amount: number;
    paymentOptionType: PaymentOptionType | null;
    gradeGroup: GradeGroup | null;
  }>;
  studentId: string;
  paymentOptionType: PaymentOptionType;
  gradeGroup: GradeGroup;
  childrenCount: number;
}) {
  return roundCurrency(input.discounts.reduce((sum, discount) => {
    if (discount.sourceAgreementId) return sum;
    if (discount.scope === ReductionScope.PARENT || discount.scope === ReductionScope.PAYMENT_OPTION) return sum;
    if (discount.studentId && discount.studentId !== input.studentId) return sum;
    if (discount.paymentOptionType && discount.paymentOptionType !== input.paymentOptionType) return sum;
    if (discount.gradeGroup && discount.gradeGroup !== input.gradeGroup) return sum;

    const amount = Number(discount.amount || 0);
    if (amount <= 0) return sum;
    return sum + (discount.studentId ? amount : amount / Math.max(input.childrenCount, 1));
  }, 0));
}

export function buildTuitionParentNotificationMessages(input: {
  parentName: string;
  language?: string | null;
  transactionNumber: string;
  receiptNumber: string;
  paymentMethod: PaymentMethod | string;
  allocationMode: "AUTO" | "MANUAL";
  allocationPreview: {
    totalReceived: number;
    allocatedTotal: number;
    missingAmount: number;
    advanceBalance: number;
    message: string;
    lines: TuitionAllocationLine[];
  };
}) {
  const language = normalizeMessageLanguage(input.language);
  const byStudent = input.allocationPreview.lines.reduce<Record<string, { allocated: number; remaining: number }>>((acc, line) => {
    const current = acc[line.studentName] ?? { allocated: 0, remaining: 0 };
    current.allocated = roundCurrency(current.allocated + line.allocated);
    current.remaining = roundCurrency(current.remaining + line.outstandingAfter);
    acc[line.studentName] = current;
    return acc;
  }, {});
  const nextPayment = input.allocationPreview.lines
    .filter((line) => line.outstandingAfter > 0)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0];
  const allocationLines = Object.entries(byStudent).map(([studentName, summary]) => language === "en"
    ? `- ${studentName}: paid ${formatAlertCurrency(summary.allocated)}, remaining ${formatAlertCurrency(summary.remaining)}`
    : `- ${studentName} : payé ${formatAlertCurrency(summary.allocated)}, reste ${formatAlertCurrency(summary.remaining)}`
  );
  const nextLine = nextPayment
    ? language === "en"
      ? `${nextPayment.studentName} - ${nextPayment.label}: ${formatAlertCurrency(nextPayment.outstandingAfter)} due by ${dayjs(nextPayment.dueDate).format("DD/MM/YYYY")}`
      : `${nextPayment.studentName} - ${nextPayment.label} : ${formatAlertCurrency(nextPayment.outstandingAfter)} à payer avant le ${dayjs(nextPayment.dueDate).format("DD/MM/YYYY")}`
    : language === "en" ? "No next payment is currently required." : "Aucun prochain paiement n'est requis actuellement.";
  if (language === "fr") {
    const subject = `Reçu de scolarité EduPay ${input.receiptNumber}`;
    const emailBody = [
      `Bonjour ${input.parentName},`,
      "",
      "EduPay a enregistré un paiement de scolarité sur votre compte famille.",
      "",
      `Transaction: ${input.transactionNumber}`,
      `Reçu : ${input.receiptNumber}`,
      `Mode de paiement : ${input.paymentMethod}`,
      `Mode d'affectation : ${input.allocationMode}`,
      `Montant reçu : ${formatAlertCurrency(input.allocationPreview.totalReceived)}`,
      `Montant imputé : ${formatAlertCurrency(input.allocationPreview.allocatedTotal)}`,
      `Solde restant : ${formatAlertCurrency(input.allocationPreview.missingAmount)}`,
      `Avance conservée : ${formatAlertCurrency(input.allocationPreview.advanceBalance)}`,
      "",
      "Imputation par enfant :",
      allocationLines.join("\n") || "- Aucune affectation appliquée.",
      "",
      `Prochain paiement : ${nextLine}`,
      "",
      `Note financière : ${input.allocationPreview.message}`,
      "",
      "Veuillez conserver ce message avec votre reçu EduPay."
    ].join("\n");
    const smsBody = [
      `EduPay ${input.receiptNumber} : reçu ${formatAlertCurrency(input.allocationPreview.totalReceived)}`,
      `imputé ${formatAlertCurrency(input.allocationPreview.allocatedTotal)}`,
      `reste ${formatAlertCurrency(input.allocationPreview.missingAmount)}.`,
      `Prochain: ${nextLine}`
    ].join(" ");
    return { subject, emailBody, smsBody, dashboardBody: emailBody };
  }

  const subject = `EduPay tuition receipt ${input.receiptNumber}`;
  const emailBody = [
    `Hello ${input.parentName},`,
    "",
    "EduPay has recorded a tuition payment on your family account.",
    "",
    `Transaction: ${input.transactionNumber}`,
    `Receipt: ${input.receiptNumber}`,
    `Payment method: ${input.paymentMethod}`,
    `Allocation mode: ${input.allocationMode}`,
    `Amount received: ${formatAlertCurrency(input.allocationPreview.totalReceived)}`,
    `Amount allocated: ${formatAlertCurrency(input.allocationPreview.allocatedTotal)}`,
    `Remaining balance: ${formatAlertCurrency(input.allocationPreview.missingAmount)}`,
    `Advance balance: ${formatAlertCurrency(input.allocationPreview.advanceBalance)}`,
    "",
    "Allocation by child:",
    allocationLines.join("\n") || "- No allocation was applied.",
    "",
    `Next payment: ${nextLine}`,
    "",
    `Finance note: ${input.allocationPreview.message}`,
    "",
    "Please keep this message with your EduPay receipt."
  ].join("\n");
  const smsBody = [
    `EduPay ${input.receiptNumber}: received ${formatAlertCurrency(input.allocationPreview.totalReceived)}`,
    `allocated ${formatAlertCurrency(input.allocationPreview.allocatedTotal)}`,
    `remaining ${formatAlertCurrency(input.allocationPreview.missingAmount)}.`,
    `Next: ${nextLine}`
  ].join(" ");
  return { subject, emailBody, smsBody, dashboardBody: emailBody };
}

export async function ensureParentTuitionEnginePlan(input: {
  schoolId: string;
  parentId: string;
  studentIds?: string[];
  paymentOptionType: PaymentOptionType;
  academicYearName?: string;
  actorUserId?: string;
  notes?: string;
}) {
  if (input.paymentOptionType === PaymentOptionType.CUSTOM || input.paymentOptionType === PaymentOptionType.SPECIAL_OWNER_AGREEMENT) {
    throw new Error("Custom tuition agreements must be created through the special agreement approval workflow.");
  }

  const { academicYear, plans } = await getTargetAcademicYear(input.schoolId, input.academicYearName);
  const parent = await prisma.parent.findFirst({
    where: { id: input.parentId, schoolId: input.schoolId },
    include: { students: { include: { class: true } } }
  });
  if (!parent) throw new Error("Parent not found.");
  if (parent.students.length === 0) throw new Error("Parent has no linked children.");
  const requestedStudentIds = Array.from(new Set(input.studentIds ?? []));
  if (requestedStudentIds.length > 0) {
    const parentStudentIds = new Set(parent.students.map((student) => student.id));
    const invalidStudentIds = requestedStudentIds.filter((studentId) => !parentStudentIds.has(studentId));
    if (invalidStudentIds.length > 0) {
      throw new Error("One or more selected children do not belong to this parent.");
    }
  }
  const existingAssignments = await prisma.parentPlanAssignment.findMany({
    where: {
      parentId: input.parentId,
      academicYearId: academicYear.id,
      isActive: true
    },
    include: { financialAgreement: true }
  });
  const existingAssignmentByStudent = new Map(existingAssignments.filter((assignment) => assignment.studentId).map((assignment) => [assignment.studentId!, assignment]));
  const existingGenericAssignment = existingAssignments.find((assignment) => !assignment.studentId) ?? null;
  const retainedDiscounts = await prisma.discount.findMany({
    where: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: academicYear.id,
      scope: { notIn: [ReductionScope.PARENT, ReductionScope.PAYMENT_OPTION] }
    },
    select: {
      studentId: true,
      sourceAgreementId: true,
      scope: true,
      amount: true,
      paymentOptionType: true,
      gradeGroup: true
    }
  });

  return prisma.$transaction(async (tx) => {
    const profile = await tx.parentFinancialProfile.upsert({
      where: { parentId_academicYearId: { parentId: input.parentId, academicYearId: academicYear.id } },
      update: {},
      create: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        academicYearId: academicYear.id
      }
    });

    const targetStudents = requestedStudentIds.length > 0
      ? parent.students.filter((student) => requestedStudentIds.includes(student.id))
      : parent.students;

    const calculations = targetStudents.map((student) => {
      const existingAssignment = existingAssignmentByStudent.get(student.id) ?? existingGenericAssignment;
      const paymentOptionType = existingAssignment?.paymentOptionType ?? input.paymentOptionType;
      const gradeGroup = resolveGradeGroup({
        className: student.class?.name,
        level: student.class?.level,
        studentName: student.fullName
      });
      const customAgreementFinalTuition = existingAssignment?.financialAgreement
        ? Number(
          existingAssignment.financialAgreement.balanceDue
          || existingAssignment.remainingBalanceSnapshot
          || existingAssignment.expectedTotal
          || existingAssignment.financialAgreement.customTotal
          || student.annualFee
          || 0
        )
        : undefined;
      const additionalReductionAmount = calculateRetainedReductionForStudent({
        discounts: retainedDiscounts,
        studentId: student.id,
        paymentOptionType,
        gradeGroup,
        childrenCount: parent.students.length
      });
      return calculateTuitionForStudent({
        student,
        childrenCount: parent.students.length,
        paymentOptionType,
        academicYearName: academicYear.name,
        customAgreementFinalTuition,
        additionalReductionAmount
      });
    });

    for (const calculation of calculations) {
      const plan = plans.find((entry: any) => entry.gradeGroup === calculation.gradeGroup && entry.paymentOptionType === calculation.paymentOptionType) ?? null;
      const existingAssignment = await tx.parentPlanAssignment.findFirst({
        where: { parentId: input.parentId, academicYearId: academicYear.id, studentId: calculation.studentId }
      });
      const existingInstallments = await tx.paymentInstallment.findMany({
        where: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: calculation.studentId,
          academicYearId: academicYear.id
        },
        include: { allocations: true }
      });
      const hasLockedInstallments = existingInstallments.some((installment) =>
        Number(installment.amountPaid || 0) > 0 || installment.allocations.length > 0
      );
      if (hasLockedInstallments) {
        if (existingAssignment?.paymentOptionType !== calculation.paymentOptionType) {
          throw new Error("This student already has tuition payments allocated. Create an approved special agreement before changing the payment plan.");
        }
        continue;
      }
      if (existingAssignment && existingInstallments.length > 0) {
        continue;
      }

      await tx.paymentInstallment.deleteMany({
        where: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: calculation.studentId,
          academicYearId: academicYear.id
        }
      });
      await tx.discount.deleteMany({
        where: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          studentId: calculation.studentId,
          academicYearId: academicYear.id,
          scope: { in: [ReductionScope.PARENT, ReductionScope.PAYMENT_OPTION] }
        }
      });

      const assignmentData = {
        financialProfileId: profile.id,
        tuitionPlanId: plan?.id ?? null,
        financialAgreementId: null,
        gradeGroup: calculation.gradeGroup,
        paymentOptionType: calculation.paymentOptionType,
        expectedTotal: calculation.finalTuition,
        reductionTotal: calculation.totalReductionAmount,
        remainingBalanceSnapshot: calculation.finalTuition,
        isActive: true,
        notes: input.notes ?? "EduPay Tuition Payment Engine assignment"
      };
      if (existingAssignment) {
        await tx.parentPlanAssignment.update({ where: { id: existingAssignment.id }, data: assignmentData });
      } else {
        await tx.parentPlanAssignment.create({
          data: {
            schoolId: input.schoolId,
            parentId: input.parentId,
            studentId: calculation.studentId,
            academicYearId: academicYear.id,
            ...assignmentData
          }
        });
      }

      if (calculation.familyDiscountAmount > 0) {
        await tx.discount.create({
          data: {
            schoolId: input.schoolId,
            parentId: input.parentId,
            studentId: calculation.studentId,
            academicYearId: academicYear.id,
            financialProfileId: profile.id,
            tuitionPlanId: plan?.id,
            title: "Family account discount",
            scope: ReductionScope.PARENT,
            amount: calculation.familyDiscountAmount,
            percentage: calculation.familyDiscountRate,
            paymentOptionType: calculation.paymentOptionType,
            gradeGroup: calculation.gradeGroup,
            description: "10% family discount applied first because the parent has two or more children enrolled."
          }
        });
      }
      if (calculation.planDiscountAmount > 0) {
        await tx.discount.create({
          data: {
            schoolId: input.schoolId,
            parentId: input.parentId,
            studentId: calculation.studentId,
            academicYearId: academicYear.id,
            financialProfileId: profile.id,
            tuitionPlanId: plan?.id,
            title: `${getPaymentOptionLabel(calculation.paymentOptionType)} discount`,
            scope: ReductionScope.PAYMENT_OPTION,
            amount: calculation.planDiscountAmount,
            percentage: calculation.planDiscountRate,
            paymentOptionType: calculation.paymentOptionType,
            gradeGroup: calculation.gradeGroup,
            description: "Payment plan discount applied after the family discount."
          }
        });
      }

      for (const row of calculation.schedule) {
        await tx.paymentInstallment.create({
          data: {
            schoolId: input.schoolId,
            parentId: input.parentId,
            studentId: calculation.studentId,
            academicYearId: academicYear.id,
            financialProfileId: profile.id,
            tuitionPlanId: plan?.id,
            label: row.label,
            sequence: row.sequence,
            periodKey: row.periodKey,
            dueDate: row.dueDate,
            amountDue: row.amountDue,
            amountPaid: 0,
            reductionAmount: 0,
            status: InstallmentStatus.SCHEDULED,
            notes: input.notes ?? "Generated by EduPay Tuition Payment Engine"
          }
        });
      }
    }

    const totalExpected = roundCurrency(calculations.reduce((sum, row) => sum + row.finalTuition, 0));
    const totalReduction = roundCurrency(calculations.reduce((sum, row) => sum + row.totalReductionAmount, 0));
    await tx.parentFinancialProfile.update({
      where: { id: profile.id },
      data: {
        totalDebt: totalExpected,
        totalReduction,
        activeTuitionPlanId: null,
        activeAgreementId: null
      }
    });

    if (input.actorUserId) {
      await tx.auditLog.create({
        data: {
          schoolId: input.schoolId,
          userId: input.actorUserId,
          action: "TUITION_ENGINE_PLAN_ASSIGNED",
          metadata: {
            parentId: input.parentId,
            academicYearId: academicYear.id,
            paymentOptionType: input.paymentOptionType,
            familyAccount: parent.students.length >= 2,
            requestedStudentIds,
            calculations
          }
        }
      });
    }

    return { academicYear, parent: { id: parent.id, fullName: parent.fullName }, profileId: profile.id, calculations };
  });
}

function buildAllocationPreviewFromInstallments(input: {
  amount: number;
  installments: Array<{
    id: string;
    studentId: string | null;
    label: string;
    dueDate: Date;
    amountDue: number;
    amountPaid: number;
    student?: { fullName: string } | null;
    allocations: Array<{ amount: number }>;
  }>;
  mode: "AUTO" | "MANUAL";
  manualAllocations?: Array<{ installmentId: string; amount: number }>;
}) {
  const getInstallmentSequence = (id: string) => {
    const match = id.match(/-(\d+)$/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const today = dayjs().endOf("day");
  const candidates = input.installments.map((installment) => {
    const alreadyPaid = roundCurrency(Math.max(
      Number(installment.amountPaid || 0),
      installment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
    ));
    const outstandingBefore = roundCurrency(Math.max(Number(installment.amountDue || 0) - alreadyPaid, 0));
    const dueDate = dayjs(installment.dueDate);
    const dueBucket: TuitionAllocationLine["dueBucket"] = dueDate.isBefore(today, "day")
      ? "OVERDUE"
      : dueDate.isBefore(today.add(30, "day"), "day") ? "CURRENT" : "FUTURE";
    return {
      installment,
      alreadyPaid,
      outstandingBefore,
      dueBucket,
      weight: dueBucket === "OVERDUE" ? 1 : dueBucket === "CURRENT" ? 2 : 3
    };
  }).filter((row) => row.outstandingBefore > 0);
  const compareInstallmentOrder = (left: typeof candidates[number], right: typeof candidates[number]) => {
    const sequenceDifference = getInstallmentSequence(left.installment.id) - getInstallmentSequence(right.installment.id);
    if (sequenceDifference !== 0) return sequenceDifference;
    return left.installment.dueDate.getTime() - right.installment.dueDate.getTime();
  };

  const allocatedByInstallment = new Map<string, number>();

  if (input.mode === "MANUAL") {
    let manualRemaining = roundCurrency(input.amount);
    for (const manual of input.manualAllocations ?? []) {
      if (manualRemaining <= 0) break;
      const candidate = candidates.find((row) => row.installment.id === manual.installmentId);
      if (!candidate) continue;
      const amount = roundCurrency(Math.max(0, Math.min(manual.amount, candidate.outstandingBefore, manualRemaining)));
      allocatedByInstallment.set(manual.installmentId, amount);
      manualRemaining = roundCurrency(manualRemaining - amount);
    }
  } else {
    let remaining = roundCurrency(input.amount);
    for (const bucket of ["OVERDUE", "CURRENT", "FUTURE"] as const) {
      if (remaining <= 0) break;
      const bucketRows = candidates
        .filter((row) => row.dueBucket === bucket && row.outstandingBefore > 0)
        .sort(compareInstallmentOrder);
      const dueDateGroups = bucketRows.reduce<Array<typeof bucketRows>>((groups, row) => {
        const lastGroup = groups[groups.length - 1];
        const lastSequence = lastGroup?.[0] ? getInstallmentSequence(lastGroup[0].installment.id) : null;
        if (lastGroup && lastSequence === getInstallmentSequence(row.installment.id)) {
          lastGroup.push(row);
        } else {
          groups.push([row]);
        }
        return groups;
      }, []);

      for (const dueDateGroup of dueDateGroups) {
        if (remaining <= 0) break;
        const groupOutstanding = roundCurrency(dueDateGroup.reduce((sum, row) => sum + row.outstandingBefore, 0));
        if (groupOutstanding <= 0) continue;

        if (remaining >= groupOutstanding) {
          for (const row of dueDateGroup) {
            allocatedByInstallment.set(row.installment.id, roundCurrency((allocatedByInstallment.get(row.installment.id) ?? 0) + row.outstandingBefore));
          }
          remaining = roundCurrency(remaining - groupOutstanding);
          continue;
        }

        let distributed = 0;
        dueDateGroup.forEach((row, index) => {
          const amount = index === dueDateGroup.length - 1
            ? roundCurrency(remaining - distributed)
            : roundCurrency((remaining * row.outstandingBefore) / groupOutstanding);
          distributed = roundCurrency(distributed + amount);
          allocatedByInstallment.set(row.installment.id, roundCurrency((allocatedByInstallment.get(row.installment.id) ?? 0) + Math.min(amount, row.outstandingBefore)));
        });
        remaining = 0;
      }
    }
  }

  const lines = candidates.map<TuitionAllocationLine>((row) => {
    const allocated = roundCurrency(allocatedByInstallment.get(row.installment.id) ?? 0);
    return {
      installmentId: row.installment.id,
      studentId: row.installment.studentId,
      studentName: row.installment.student?.fullName ?? "Parent account",
      label: row.installment.label,
      dueDate: row.installment.dueDate.toISOString(),
      dueBucket: row.dueBucket,
      amountDue: roundCurrency(Number(row.installment.amountDue || 0)),
      alreadyPaid: row.alreadyPaid,
      outstandingBefore: row.outstandingBefore,
      allocated,
      outstandingAfter: roundCurrency(Math.max(row.outstandingBefore - allocated, 0))
    };
  });

  const allocatedTotal = roundCurrency(lines.reduce((sum, line) => sum + line.allocated, 0));
  const manualRequestedTotal = roundCurrency((input.manualAllocations ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const manualRequestsByInstallment = new Map<string, number>();
  const duplicateManualInstallments = new Set<string>();
  for (const row of input.manualAllocations ?? []) {
    if (manualRequestsByInstallment.has(row.installmentId)) {
      duplicateManualInstallments.add(row.installmentId);
    }
    manualRequestsByInstallment.set(row.installmentId, roundCurrency((manualRequestsByInstallment.get(row.installmentId) ?? 0) + Number(row.amount || 0)));
  }
  const candidateIds = new Set(candidates.map((row) => row.installment.id));
  const unknownManualInstallments = [...manualRequestsByInstallment.keys()].filter((installmentId) => !candidateIds.has(installmentId));
  const overBalanceManualInstallments = lines.filter((line) => {
    const requested = manualRequestsByInstallment.get(line.installmentId) ?? 0;
    return requested > line.outstandingBefore;
  });
  const advanceBalance = roundCurrency(Math.max(input.amount - allocatedTotal, 0));
  const missingAmount = roundCurrency(lines.reduce((sum, line) => sum + line.outstandingAfter, 0));
  const warnings = [
    input.mode === "MANUAL" && manualRequestedTotal > roundCurrency(input.amount)
      ? "Manual allocation total cannot exceed the received payment amount."
      : "",
    ...unknownManualInstallments.map((installmentId) => `Manual allocation target ${installmentId} is not available or already settled.`),
    ...[...duplicateManualInstallments].map((installmentId) => `Manual allocation target ${installmentId} is duplicated.`),
    ...overBalanceManualInstallments.map((line) => `${line.studentName} manual allocation for ${line.label} exceeds the open balance.`),
    input.mode === "MANUAL" && allocatedTotal < roundCurrency(input.amount)
      ? `Manual split leaves ${formatAlertCurrency(roundCurrency(input.amount - allocatedTotal))} as advance balance.`
      : "",
    ...lines.filter((line) => line.allocated > 0 && line.outstandingAfter > 0).map((line) => `${line.studentName} remains underpaid for ${line.label}.`),
    ...lines.filter((line) => line.dueBucket !== "FUTURE" && line.allocated === 0 && line.outstandingBefore > 0).map((line) => `${line.studentName} has an unpaid scheduled obligation: ${line.label}.`)
  ].filter(Boolean);

  return {
    mode: input.mode,
    totalReceived: roundCurrency(input.amount),
    allocatedTotal,
    advanceBalance,
    missingAmount,
    lines,
    warnings,
    message: summarizeTuitionMessage({ totalReceived: input.amount, lines, advanceBalance })
  };
}

export async function previewTuitionPaymentAllocation(input: {
  schoolId: string;
  parentId: string;
  studentIds?: string[];
  amount: number;
  paymentOptionType: PaymentOptionType;
  allocationMode: "AUTO" | "MANUAL";
  academicYearName?: string;
  manualAllocations?: Array<{ installmentId: string; amount: number }>;
}) {
  const setup = await ensureParentTuitionEnginePlan({
    schoolId: input.schoolId,
    parentId: input.parentId,
    studentIds: input.studentIds,
    paymentOptionType: input.paymentOptionType,
    academicYearName: input.academicYearName
  });
  const targetStudentIds = input.studentIds && input.studentIds.length > 0
    ? Array.from(new Set(input.studentIds))
    : setup.calculations.map((calculation) => calculation.studentId);
  const targetStudentIdSet = new Set(targetStudentIds);
  const installments = await prisma.paymentInstallment.findMany({
    where: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      academicYearId: setup.academicYear.id,
      studentId: { in: targetStudentIds }
    },
    include: { allocations: true, student: true },
    orderBy: [{ dueDate: "asc" }, { sequence: "asc" }]
  });
  const preview = buildAllocationPreviewFromInstallments({
    amount: input.amount,
    installments,
    mode: input.allocationMode,
    manualAllocations: input.manualAllocations
  });
  return {
    ...setup,
    calculations: setup.calculations.filter((calculation) => targetStudentIdSet.has(calculation.studentId)),
    allocationPreview: preview
  };
}

export async function recordTuitionEnginePayment(input: {
  schoolId: string;
  parentId: string;
  studentIds?: string[];
  amount: number;
  paymentOptionType: PaymentOptionType;
  allocationMode: "AUTO" | "MANUAL";
  method: PaymentMethod;
  status?: PaymentStatus;
  transactionNumber?: string;
  notes?: string;
  manualAllocations?: Array<{ installmentId: string; amount: number }>;
  createdById: string;
  academicYearName?: string;
}) {
  const setup = await ensureParentTuitionEnginePlan({
    schoolId: input.schoolId,
    parentId: input.parentId,
    studentIds: input.studentIds,
    paymentOptionType: input.paymentOptionType,
    academicYearName: input.academicYearName,
    actorUserId: input.createdById,
    notes: input.notes
  });
  const targetStudentIds = input.studentIds && input.studentIds.length > 0
    ? Array.from(new Set(input.studentIds))
    : setup.calculations.map((calculation) => calculation.studentId);
  const targetStudentIdSet = new Set(targetStudentIds);
  const targetCalculations = setup.calculations.filter((calculation) => targetStudentIdSet.has(calculation.studentId));

  const result = await prisma.$transaction(async (tx) => {
    const parent = await tx.parent.findFirstOrThrow({
      where: { id: input.parentId, schoolId: input.schoolId },
      include: { students: true }
    });
    const targetStudents = parent.students.filter((student) => targetStudentIdSet.has(student.id));
    if (targetStudents.length === 0) {
      throw new Error("Select at least one child for this tuition payment.");
    }
    const profile = await tx.parentFinancialProfile.findFirstOrThrow({
      where: { parentId: input.parentId, academicYearId: setup.academicYear.id }
    });
    const installments = await tx.paymentInstallment.findMany({
      where: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        academicYearId: setup.academicYear.id,
        studentId: { in: targetStudentIds }
      },
      include: { allocations: true, student: true },
      orderBy: [{ dueDate: "asc" }, { sequence: "asc" }]
    });
    const preview = buildAllocationPreviewFromInstallments({
      amount: input.amount,
      installments,
      mode: input.allocationMode,
      manualAllocations: input.manualAllocations
    });
    const blockingManualWarnings = preview.warnings.filter((warning) =>
      warning.includes("cannot exceed")
      || warning.includes("not available")
      || warning.includes("duplicated")
      || warning.includes("exceeds the open balance")
    );
    if (input.allocationMode === "MANUAL" && blockingManualWarnings.length > 0) {
      throw new Error(blockingManualWarnings.join(" "));
    }

    const txNumber = input.transactionNumber || `TUITION-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const payment = await tx.payment.create({
      data: {
        schoolId: input.schoolId,
        transactionNumber: txNumber,
        parentId: input.parentId,
        reason: `Tuition payment - ${getPaymentOptionLabel(input.paymentOptionType)}`,
        amount: roundCurrency(input.amount),
        amountInWords: `${amountToWords(input.amount, "fr")} dollars americains`,
        method: input.method,
        status: input.status ?? PaymentStatus.COMPLETED,
        createdById: input.createdById,
        academicYearId: setup.academicYear.id,
        parentFinancialProfileId: profile.id,
        notes: input.notes ?? null,
        students: { connect: targetStudents.map((student) => ({ id: student.id })) }
      }
    });

    for (const line of preview.lines.filter((row) => row.allocated > 0)) {
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          installmentId: line.installmentId,
          amount: line.allocated
        }
      });
      const updatedPaid = roundCurrency(line.alreadyPaid + line.allocated);
      await tx.paymentInstallment.update({
        where: { id: line.installmentId },
        data: {
          amountPaid: updatedPaid,
          status: deriveInstallmentStatus(line.amountDue, updatedPaid, new Date(line.dueDate))
        }
      });
    }

    const incompleteLines = preview.lines.filter((line) => line.dueBucket !== "FUTURE" && line.outstandingAfter > 0);
    if (incompleteLines.length > 0 || preview.advanceBalance > 0) {
      const alertMessage = preview.message;
      await tx.financialAlert.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          academicYearId: setup.academicYear.id,
          financialProfileId: profile.id,
          type: incompleteLines.length > 0 ? FinancialAlertType.UNPAID_BALANCE : FinancialAlertType.INCOMPLETE_TUITION_SCHEDULE,
          title: incompleteLines.length > 0 ? "Incomplete tuition payment allocation" : "Advance tuition payment recorded",
          message: alertMessage,
          severity: incompleteLines.length > 0 ? "HIGH" : "LOW",
          status: "OPEN",
          channel: NotificationChannel.DASHBOARD,
          supportedChannels: [NotificationChannel.DASHBOARD, NotificationChannel.EMAIL, NotificationChannel.SMS]
        }
      });
      await tx.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          type: incompleteLines.length > 0 ? NotificationType.UNPAID_BALANCE : NotificationType.INCOMPLETE_SCHEDULE,
          language: parent.preferredLanguage || "fr",
          channel: NotificationChannel.DASHBOARD,
          content: alertMessage,
          status: "OPEN"
        }
      });
    }

    const receiptNumber = `REC-${txNumber}`;
    const receiptBreakdown = {
      parentName: parent.fullName,
      children: targetCalculations,
      allocation: preview,
      paymentMethod: input.method,
      transactionNumber: txNumber,
      verificationCode: `EDP-${txNumber.slice(-8).replace(/[^A-Z0-9]/gi, "").toUpperCase().padStart(8, "0")}`
    };
    const receipt = await tx.receipt.create({
      data: {
        schoolId: input.schoolId,
        paymentId: payment.id,
        receiptNumber,
        pdfBase64: Buffer.from(JSON.stringify(receiptBreakdown, null, 2)).toString("base64"),
        pngBase64: Buffer.from(JSON.stringify({ receiptNumber, transactionNumber: txNumber })).toString("base64")
      }
    });

    await tx.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.createdById,
        action: "TUITION_PAYMENT_RECORDED",
        metadata: {
          financeOfficerId: input.createdById,
          parentId: input.parentId,
          studentIds: targetStudents.map((student) => student.id),
          paymentAmount: input.amount,
          allocationMode: input.allocationMode,
          planUsed: input.paymentOptionType,
          discountsApplied: targetCalculations.map((row) => ({
            studentId: row.studentId,
            familyDiscountAmount: row.familyDiscountAmount,
            planDiscountAmount: row.planDiscountAmount,
            additionalReductionAmount: row.additionalReductionAmount,
            totalReductionAmount: row.totalReductionAmount
          })),
          allocation: preview,
          timestamp: new Date().toISOString(),
          notes: input.notes ?? null,
          receiptNumber
        }
      }
    });

    return { payment, receipt, allocationPreview: preview };
  });

  const snapshot = await getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: input.parentId,
    academicYearName: setup.academicYear.name
  });

  const parent = await prisma.parent.findFirst({ where: { id: input.parentId, schoolId: input.schoolId } });
  if (parent) {
    const messages = buildTuitionParentNotificationMessages({
      parentName: parent.fullName,
      language: parent.preferredLanguage,
      transactionNumber: result.payment.transactionNumber,
      receiptNumber: result.receipt.receiptNumber,
      paymentMethod: input.method,
      allocationMode: input.allocationMode,
      allocationPreview: result.allocationPreview
    });
    const notificationType = result.allocationPreview.missingAmount > 0 || result.allocationPreview.warnings.length > 0
      ? NotificationType.UNPAID_BALANCE
      : NotificationType.CONFIRMATION;

    if (parent.email) {
      const status = await sendEmail({ to: parent.email, subject: messages.subject, text: messages.emailBody });
      await prisma.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          type: notificationType,
          language: normalizeMessageLanguage(parent.preferredLanguage),
          channel: NotificationChannel.EMAIL,
          content: messages.emailBody,
          status
        }
      }).catch((error) => console.error("Tuition parent email notification log failed", error));
    }
    if (parent.phone) {
      const status = await sendSms({ to: parent.phone, text: messages.smsBody });
      await prisma.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          parentId: input.parentId,
          type: notificationType,
          language: normalizeMessageLanguage(parent.preferredLanguage),
          channel: NotificationChannel.SMS,
          content: messages.smsBody,
          status
        }
      }).catch((error) => console.error("Tuition parent SMS notification log failed", error));
    }
    await prisma.notificationLog.create({
      data: {
        schoolId: input.schoolId,
        parentId: input.parentId,
        type: notificationType,
        language: normalizeMessageLanguage(parent.preferredLanguage),
        channel: NotificationChannel.DASHBOARD,
        content: messages.dashboardBody,
        status: "OPEN"
      }
    }).catch((error) => console.error("Tuition parent dashboard notification log failed", error));
  }

  return { ...setup, calculations: targetCalculations, ...result, snapshot };
}

export function simulateTuitionEngineScenario(input: {
  academicYearName?: string;
  paymentOptionType: PaymentOptionType;
  amount: number;
  allocationMode?: "AUTO" | "MANUAL";
  manualAllocations?: Array<{ installmentId: string; amount: number }>;
  children: Array<{
    id: string;
    fullName: string;
    className: string;
    level?: string;
    paymentOptionType?: PaymentOptionType;
    customAgreementFinalTuition?: number;
    additionalReductionAmount?: number;
    alreadyPaidBySequence?: Record<number, number>;
  }>;
}) {
  const academicYearName = input.academicYearName ?? OFFICIAL_ACADEMIC_YEAR_NAME;
  const calculations = input.children.map((child) => calculateTuitionForStudent({
    student: {
      id: child.id,
      fullName: child.fullName,
      annualFee: 0,
      class: { name: child.className, level: child.level ?? child.className }
    },
    childrenCount: input.children.length,
    paymentOptionType: child.paymentOptionType ?? input.paymentOptionType,
    academicYearName,
    customAgreementFinalTuition: child.customAgreementFinalTuition,
    additionalReductionAmount: child.additionalReductionAmount
  }));
  const childLookup = new Map(input.children.map((child) => [child.id, child]));
  const installments = calculations.flatMap((calculation) =>
    calculation.schedule.map((row) => ({
      id: `${calculation.studentId}-${row.sequence}`,
      studentId: calculation.studentId,
      label: row.label,
      dueDate: row.dueDate,
      amountDue: row.amountDue,
      amountPaid: roundCurrency(childLookup.get(calculation.studentId)?.alreadyPaidBySequence?.[row.sequence] ?? 0),
      student: { fullName: calculation.studentName },
      allocations: [] as Array<{ amount: number }>
    }))
  );
  const allocationPreview = buildAllocationPreviewFromInstallments({
    amount: input.amount,
    installments,
    mode: input.allocationMode ?? "AUTO",
    manualAllocations: input.manualAllocations
  });
  return {
    paymentOptionType: input.paymentOptionType,
    amount: roundCurrency(input.amount),
    calculations,
    allocationPreview,
    totals: {
      baseAnnualTuition: roundCurrency(calculations.reduce((sum, row) => sum + row.baseAnnualTuition, 0)),
      familyDiscount: roundCurrency(calculations.reduce((sum, row) => sum + row.familyDiscountAmount, 0)),
      planDiscount: roundCurrency(calculations.reduce((sum, row) => sum + row.planDiscountAmount, 0)),
      additionalReduction: roundCurrency(calculations.reduce((sum, row) => sum + row.additionalReductionAmount, 0)),
      totalReduction: roundCurrency(calculations.reduce((sum, row) => sum + row.totalReductionAmount, 0)),
      finalTuition: roundCurrency(calculations.reduce((sum, row) => sum + row.finalTuition, 0)),
      allocated: allocationPreview.allocatedTotal,
      remaining: allocationPreview.missingAmount,
      advance: allocationPreview.advanceBalance
    }
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

export async function cancelRegisteredPayment(input: {
  schoolId: string;
  paymentId: string;
  actorUserId: string;
  reason?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, schoolId: input.schoolId },
    include: {
      parent: true,
      students: true,
      receipt: true,
      academicYear: true,
      allocations: {
        include: {
          installment: {
            include: { allocations: true, student: true }
          }
        }
      }
    }
  });

  if (!payment) {
    throw new Error("Paiement introuvable.");
  }

  if (String(payment.status) === "CANCELLED") {
    throw new Error("Ce paiement est déjà annulé.");
  }

  const cancelledPayment = await prisma.$transaction(async (tx) => {
    const affectedInstallmentIds = Array.from(new Set(payment.allocations.map((allocation) => allocation.installmentId)));

    if (payment.allocations.length > 0) {
      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
    }

    for (const installmentId of affectedInstallmentIds) {
      const reconciled = await reconcileInstallmentAfterAllocationChange(tx, installmentId);
      if (!reconciled) continue;
      const { installment, remainingBalance, amountPaid } = reconciled;
      const existingDebt = await tx.debt.findFirst({ where: { sourceInstallmentId: installment.id } });

      if (existingDebt) {
        await tx.debt.update({
          where: { id: existingDebt.id },
          data: {
            amountRemaining: remainingBalance,
            status: remainingBalance > 0 ? (amountPaid > 0 ? DebtStatus.PARTIALLY_PAID : DebtStatus.OPEN) : DebtStatus.CLEARED,
            settledAt: remainingBalance === 0 ? new Date() : null,
            dueDate: installment.dueDate,
            sourcePaymentId: existingDebt.sourcePaymentId === payment.id ? null : existingDebt.sourcePaymentId
          }
        });
      } else if (remainingBalance > 0 && installment.parentId) {
        await tx.debt.create({
          data: {
            schoolId: input.schoolId,
            parentId: installment.parentId,
            studentId: installment.studentId,
            academicYearId: installment.academicYearId,
            financialProfileId: installment.financialProfileId,
            sourceInstallmentId: installment.id,
            title: `${installment.student?.fullName ?? "Parent"} installment balance`,
            reason: `Outstanding balance after payment cancellation: ${installment.label}`,
            originalAmount: roundCurrency(Number(installment.amountDue || 0)),
            amountRemaining: remainingBalance,
            status: amountPaid > 0 ? DebtStatus.PARTIALLY_PAID : DebtStatus.OPEN,
            dueDate: installment.dueDate
          }
        });
      }
    }

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED" as never,
        tuitionPlanId: null,
        parentFinancialProfileId: null,
        notes: [
          payment.notes,
          `Cancelled ${new Date().toISOString()} by ${input.actorUserId}${input.reason ? `: ${input.reason}` : ""}`
        ].filter(Boolean).join("\n")
      },
      include: {
        parent: true,
        students: true,
        receipt: true,
        allocations: true
      }
    });

    await tx.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.actorUserId,
        action: "PAYMENT_CANCELLED",
        metadata: {
          paymentId: payment.id,
          transactionNumber: payment.transactionNumber,
          parentId: payment.parentId,
          amount: payment.amount,
          reason: input.reason ?? null,
          affectedInstallmentIds
        }
      }
    });

    return updatedPayment;
  });

  const snapshot = await getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: payment.parentId,
    academicYearName: payment.academicYear?.name
  });

  if (snapshot.profile.id) {
    await prisma.parentFinancialProfile.update({
      where: { id: snapshot.profile.id },
      data: {
        totalPaid: snapshot.profile.totalPaid,
        totalDebt: snapshot.profile.totalDebt,
        totalReduction: snapshot.profile.totalReduction,
        carriedOverDebt: snapshot.profile.carriedOverDebt,
        overdueInstallments: snapshot.profile.overdueInstallments,
        paymentBehaviorScore: snapshot.profile.paymentBehaviorScore,
        lastPaymentAt: snapshot.profile.lastPaymentAt ? new Date(snapshot.profile.lastPaymentAt) : null
      }
    });
  }

  return { payment: cancelledPayment, snapshot };
}
