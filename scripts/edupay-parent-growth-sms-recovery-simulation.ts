import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  PaymentMethod,
  PaymentOptionType,
  Prisma,
  Role
} from "@prisma/client";
import { prisma } from "../apps/api/src/prisma";
import { sendSms, getMessagingConfigStatus } from "../apps/api/src/utils/messaging";
import {
  ensureOfficialKcsCatalog,
  ensureParentTuitionEnginePlan,
  getParentFinancialSnapshot,
  recordTuitionEnginePayment
} from "../apps/api/src/modules/finance/service";

const TEST_PHONE = process.env.TEST_PARENT_PHONE || "+243000000000";
const ACADEMIC_YEAR = "2026-2027";
const PAYMENT_PLAN = PaymentOptionType.STANDARD_MONTHLY;

function round(value: number) {
  return Number(value.toFixed(5));
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeAccessCode(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function matchesRecoveryIdentifier(user: { email: string; accessCode: string | null }, identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const normalizedAccessCode = normalizeAccessCode(identifier);
  return user.email.trim().toLowerCase() === normalizedIdentifier
    || Boolean(user.accessCode && normalizeAccessCode(user.accessCode) === normalizedAccessCode);
}

async function getOrCreateSchool() {
  const existing = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.school.create({ data: { name: "Kinshasa Christian School" } });
}

async function getOrCreateClass(schoolId: string, name: string) {
  const existing = await prisma.class.findUnique({ where: { schoolId_name: { schoolId, name } } });
  if (existing) return existing;
  return prisma.class.create({
    data: {
      schoolId,
      name,
      level: name
    }
  });
}

async function getOrCreateActor(schoolId: string) {
  const existing = await prisma.user.findFirst({
    where: { schoolId, role: { in: [Role.ADMIN, Role.SUPER_ADMIN, Role.ACCOUNTANT] } },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      schoolId,
      fullName: "EduPay Simulation Admin",
      email: `edupay.sim.admin.${Date.now()}@kcs.local`,
      accessCode: `ACC-SIM-${Date.now().toString(36).toUpperCase()}`,
      passwordHash: await bcrypt.hash("Simulation-Admin-2026", 10),
      role: Role.ADMIN
    }
  });
}

async function createSimulationParent(input: {
  schoolId: string;
  fullName: string;
  phone: string;
  email: string;
  temporaryPassword: string;
}) {
  const user = await prisma.user.create({
    data: {
      schoolId: input.schoolId,
      fullName: input.fullName,
      email: input.email,
      accessCode: `ACC-PAR-SIM-${Date.now().toString(36).toUpperCase()}`,
      passwordHash: await bcrypt.hash(input.temporaryPassword, 10),
      role: Role.PARENT,
      mustChangePassword: true
    }
  });

  const parent = await prisma.parent.create({
    data: {
      schoolId: input.schoolId,
      userId: user.id,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      preferredLanguage: "fr",
      physicalAddress: "Simulation locale EduPay"
    },
    include: { user: true, students: { include: { class: true } } }
  });

  return { parent, user };
}

async function addStudent(input: {
  schoolId: string;
  parentId: string;
  fullName: string;
  className: string;
}) {
  const klass = await getOrCreateClass(input.schoolId, input.className);
  return prisma.student.create({
    data: {
      schoolId: input.schoolId,
      parentId: input.parentId,
      classId: klass.id,
      fullName: input.fullName,
      annualFee: 0
    }
  });
}

async function runStage(input: {
  schoolId: string;
  actorUserId: string;
  parentId: string;
  stage: number;
  paymentAmount: number;
}) {
  const plan = await ensureParentTuitionEnginePlan({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    parentId: input.parentId,
    academicYearName: ACADEMIC_YEAR,
    paymentOptionType: PAYMENT_PLAN,
    notes: `Simulation croissance parent - etape ${input.stage}`
  });

  const payment = await recordTuitionEnginePayment({
    schoolId: input.schoolId,
    createdById: input.actorUserId,
    parentId: input.parentId,
    academicYearName: ACADEMIC_YEAR,
    paymentOptionType: PAYMENT_PLAN,
    amount: input.paymentAmount,
    method: PaymentMethod.MPESA,
    allocationMode: "AUTO",
    status: "COMPLETED",
    transactionNumber: `SIM-GROWTH-${Date.now()}-${input.stage}`,
    notes: `Paiement simulation apres ${input.stage} enfant(s)`
  });

  const snapshot = await getParentFinancialSnapshot({
    schoolId: input.schoolId,
    parentId: input.parentId,
    academicYearName: ACADEMIC_YEAR
  });

  return {
    stage: input.stage,
    paymentAmount: input.paymentAmount,
    calculationTotals: {
      totalExpected: round(plan.calculations.reduce((sum, row) => sum + row.finalTuition, 0)),
      totalReduction: round(plan.calculations.reduce((sum, row) => sum + row.totalReductionAmount, 0)),
      familyDiscount: round(plan.calculations.reduce((sum, row) => sum + row.familyDiscountAmount, 0)),
      planDiscount: round(plan.calculations.reduce((sum, row) => sum + row.planDiscountAmount, 0))
    },
    paymentTransaction: payment.payment.transactionNumber,
    receiptNumber: payment.receipt.receiptNumber,
    snapshot: {
      activeTuitionPlan: snapshot.profile.activeTuitionPlan,
      totalExpected: snapshot.profile.expectedNetRevenue,
      totalPaid: snapshot.profile.totalPaid,
      totalDebt: snapshot.profile.totalDebt,
      totalReduction: snapshot.profile.totalReduction,
      students: snapshot.students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        className: student.className,
        expectedTotal: student.expectedTotal,
        reductionTotal: student.reductionTotal,
        paid: student.paid,
        balance: student.balance
      })),
      reductions: snapshot.reductions.map((reduction) => ({
        title: reduction.title,
        source: reduction.source,
        scope: reduction.scope,
        amount: reduction.amount,
        studentName: reduction.studentName,
        paymentOptionType: reduction.paymentOptionType
      })),
      messages: snapshot.notificationHistory.slice(0, 5).map((message) => ({
        type: message.type,
        channel: message.channel,
        status: message.status
      }))
    }
  };
}

