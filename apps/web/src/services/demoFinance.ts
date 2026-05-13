type DemoStudent = {
  id: string;
  fullName: string;
  classId: string;
  className: string;
  annualFee: number;
};

type DemoParent = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  students: DemoStudent[];
};

type DemoPayment = {
  id: string;
  transactionNumber: string;
  parentId?: string;
  parentFullName: string;
  reason: string;
  method: string;
  amount: number;
  status: string;
  createdAt: string;
  date?: string;
};

type GradeGroup = "K" | "GRADE_1_5" | "GRADE_6_8" | "GRADE_9_12" | "CUSTOM";
type PaymentOptionType = "FULL_PRESEPTEMBER" | "TWO_INSTALLMENTS" | "THREE_INSTALLMENTS" | "STANDARD_MONTHLY" | "SPECIAL_OWNER_AGREEMENT" | "CUSTOM";
type InstallmentStatus = "SCHEDULED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
type ReportType = "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUMULATIVE";

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

type SpecialAgreementConfig = {
  title: string;
  customTotal: number;
  reductionAmount: number;
  status: string;
  privateNotes: string;
  notes: string;
  installments: Array<{ label: string; dueDate: string; amountDue: number; notes?: string }>;
};

type StudentConfiguration =
  | { mode: "OFFICIAL"; paymentOptionType: PaymentOptionType }
  | { mode: "AGREEMENT"; agreement: SpecialAgreementConfig };

type DemoReduction = {
  id: string;
  source: string;
  title: string;
  amount: number;
  percentage: number | null;
  parentId: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  gradeGroup: GradeGroup;
  paymentOptionType: PaymentOptionType | null;
  scope: string;
  effectiveDate: string;
  studentName: string;
};

type DemoInstallment = {
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
  source: "derived";
  planCode: string | null;
  paymentOptionType: PaymentOptionType;
  studentId: string;
  studentName: string;
  gradeGroup: GradeGroup;
};

type DemoAgreement = {
  id: string;
  title: string;
  status: string;
  customTotal: number;
  reductionAmount: number;
  balanceDue: number;
  paymentOptionType: PaymentOptionType;
  gradeGroup: GradeGroup;
  approvedAt: string;
  approvalRequestedAt: string;
  notes: string;
  privateNotes: string;
  createdAt: string;
};

type DemoDebt = {
  id: string;
  title: string;
  reason: string;
  originalAmount: number;
  amountRemaining: number;
  status: string;
  academicYearId: string;
  academicYearName: string;
  carriedOverFromYearId: string | null;
  carriedOverFromYearName: string | null;
  dueDate: string | null;
  settledAt: string | null;
  createdAt: string;
};

type DemoStudentFinanceSnapshot = {
  id: string;
  fullName: string;
  className: string;
  annualFee: number;
  gradeGroup: GradeGroup;
  paymentOptionType: PaymentOptionType;
  paymentOptionLabel: string;
  expectedTotal: number;
  reductionTotal: number;
  originalAmount: number;
  planCode: string | null;
  planName: string;
  agreementId: string | null;
  installments: DemoInstallment[];
  paid: number;
  balance: number;
  overdueInstallments: number;
  completionRate: number;
  reductions: DemoReduction[];
  agreements: DemoAgreement[];
  debts: DemoDebt[];
};

let runtimeStudentOverrides: Record<string, StudentConfiguration> = {};

const ACADEMIC_YEAR = {
  id: "demo-ay-2026-2027",
  name: "2026-2027",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2027-06-30T23:59:59.999Z"
};

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
      paymentOptionType: "FULL_PRESEPTEMBER",
      discountRate: 10,
      originalAmount: 3082.5,
      reductionAmount: 308.25,
      finalAmount: 2774.25,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 2774.25, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: "TWO_INSTALLMENTS",
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
      paymentOptionType: "THREE_INSTALLMENTS",
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
      paymentOptionType: "STANDARD_MONTHLY",
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
      paymentOptionType: "FULL_PRESEPTEMBER",
      discountRate: 10,
      originalAmount: 3770,
      reductionAmount: 377,
      finalAmount: 3393,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 3393, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: "TWO_INSTALLMENTS",
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
      paymentOptionType: "THREE_INSTALLMENTS",
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
      paymentOptionType: "STANDARD_MONTHLY",
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
      paymentOptionType: "FULL_PRESEPTEMBER",
      discountRate: 10,
      originalAmount: 4595,
      reductionAmount: 459.5,
      finalAmount: 4135.5,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 4135.5, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: "TWO_INSTALLMENTS",
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
      paymentOptionType: "THREE_INSTALLMENTS",
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
      paymentOptionType: "STANDARD_MONTHLY",
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
      paymentOptionType: "FULL_PRESEPTEMBER",
      discountRate: 10,
      originalAmount: 5420,
      reductionAmount: 542,
      finalAmount: 4878,
      schedule: [{ label: "Before September", periodKey: "before-september", amount: 4878, dueMonth: 8, dueDay: 31 }]
    },
    {
      code: "TWO_INSTALLMENTS",
      name: "Two-installment payment",
      paymentOptionType: "TWO_INSTALLMENTS",
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
      paymentOptionType: "THREE_INSTALLMENTS",
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
      paymentOptionType: "STANDARD_MONTHLY",
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

const STUDENT_CONFIGURATION: Record<string, StudentConfiguration> = {
  "STU-KCS-ELISE-KABONGO": { mode: "OFFICIAL", paymentOptionType: "THREE_INSTALLMENTS" },
  "STU-KCS-DAVID-KABONGO": { mode: "OFFICIAL", paymentOptionType: "STANDARD_MONTHLY" },
  "STU-KCS-AMANI-MBUYI": {
    mode: "AGREEMENT",
    agreement: {
      title: "Accord special KCS owner 2026-2027",
      customTotal: 4980,
      reductionAmount: 380,
      status: "APPROVED",
      privateNotes: "Owner-approved custom arrangement with private oversight.",
      notes: "Custom agreement received by the finance department and tracked independently.",
      installments: [
        { label: "Initial commitment", dueDate: "2026-08-31T23:59:59.999Z", amountDue: 1600, notes: "Initial owner-approved commitment" },
        { label: "Mid-year settlement", dueDate: "2027-01-31T23:59:59.999Z", amountDue: 1500, notes: "Flexible mid-year settlement window" },
        { label: "Final owner tranche", dueDate: "2027-05-31T23:59:59.999Z", amountDue: 1500, notes: "Final custom settlement" }
      ]
    }
  }
};

runtimeStudentOverrides = { ...STUDENT_CONFIGURATION };

export function setDemoFinanceOverrides(overrides: Record<string, StudentConfiguration>) {
  runtimeStudentOverrides = { ...STUDENT_CONFIGURATION, ...overrides };
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100000) / 100000;
}

function formatAlertDueDate(value: string) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatAlertCurrency(value: number) {
  return `$ ${roundCurrency(value).toFixed(2)} USD`;
}