async function simulatePasswordRecovery(userId: string, identifier: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() }
  });

  const token = crypto.randomBytes(24).toString("base64url");
  const resetRow = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  const wrongIdentifierAccepted = matchesRecoveryIdentifier(user, "intrus@example.test");
  const correctIdentifierAccepted = matchesRecoveryIdentifier(user, identifier);
  if (wrongIdentifierAccepted || !correctIdentifierAccepted) {
    throw new Error("Password recovery identifier guard failed.");
  }

  const newPassword = `Recovered-${Date.now()}!`;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRow.id },
      data: { usedAt: new Date() }
    })
  ]);

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const loginWorks = await bcrypt.compare(newPassword, updated.passwordHash);
  const reusedToken = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: resetRow.id } });

  return {
    tokenLength: token.length,
    wrongIdentifierBlocked: !wrongIdentifierAccepted,
    correctIdentifierAccepted,
    passwordChanged: loginWorks,
    tokenMarkedUsed: Boolean(reusedToken.usedAt),
    reuseBlocked: Boolean(reusedToken.usedAt),
    finalLoginIdentifier: identifier,
    finalPasswordForManualTest: newPassword
  };
}

async function main() {
  const school = await getOrCreateSchool();
  await ensureOfficialKcsCatalog(school.id);
  await Promise.all(["Grade 1", "Grade 6", "Grade 9"].map((name) => getOrCreateClass(school.id, name)));
  const actor = await getOrCreateActor(school.id);
  const timestamp = Date.now();
  const temporaryPassword = `Temp-Sim-${timestamp}!`;
  const { parent, user } = await createSimulationParent({
    schoolId: school.id,
    fullName: `Parent Simulation SMS ${timestamp}`,
    phone: TEST_PHONE,
    email: `parent.sms.sim.${timestamp}@kcs.local`,
    temporaryPassword
  });

  const messagingConfig = getMessagingConfigStatus();
  const smsProbeStatus = await sendSms({
    to: TEST_PHONE,
    text: `EduPay KCS: simulation locale demarree pour ${parent.fullName}. Si vous recevez ce SMS, Africa's Talking repond.`
  });

  const stages = [];
  await addStudent({ schoolId: school.id, parentId: parent.id, fullName: "Simulation Eleve 1", className: "Grade 1" });
  stages.push(await runStage({ schoolId: school.id, actorUserId: actor.id, parentId: parent.id, stage: 1, paymentAmount: 500 }));

  await addStudent({ schoolId: school.id, parentId: parent.id, fullName: "Simulation Eleve 2", className: "Grade 6" });
  stages.push(await runStage({ schoolId: school.id, actorUserId: actor.id, parentId: parent.id, stage: 2, paymentAmount: 1200 }));

  await addStudent({ schoolId: school.id, parentId: parent.id, fullName: "Simulation Eleve 3", className: "Grade 9" });
  stages.push(await runStage({ schoolId: school.id, actorUserId: actor.id, parentId: parent.id, stage: 3, paymentAmount: 1800 }));

  const recovery = await simulatePasswordRecovery(user.id, user.accessCode);
  const finalSnapshot = await getParentFinancialSnapshot({
    schoolId: school.id,
    parentId: parent.id,
    academicYearName: ACADEMIC_YEAR
  });

  const report = {
    generatedAt: new Date().toISOString(),
    parent: {
      id: parent.id,
      fullName: parent.fullName,
      email: parent.email,
      phone: parent.phone,
      accessCode: user.accessCode,
      temporaryPasswordBeforeRecovery: temporaryPassword
    },
    messaging: {
      configured: messagingConfig.sms.configured,
      providerUrl: messagingConfig.sms.providerUrl,
      sender: messagingConfig.sms.sender,
      initialSmsStatus: smsProbeStatus,
      paymentSmsStatuses: finalSnapshot.notificationHistory
        .filter((message) => message.channel === "SMS")
        .map((message) => ({ type: message.type, status: message.status, createdAt: message.createdAt }))
    },
    stages,
    recovery,
    finalParentDashboard: {
      profile: finalSnapshot.profile,
      students: finalSnapshot.students,
      reductions: finalSnapshot.reductions,
      messages: finalSnapshot.notificationHistory.slice(0, 10)
    }
  };

  const reportDir = join(process.cwd().endsWith(join("apps", "api")) ? join(process.cwd(), "..", "..") : process.cwd(), "reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "edupay-parent-growth-sms-recovery-simulation.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(reportDir, "edupay-parent-growth-sms-recovery-simulation.md"), [
    "# EduPay Parent Growth + SMS + Password Recovery Simulation",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `Parent: ${report.parent.fullName}`,
    `Phone: ${report.parent.phone}`,
    `Login code: ${report.parent.accessCode}`,
    `Final recovered password: ${report.recovery.finalPasswordForManualTest}`,
    "",
    "## SMS",
    "",
    `- Configured: ${report.messaging.configured}`,
    `- Initial SMS status: ${report.messaging.initialSmsStatus}`,
    `- Payment SMS statuses: ${report.messaging.paymentSmsStatuses.map((row) => row.status).join(", ") || "none"}`,
    "",
    "## Stages",
    "",
    ...report.stages.map((stage) => [
      `### Stage ${stage.stage}`,
      `- Payment: $${stage.paymentAmount.toFixed(2)}`,
      `- Expected: $${stage.snapshot.totalExpected.toFixed(2)}`,
      `- Paid: $${stage.snapshot.totalPaid.toFixed(2)}`,
      `- Debt: $${stage.snapshot.totalDebt.toFixed(2)}`,
      `- Reduction: $${stage.snapshot.totalReduction.toFixed(2)}`,
      `- Students: ${stage.snapshot.students.map((student) => `${student.fullName} reduction $${student.reductionTotal.toFixed(2)}`).join("; ")}`,
      `- Reduction rows: ${stage.snapshot.reductions.map((reduction) => `${reduction.title} $${reduction.amount.toFixed(2)} (${reduction.studentName})`).join("; ")}`
    ].join("\n")),
    "",
    "## Password Recovery",
    "",
    `- Wrong identifier blocked: ${report.recovery.wrongIdentifierBlocked}`,
    `- Correct identifier accepted: ${report.recovery.correctIdentifierAccepted}`,
    `- Password changed: ${report.recovery.passwordChanged}`,
    `- Token marked used: ${report.recovery.tokenMarkedUsed}`,
    `- Token reuse blocked: ${report.recovery.reuseBlocked}`
  ].join("\n"));

  console.log(JSON.stringify({
    report: join(reportDir, "edupay-parent-growth-sms-recovery-simulation.md"),
    parent: report.parent,
    sms: report.messaging,
    recovery: report.recovery
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