function buildOverdueAlertSeries(input: {
  parentId: string;
  academicYearName: string;
  activeTuitionPlan: string;
  overdueInstallments: DemoInstallment[];
  totalDebt: number;
}) {
  if (input.overdueInstallments.length === 0) return [];

  const now = Date.now();
  const sortedInstallments = [...input.overdueInstallments].sort(
    (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()
  );
  const firstInstallment = sortedInstallments[0];
  const mostLateInstallment = sortedInstallments.reduce((latest, current) => {
    const latestDelay = Math.max(Math.floor((now - new Date(latest.dueDate).getTime()) / 86400000), 0);
    const currentDelay = Math.max(Math.floor((now - new Date(current.dueDate).getTime()) / 86400000), 0);
    return currentDelay > latestDelay ? current : latest;
  }, firstInstallment);
  const firstDelayDays = Math.max(Math.floor((now - new Date(firstInstallment.dueDate).getTime()) / 86400000), 0);
  const maxDelayDays = Math.max(Math.floor((now - new Date(mostLateInstallment.dueDate).getTime()) / 86400000), 0);
  const planLabel = input.activeTuitionPlan !== "No active tuition plan"
    ? input.activeTuitionPlan
    : PAYMENT_OPTION_LABELS[firstInstallment.paymentOptionType] ?? "plan de tuition";

  return [
    {
      id: `demo-alert-overdue-1-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_1",
      title: "Alerte 1 - echeance de tuition depassee",
      message: `${firstInstallment.studentName} a depasse l'echeance \"${firstInstallment.label}\" du ${formatAlertDueDate(firstInstallment.dueDate)} selon le plan ${planLabel}. Solde en retard: ${formatAlertCurrency(firstInstallment.balance)}.`,
      severity: "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `demo-alert-overdue-2-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_2",
      title: "Alerte 2 - regularisation attendue immediatement",
      message: `${input.overdueInstallments.length} echeance(s) sont en retard pour ${input.academicYearName}, avec jusqu'a ${maxDelayDays} jour(s) de depassement. Dette totale suivie: ${formatAlertCurrency(input.totalDebt)}.`,
      severity: input.overdueInstallments.length >= 2 || maxDelayDays >= 14 ? "HIGH" : "MEDIUM",
      status: "OPEN",
      createdAt: new Date().toISOString()
    },
    {
      id: `demo-alert-overdue-3-${input.parentId}`,
      type: "OVERDUE_INSTALLMENT_REMINDER_3",
      title: "Alerte 3 - dossier remonte au financier",
      message: `Le parent et le financier doivent traiter ce retard maintenant. Premiere echeance non reglee depuis ${firstDelayDays} jour(s), derniere echeance critique ${mostLateInstallment.label} pour ${mostLateInstallment.studentName}.`,
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date().toISOString()
    }
  ];
}

function resolveGradeGroup(className?: string | null) {
  const raw = String(className ?? "").toUpperCase();
  if (/\bK\s*[3-5]\b/.test(raw)) return "K" as GradeGroup;
  const match = raw.match(/\b(?:GRADE|G)\s*(\d{1,2})/);
  const numeric = match ? Number(match[1]) : null;
  if (numeric !== null) {
    if (numeric >= 1 && numeric <= 5) return "GRADE_1_5" as GradeGroup;
    if (numeric >= 6 && numeric <= 8) return "GRADE_6_8" as GradeGroup;
    if (numeric >= 9 && numeric <= 12) return "GRADE_9_12" as GradeGroup;
  }
  return "CUSTOM" as GradeGroup;
}

function buildDueDate(dueMonth: number, dueDay: number) {
  const startYear = 2026;
  const year = dueMonth >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, dueMonth - 1, dueDay, 23, 59, 59, 999)).toISOString();
}

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getOfficialPlan(gradeGroup: GradeGroup, paymentOptionType: PaymentOptionType) {
  return OFFICIAL_KCS_PLANS[gradeGroup]?.find((plan) => plan.paymentOptionType === paymentOptionType) ?? null;
}

function serializeCatalogPlan(gradeGroup: GradeGroup, plan: OfficialPlanTemplate, index: number) {
  return {
    id: `demo-plan-${gradeGroup}-${plan.code}-${index + 1}`,
    schoolId: "demo-school",
    academicYearId: ACADEMIC_YEAR.id,
    code: plan.code,
    name: `${GRADE_GROUP_LABELS[gradeGroup]} - ${plan.name}`,
    paymentOptionType: plan.paymentOptionType,
    gradeGroup,
    discountRate: plan.discountRate,
    originalAmount: plan.originalAmount,
    reductionAmount: plan.reductionAmount,
    finalAmount: plan.finalAmount,
    currency: "USD",
    scheduleVersion: ACADEMIC_YEAR.name,
    isOfficial: true,
    isActive: true,
    scheduleJson: plan.schedule.map((row, rowIndex) => ({
      sequence: rowIndex + 1,
      label: row.label,
      periodKey: row.periodKey,
      amount: roundCurrency(row.amount),
      dueDate: buildDueDate(row.dueMonth, row.dueDay),
      dueMonth: row.dueMonth,
      dueDay: row.dueDay,
      windowLabel: row.windowLabel ?? null
    }))
  };
}

function getCatalogPlans() {
  return (Object.entries(OFFICIAL_KCS_PLANS) as Array<[GradeGroup, OfficialPlanTemplate[]]>).flatMap(([gradeGroup, plans]) =>
    plans.map((plan, index) => serializeCatalogPlan(gradeGroup, plan, index))
  );
}

function matchStudentPayments(student: DemoStudent, parentPayments: DemoPayment[]) {
  const matches = parentPayments.filter((payment) => payment.reason.toLowerCase().includes(student.fullName.toLowerCase()));
  if (matches.length > 0) return matches;
  if (parentPayments.length === 1) return parentPayments;
  return [];
}

function deriveInstallmentStatus(amountDue: number, amountPaid: number, dueDate: string): InstallmentStatus {
  const due = new Date(dueDate).getTime();
  if (amountPaid >= amountDue && amountDue > 0) return "PAID";
  if (amountPaid > 0) return due < Date.now() ? "OVERDUE" : "PARTIALLY_PAID";
  if (due < Date.now()) return "OVERDUE";
  return "SCHEDULED";
}

function computeBehaviorScore(expected: number, paid: number, overdueInstallments: number, delayedPayments: number, carriedOverDebt: number) {
  const coverage = expected > 0 ? (paid / expected) * 100 : 100;
  return roundCurrency(Math.max(0, Math.min(100, coverage - overdueInstallments * 9 - delayedPayments * 5 - carriedOverDebt * 0.02)));
}

function resolvePeriodBounds(periodType: ReportType) {
  const now = new Date();
  if (periodType === "MONTHLY") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    };
  }
  if (periodType === "QUARTERLY") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: new Date(now.getFullYear(), quarterStartMonth, 1),
      end: new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999),
      label: `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
    };
  }
  if (periodType === "YEARLY") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      label: String(now.getFullYear())
    };
  }
  return { start: new Date(0), end: new Date(), label: "cumulative" };
}

function getStudentConfiguration(studentId: string): StudentConfiguration {
  return runtimeStudentOverrides[studentId] ?? { mode: "OFFICIAL", paymentOptionType: "STANDARD_MONTHLY" };
}

function buildOfficialStudentSnapshot(parent: DemoParent, student: DemoStudent, payments: DemoPayment[]): DemoStudentFinanceSnapshot | null {
  const gradeGroup = resolveGradeGroup(student.className);
  const configuration = getStudentConfiguration(student.id);
  const chosenOption = configuration.mode === "OFFICIAL" ? configuration.paymentOptionType : "STANDARD_MONTHLY";
  const plan = getOfficialPlan(gradeGroup, chosenOption) ?? getOfficialPlan(gradeGroup, "STANDARD_MONTHLY");
  if (!plan) {
    return null;
  }
  const studentPayments = matchStudentPayments(student, payments);
  let remainingCompleted = roundCurrency(studentPayments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const installments: DemoInstallment[] = plan.schedule.map((row, index) => {
    const dueDate = buildDueDate(row.dueMonth, row.dueDay);
    const amountDue = roundCurrency(row.amount);
    const amountPaid = roundCurrency(Math.min(amountDue, remainingCompleted));
    remainingCompleted = roundCurrency(Math.max(0, remainingCompleted - amountPaid));
    const balance = roundCurrency(Math.max(amountDue - amountPaid, 0));
    const status = deriveInstallmentStatus(amountDue, amountPaid, dueDate);
    return {
      id: `demo-installment-${student.id}-${index + 1}`,
      persistedId: null,
      label: row.label,
      periodKey: row.periodKey,
      dueDate,
      amountDue,
      amountPaid,
      balance,
      status,
      isOverdue: status === "OVERDUE",
      source: "derived" as const,
      planCode: plan.code,
      paymentOptionType: plan.paymentOptionType,
      studentId: student.id,
      studentName: student.fullName,
      gradeGroup
    };
  });

  return {
    id: student.id,
    fullName: student.fullName,
    className: student.className,
    annualFee: student.annualFee,
    gradeGroup,
    paymentOptionType: plan.paymentOptionType,
    paymentOptionLabel: PAYMENT_OPTION_LABELS[plan.paymentOptionType],
    expectedTotal: roundCurrency(plan.finalAmount),
    reductionTotal: roundCurrency(plan.reductionAmount),
    originalAmount: roundCurrency(plan.originalAmount),
    planCode: plan.code,
    planName: `${GRADE_GROUP_LABELS[gradeGroup]} - ${plan.name}`,
    agreementId: null,
    installments,
    paid: roundCurrency(installments.reduce((sum, installment) => sum + installment.amountPaid, 0)),
    balance: roundCurrency(installments.reduce((sum, installment) => sum + installment.balance, 0)),
    overdueInstallments: installments.filter((installment) => installment.isOverdue).length,
    completionRate: plan.finalAmount > 0 ? roundCurrency((installments.reduce((sum, installment) => sum + installment.amountPaid, 0) / plan.finalAmount) * 100) : 0,
    reductions: plan.reductionAmount > 0
      ? [{
          id: `demo-reduction-${student.id}`,
          source: "OFFICIAL_PLAN",
          title: `${PAYMENT_OPTION_LABELS[plan.paymentOptionType]} reduction`,
          amount: roundCurrency(plan.reductionAmount),
          percentage: roundCurrency(plan.discountRate),
          parentId: parent.id,
          studentId: student.id,
          academicYearId: ACADEMIC_YEAR.id,
          academicYearName: ACADEMIC_YEAR.name,
          gradeGroup,
          paymentOptionType: plan.paymentOptionType,
          scope: "PAYMENT_OPTION",
          effectiveDate: ACADEMIC_YEAR.startDate,
          studentName: student.fullName
        }]
      : [],
    agreements: [],
    debts: []
  };
}

function buildAgreementStudentSnapshot(parent: DemoParent, student: DemoStudent, payments: DemoPayment[], agreement: SpecialAgreementConfig): DemoStudentFinanceSnapshot {
  const gradeGroup = resolveGradeGroup(student.className);
  const studentPayments = matchStudentPayments(student, payments);
  let remainingCompleted = roundCurrency(studentPayments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const agreementId = `demo-agreement-${student.id}`;
  const installments: DemoInstallment[] = agreement.installments.map((row, index) => {
    const amountDue = roundCurrency(row.amountDue);
    const amountPaid = roundCurrency(Math.min(amountDue, remainingCompleted));
    remainingCompleted = roundCurrency(Math.max(0, remainingCompleted - amountPaid));
    const balance = roundCurrency(Math.max(amountDue - amountPaid, 0));
    const status = deriveInstallmentStatus(amountDue, amountPaid, row.dueDate);
    return {
      id: `demo-agreement-installment-${student.id}-${index + 1}`,
      persistedId: null,
      label: row.label,
      periodKey: `agreement-${student.id}-${index + 1}`,
      dueDate: row.dueDate,
      amountDue,
      amountPaid,
      balance,
      status,
      isOverdue: status === "OVERDUE",
      source: "derived" as const,
      planCode: null,
      paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
      studentId: student.id,
      studentName: student.fullName,
      gradeGroup
    };
  });

  return {
    id: student.id,
    fullName: student.fullName,
    className: student.className,
    annualFee: student.annualFee,
    gradeGroup,
    paymentOptionType: "SPECIAL_OWNER_AGREEMENT" as PaymentOptionType,
    paymentOptionLabel: PAYMENT_OPTION_LABELS.SPECIAL_OWNER_AGREEMENT,
    expectedTotal: roundCurrency(agreement.customTotal),
    reductionTotal: roundCurrency(agreement.reductionAmount),
    originalAmount: roundCurrency(agreement.customTotal),
    planCode: null,
    planName: agreement.title,
    agreementId,
    installments,
    paid: roundCurrency(installments.reduce((sum, installment) => sum + installment.amountPaid, 0)),
    balance: roundCurrency(installments.reduce((sum, installment) => sum + installment.balance, 0)),
    overdueInstallments: installments.filter((installment) => installment.isOverdue).length,
    completionRate: agreement.customTotal > 0 ? roundCurrency((installments.reduce((sum, installment) => sum + installment.amountPaid, 0) / agreement.customTotal) * 100) : 0,
    reductions: [{
      id: `demo-agreement-reduction-${student.id}`,
      source: "AGREEMENT",
      title: `${agreement.title} reduction`,
      amount: roundCurrency(agreement.reductionAmount),
      percentage: null,
      parentId: parent.id,
      studentId: student.id,
      academicYearId: ACADEMIC_YEAR.id,
      academicYearName: ACADEMIC_YEAR.name,
      gradeGroup,
      paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
      scope: "AGREEMENT",
      effectiveDate: ACADEMIC_YEAR.startDate,
      studentName: student.fullName
    }],
    agreements: [{
      id: agreementId,
      title: agreement.title,
      status: agreement.status,
      customTotal: roundCurrency(agreement.customTotal),
      reductionAmount: roundCurrency(agreement.reductionAmount),
      balanceDue: roundCurrency(installments.reduce((sum, installment) => sum + installment.balance, 0)),
      paymentOptionType: "SPECIAL_OWNER_AGREEMENT",
      gradeGroup,
      approvedAt: ACADEMIC_YEAR.startDate,
      approvalRequestedAt: ACADEMIC_YEAR.startDate,
      notes: agreement.notes,
      privateNotes: agreement.privateNotes,
      createdAt: ACADEMIC_YEAR.startDate
    }],
    debts: []
  };
}

export function buildDemoFinanceCatalog() {
  return {
    academicYear: ACADEMIC_YEAR,
    plans: getCatalogPlans()
  };
}

export function buildDemoParentFinanceProfile(parentId: string, parents: DemoParent[], payments: DemoPayment[]) {
  const parent = parents.find((entry) => entry.id === parentId);
  if (!parent) {
    throw new Error("Parent financial profile not found.");
  }

  const parentPayments = payments.filter((payment) => payment.parentId === parent.id || payment.parentFullName === parent.fullName);
  const delayedPayments = parentPayments.filter((payment) => payment.status === "PENDING" || payment.status === "FAILED").length;

  const studentRows: DemoStudentFinanceSnapshot[] = parent.students
    .map((student) => {
      const configuration = getStudentConfiguration(student.id);
      if (configuration.mode === "AGREEMENT") {
        return buildAgreementStudentSnapshot(parent, student, parentPayments, configuration.agreement);
      }
      return buildOfficialStudentSnapshot(parent, student, parentPayments);
    })
    .filter((student): student is DemoStudentFinanceSnapshot => Boolean(student));

  const reductions: DemoReduction[] = studentRows.flatMap((student) => student.reductions);
  const agreements: DemoAgreement[] = studentRows.flatMap((student) => student.agreements);
  const installments: DemoInstallment[] = studentRows
    .flatMap((student) => student.installments)
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime());
  const carriedOverDebt = parent.id === "PAR-KCS-RACHEL-KABONGO" ? 180 : 0;
  const totalPaid = roundCurrency(parentPayments.filter((payment) => payment.status === "COMPLETED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const pendingPaymentsTotal = roundCurrency(parentPayments.filter((payment) => payment.status === "PENDING").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const failedPaymentsTotal = roundCurrency(parentPayments.filter((payment) => payment.status === "FAILED").reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const overdueInstallments = installments.filter((installment) => installment.isOverdue).length;
  const tuitionDebt = roundCurrency(studentRows.reduce((sum, student) => sum + student.balance, 0));
  const totalReduction = roundCurrency(reductions.reduce((sum, reduction) => sum + Number(reduction.amount || 0), 0));
  const totalExpected = roundCurrency(studentRows.reduce((sum, student) => sum + student.expectedTotal, 0));
  const totalDebt = roundCurrency(tuitionDebt + carriedOverDebt);
  const paymentBehaviorScore = computeBehaviorScore(totalExpected || 1, totalPaid, overdueInstallments, delayedPayments, carriedOverDebt);

  const debts: DemoDebt[] = [
    ...studentRows
      .filter((student) => student.balance > 0)
      .map((student) => ({
        id: `demo-debt-${student.id}`,
        title: `${student.fullName} tuition balance`,
        reason: `Remaining balance under ${student.planName}`,
        originalAmount: roundCurrency(student.expectedTotal),
        amountRemaining: roundCurrency(student.balance),
        status: student.balance > 0 && student.paid > 0 ? "PARTIALLY_PAID" : "OPEN",
        academicYearId: ACADEMIC_YEAR.id,
        academicYearName: ACADEMIC_YEAR.name,
        carriedOverFromYearId: null,
        carriedOverFromYearName: null,
        dueDate: installments.find((installment) => installment.studentId === student.id && installment.balance > 0)?.dueDate ?? null,
        settledAt: null,
        createdAt: ACADEMIC_YEAR.startDate
      })),
    ...(carriedOverDebt > 0
      ? [{
          id: `demo-carried-debt-${parent.id}`,
          title: "Carried-over balance",
          reason: "Outstanding amount from the previous academic year.",
          originalAmount: carriedOverDebt,
          amountRemaining: carriedOverDebt,
          status: "OPEN",
          academicYearId: ACADEMIC_YEAR.id,
          academicYearName: ACADEMIC_YEAR.name,
          carriedOverFromYearId: "2025-2026",
          carriedOverFromYearName: "2025-2026",
          dueDate: null,
          settledAt: null,
          createdAt: ACADEMIC_YEAR.startDate
        }]
      : [])
  ];

  const activePlanNames = Array.from(new Set(studentRows.map((student) => student.planName))).filter(Boolean);
  const activeTuitionPlan = activePlanNames.length === 1 ? activePlanNames[0] : activePlanNames.length > 1 ? "Mixed tuition plans" : "No active tuition plan";
  const overdueInstallmentRows = installments.filter((installment) => installment.isOverdue);

  const alerts: Array<{ id: string; type: string; title: string; message: string; severity: string; status: string; createdAt: string }> = [
    ...buildOverdueAlertSeries({
      parentId: parent.id,
      academicYearName: ACADEMIC_YEAR.name,
      activeTuitionPlan,
      overdueInstallments: overdueInstallmentRows,
      totalDebt
    }),
    ...(overdueInstallmentRows.length === 0 && totalDebt > Math.max(totalExpected * 0.35, 500)
      ? [{
          id: `demo-alert-debt-${parent.id}`,
          type: "ABNORMAL_DEBT_ACCUMULATION",
          title: "Debt accumulation requires action",
          message: `Outstanding debt is $ ${totalDebt.toFixed(2)} USD.`,
          severity: totalDebt >= Math.max(totalExpected * 0.65, 1200) ? "HIGH" : "MEDIUM",
          status: "OPEN",
          createdAt: new Date().toISOString()
        }]
      : []),
    ...(installments.length === 0
      ? [{
          id: `demo-alert-schedule-${parent.id}`,
          type: "INCOMPLETE_TUITION_SCHEDULE",
          title: "Incomplete tuition schedule",
          message: "No tuition schedule has been generated for this parent yet.",
          severity: "HIGH",
          status: "OPEN",
          createdAt: new Date().toISOString()
        }]
      : [])
  ];

  return {
    academicYear: ACADEMIC_YEAR,
    parent: {
      id: parent.id,
      fullName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      preferredLanguage: "fr",
      photoUrl: parent.photoUrl ?? ""
    },
    profile: {
      id: `demo-profile-${parent.id}`,
      activeTuitionPlan: activePlanNames.length === 1 ? activePlanNames[0] : activePlanNames.length > 1 ? "Mixed tuition plans" : "No active tuition plan",
      activeTuitionPlanId: null,
      activeAgreementId: agreements[0]?.id ?? null,
      totalPaid,
      totalDebt,
      totalReduction,
      carriedOverDebt,
      overdueInstallments,
      pendingPaymentsTotal,
      failedPaymentsTotal,
      paymentBehaviorScore,
      lastPaymentAt: parentPayments.filter((payment) => payment.status === "COMPLETED").sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.createdAt ?? null,
      childrenLinkedToAccount: parent.students.length,
      expectedNetRevenue: totalExpected,
      completionRate: totalExpected > 0 ? roundCurrency((totalPaid / totalExpected) * 100) : 0
    },
    students: studentRows,
    installments,
    reductions,
    debts,
    agreements,
    alerts,
    paymentHistory: parentPayments
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((payment) => ({
        id: payment.id,
        transactionNumber: payment.transactionNumber,
        amount: roundCurrency(Number(payment.amount || 0)),
        reason: payment.reason,
        method: payment.method,
        status: payment.status,
        createdAt: payment.createdAt,
        receiptId: `demo-receipt-${payment.id}`,
        receiptNumber: `R-${payment.transactionNumber}`,
        students: parent.students
          .filter((student) => payment.reason.toLowerCase().includes(student.fullName.toLowerCase()))
          .map((student) => ({ id: student.id, fullName: student.fullName }))
      })),
    historicalReceipts: parentPayments.map((payment) => ({
      id: `demo-receipt-${payment.id}`,
      receiptNumber: `R-${payment.transactionNumber}`,
      paymentId: payment.id,
      transactionNumber: payment.transactionNumber,
      createdAt: payment.createdAt
    }))
  };
}

function groupCurrencyTotals<T extends string>(entries: Array<{ key: T; amount: number }>) {
  const totals = new Map<T, number>();
  for (const entry of entries) {
    totals.set(entry.key, roundCurrency((totals.get(entry.key) ?? 0) + entry.amount));
  }
  return Array.from(totals.entries()).map(([key, amount]) => ({ key, amount }));
}

export function buildDemoReductionAnalytics(parents: DemoParent[], payments: DemoPayment[], periodType: ReportType = "CUMULATIVE") {
  const bounds = resolvePeriodBounds(periodType);
  const reductions: DemoReduction[] = parents
    .flatMap((parent) => buildDemoParentFinanceProfile(parent.id, parents, payments).reductions)
    .filter((reduction) => {
      const effectiveDate = new Date(String(reduction.effectiveDate));
      return effectiveDate >= bounds.start && effectiveDate <= bounds.end;
    });

  const byScope = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.scope ?? "UNKNOWN"), amount: Number(reduction.amount || 0) })));
  const byGradeGroup = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.gradeGroup ?? "CUSTOM"), amount: Number(reduction.amount || 0) })));
  const byPaymentOption = groupCurrencyTotals(reductions.map((reduction) => ({ key: String(reduction.paymentOptionType ?? "CUSTOM"), amount: Number(reduction.amount || 0) })));

  return {
    academicYear: ACADEMIC_YEAR.name,
    periodType,
    periodLabel: bounds.label,
    totalReductions: roundCurrency(reductions.reduce((sum, reduction) => sum + Number(reduction.amount || 0), 0)),
    reductionCount: reductions.length,
    byScope: byScope.map((entry) => ({ scope: entry.key, amount: entry.amount })),
    byGradeGroup: byGradeGroup.map((entry) => ({ gradeGroup: entry.key, amount: entry.amount })),
    byPaymentOption: byPaymentOption.map((entry) => ({ paymentOptionType: entry.key, amount: entry.amount })),
    reductions
  };
}

export function buildDemoFinanceOverview(parents: DemoParent[], payments: DemoPayment[]) {
  const parentSnapshots = parents.map((parent) => buildDemoParentFinanceProfile(parent.id, parents, payments));
  const completedPayments = payments.filter((payment) => payment.status === "COMPLETED");
  const totalRevenue = roundCurrency(completedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const monthlyRevenue = roundCurrency(completedPayments.filter((payment) => new Date(payment.createdAt) >= getCurrentMonthStart()).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const totalDebt = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.profile.totalDebt || 0), 0));
  const expectedRevenue = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.profile.expectedNetRevenue || 0), 0));
  const totalReduction = roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.profile.totalReduction || 0), 0));
  const paymentCompletionRate = expectedRevenue > 0 ? roundCurrency((totalRevenue / expectedRevenue) * 100) : 0;
  const reductionReport = buildDemoReductionAnalytics(parents, payments, "CUMULATIVE");

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

  const classAnalyticsMap = new Map<string, { expected: number; collected: number; debt: number; reductions: number; students: number }>();
  for (const snapshot of parentSnapshots) {
    for (const student of snapshot.students) {
      const key = student.className ?? GRADE_GROUP_LABELS[student.gradeGroup as GradeGroup] ?? "Unknown";
      const current = classAnalyticsMap.get(key) ?? { expected: 0, collected: 0, debt: 0, reductions: 0, students: 0 };
      current.expected = roundCurrency(current.expected + Number(student.expectedTotal || 0));
      current.collected = roundCurrency(current.collected + Number(student.paid || 0));
      current.debt = roundCurrency(current.debt + Number(student.balance || 0));
      current.reductions = roundCurrency(current.reductions + Number(student.reductionTotal || 0));
      current.students += 1;
      classAnalyticsMap.set(key, current);
    }
  }

  const alerts = parentSnapshots.flatMap((snapshot) => snapshot.alerts);

  return {
    academicYear: ACADEMIC_YEAR,
    totalRevenue,
    monthlyRevenue,
    outstandingDebt: totalDebt,
    expectedRevenue,
    collectedRevenue: totalRevenue,
    totalDebt,
    totalReduction,
    paymentSuccessRate: payments.length > 0 ? roundCurrency((completedPayments.length / payments.length) * 100) : 0,
    paymentCompletionRate,
    classAnalytics: Array.from(classAnalyticsMap.entries())
      .map(([className, value]) => ({
        className,
        ...value,
        collectionRate: value.expected > 0 ? roundCurrency((value.collected / value.expected) * 100) : 0
      }))
      .sort((left, right) => right.debt - left.debt),
    parentDebtAnalytics,
    reductionStatistics: reductionReport,
    financialHealthIndicators: {
      collectionEfficiency: paymentCompletionRate,
      debtExposure: expectedRevenue > 0 ? roundCurrency((totalDebt / expectedRevenue) * 100) : 0,
      reductionLoad: expectedRevenue > 0 ? roundCurrency((totalReduction / expectedRevenue) * 100) : 0,
      alertPressure: alerts.length,
      averageBehaviorScore: parentSnapshots.length > 0
        ? roundCurrency(parentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.profile.paymentBehaviorScore || 0), 0) / parentSnapshots.length)
        : 0
    },
    activeAlerts: alerts.length,
    overdueParents: parentSnapshots.filter((snapshot) => Number(snapshot.profile.overdueInstallments || 0) > 0).length,
    parentsTracked: parentSnapshots.length
  };
}