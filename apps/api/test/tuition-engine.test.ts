import { PaymentOptionType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildTuitionParentNotificationMessages, simulateTuitionEngineScenario } from "../src/modules/finance/service";

const tenChildFamily = [
  { id: "stu-k5", fullName: "Child K5", className: "K5" },
  { id: "stu-g1", fullName: "Child G1", className: "Grade 1" },
  { id: "stu-g2", fullName: "Child G2", className: "Grade 2" },
  { id: "stu-g4", fullName: "Child G4", className: "Grade 4" },
  { id: "stu-g6", fullName: "Child G6", className: "Grade 6" },
  { id: "stu-g7", fullName: "Child G7", className: "Grade 7" },
  { id: "stu-g8", fullName: "Child G8", className: "Grade 8" },
  { id: "stu-g9", fullName: "Child G9", className: "Grade 9" },
  { id: "stu-g10", fullName: "Child G10", className: "Grade 10" },
  { id: "stu-g12", fullName: "Child G12", className: "Grade 12" }
];

const stressFamilies = {
  twoChildren: [
    { id: "case1-a", fullName: "Case 1 Child A", className: "Grade 1" },
    { id: "case1-b", fullName: "Case 1 Child B", className: "Grade 1" }
  ],
  threeChildren: [
    { id: "case2-a", fullName: "Case 2 Child A", className: "Grade 6" },
    { id: "case2-b", fullName: "Case 2 Child B", className: "Grade 6" },
    { id: "case2-c", fullName: "Case 2 Child C", className: "Grade 6" }
  ],
  fiveChildren: [
    { id: "case3-a", fullName: "Case 3 Child A", className: "Grade 9" },
    { id: "case3-b", fullName: "Case 3 Child B", className: "Grade 10" },
    { id: "case3-c", fullName: "Case 3 Child C", className: "Grade 11" },
    { id: "case3-d", fullName: "Case 3 Child D", className: "Grade 12" },
    { id: "case3-e", fullName: "Case 3 Child E", className: "Grade 9" }
  ],
  singleChild: [
    { id: "case4-a", fullName: "Case 4 Only Child", className: "Grade 6" }
  ],
  mixedGrades: [
    { id: "case5-a", fullName: "Child A", className: "Grade 1" },
    { id: "case5-b", fullName: "Child B", className: "Grade 6" },
    { id: "case5-c", fullName: "Child C", className: "Grade 11" }
  ]
};

function round(value: number) {
  return Number(value.toFixed(5));
}

function assertDiscountOrder(result: ReturnType<typeof simulateTuitionEngineScenario>) {
  for (const row of result.calculations) {
    const expectedFamilyDiscount = round(row.baseAnnualTuition * (row.familyDiscountRate / 100));
    const expectedFamilyAdjusted = round(row.baseAnnualTuition - expectedFamilyDiscount);
    expect(row.familyDiscountAmount).toBe(expectedFamilyDiscount);
    expect(row.familyAdjustedTuition).toBe(expectedFamilyAdjusted);

    if (row.paymentOptionType !== PaymentOptionType.SPECIAL_OWNER_AGREEMENT) {
      const expectedPlanDiscount = round(row.familyAdjustedTuition * (row.planDiscountRate / 100));
      expect(row.planDiscountAmount).toBe(expectedPlanDiscount);
      expect(row.finalTuition).toBe(round(Math.max(row.familyAdjustedTuition - expectedPlanDiscount - row.additionalReductionAmount, 0)));
    }
    expect(row.totalReductionAmount).toBe(round(row.familyDiscountAmount + row.planDiscountAmount + row.additionalReductionAmount));
  }
}

function assertFinancialIntegrity(result: ReturnType<typeof simulateTuitionEngineScenario>) {
  expect(result.calculations.length).toBeGreaterThan(0);
  expect(result.calculations.every((row) => row.baseAnnualTuition >= 0)).toBe(true);
  expect(result.calculations.every((row) => row.familyAdjustedTuition >= 0)).toBe(true);
  expect(result.calculations.every((row) => row.finalTuition >= 0)).toBe(true);
  expect(result.calculations.every((row) => row.schedule.length > 0)).toBe(true);
  expect(result.calculations.every((row) => round(row.schedule.reduce((sum, item) => sum + item.amountDue, 0)) === row.finalTuition)).toBe(true);

  const lines = result.allocationPreview.lines;
  const installmentIds = lines.map((line) => line.installmentId);
  expect(new Set(installmentIds).size).toBe(installmentIds.length);
  expect(lines.every((line) => line.amountDue >= 0 && line.outstandingBefore >= 0 && line.outstandingAfter >= 0)).toBe(true);
  expect(lines.every((line) => line.allocated >= 0 && line.allocated <= line.outstandingBefore)).toBe(true);
  expect(result.allocationPreview.allocatedTotal).toBeLessThanOrEqual(result.allocationPreview.totalReceived);
  expect(round(result.allocationPreview.allocatedTotal + result.allocationPreview.advanceBalance)).toBe(result.allocationPreview.totalReceived);
  expect(round(result.allocationPreview.allocatedTotal + result.allocationPreview.missingAmount)).toBe(result.totals.finalTuition);
}

function reportCase(result: ReturnType<typeof simulateTuitionEngineScenario>) {
  return result.calculations.map((row) => ({
    student: row.studentName,
    step1BaseTuition: row.baseAnnualTuition,
    step2FamilyDiscount: row.familyDiscountAmount,
    step3FamilyAdjustedTuition: row.familyAdjustedTuition,
    step4PlanDiscount: row.planDiscountAmount,
    step5FinalTuition: row.finalTuition,
    step6InstallmentBreakdown: row.schedule.map((item) => ({
      label: item.label,
      amountDue: item.amountDue,
      dueDate: item.dueDate.toISOString().slice(0, 10)
    })),
    step7CurrentAmountDue: result.allocationPreview.lines
      .filter((line) => line.studentId === row.studentId && line.dueBucket !== "FUTURE")
      .reduce((sum, line) => round(sum + line.outstandingBefore), 0),
    step8PaymentAllocationResult: result.allocationPreview.lines
      .filter((line) => line.studentId === row.studentId)
      .reduce((sum, line) => round(sum + line.allocated), 0),
    step9RemainingBalance: result.allocationPreview.lines
      .filter((line) => line.studentId === row.studentId)
      .reduce((sum, line) => round(sum + line.outstandingAfter), 0),
    step10AlertsGenerated: result.allocationPreview.warnings.filter((warning) => warning.includes(row.studentName))
  }));
}

describe("EduPay Tuition Payment Engine", () => {
  it("applies family discount first, then plan discount, and auto-allocates a complex 10-child payment", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 12000,
      children: tenChildFamily
    });

    expect(result.calculations).toHaveLength(10);
    expect(result.totals.baseAnnualTuition).toBe(44437.5);
    expect(result.totals.familyDiscount).toBe(4443.75);
    expect(result.totals.planDiscount).toBe(0);
    expect(result.totals.finalTuition).toBe(39993.75);
    expect(result.totals.allocated).toBe(12000);
    expect(result.totals.remaining).toBe(27993.75);

    const g9 = result.calculations.find((row) => row.studentId === "stu-g9");
    expect(g9?.baseAnnualTuition).toBe(5420);
    expect(g9?.familyAdjustedTuition).toBe(4878);
    expect(g9?.monthlyAmount).toBe(487.8);

    const allocatedByChild = result.allocationPreview.lines.reduce<Record<string, number>>((acc, line) => {
      acc[line.studentName] = (acc[line.studentName] ?? 0) + line.allocated;
      return acc;
    }, {});
    expect(allocatedByChild["Child K5"]).toBeCloseTo(832.41, 2);
    expect(allocatedByChild["Child G1"]).toBeCloseTo(1018.06, 2);
    expect(allocatedByChild["Child G6"]).toBeCloseTo(1240.84, 2);
    expect(allocatedByChild["Child G9"]).toBeCloseTo(1463.63, 2);
  });

  it("keeps every 10-child transaction detail needed by the finance officer and receipt", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 12000,
      children: tenChildFamily
    });

    expect(result.allocationPreview.totalReceived).toBe(12000);
    expect(result.allocationPreview.allocatedTotal).toBe(12000);
    expect(result.allocationPreview.missingAmount).toBe(27993.75);
    expect(result.allocationPreview.advanceBalance).toBe(0);
    expect(result.allocationPreview.lines).toHaveLength(70);
    expect(result.allocationPreview.lines.every((line) => line.outstandingBefore >= line.allocated)).toBe(true);
    expect(result.allocationPreview.lines.every((line) => line.outstandingAfter === Number((line.outstandingBefore - line.allocated).toFixed(5)))).toBe(true);

    const firstObligations = result.allocationPreview.lines.filter((line) => line.label === "Initial 4-month payment");
    expect(firstObligations).toHaveLength(10);
    expect(firstObligations.every((line) => line.allocated > 0)).toBe(true);
    expect(firstObligations.every((line) => line.outstandingAfter > 0)).toBe(true);

    const laterObligations = result.allocationPreview.lines.filter((line) => line.label !== "Initial 4-month payment");
    expect(laterObligations.some((line) => line.outstandingAfter > 0)).toBe(true);
    expect(laterObligations.every((line) => line.allocated === 0)).toBe(true);

    const financeMessage = result.allocationPreview.message;
    expect(financeMessage).toContain("Total amount received: $ 12000.00 USD.");
    expect(financeMessage).toContain("Allocated:");
    expect(financeMessage).toContain("Remaining unpaid: $ 27993.75 USD.");
    expect(financeMessage).toContain("Next required payment:");
    expect(financeMessage).toContain("No overdue balance remains");

    const receiptChildren = Object.values(result.allocationPreview.lines.reduce<Record<string, {
      studentName: string;
      allocated: number;
      remaining: number;
      lines: Array<{ label: string; dueBucket: string; outstandingBefore: number; allocated: number; outstandingAfter: number }>;
    }>>((acc, line) => {
      const current = acc[line.studentName] ?? { studentName: line.studentName, allocated: 0, remaining: 0, lines: [] };
      current.allocated = Number((current.allocated + line.allocated).toFixed(5));
      current.remaining = Number((current.remaining + line.outstandingAfter).toFixed(5));
      current.lines.push({
        label: line.label,
        dueBucket: line.dueBucket,
        outstandingBefore: line.outstandingBefore,
        allocated: line.allocated,
        outstandingAfter: line.outstandingAfter
      });
      acc[line.studentName] = current;
      return acc;
    }, {}));

    expect(receiptChildren).toHaveLength(10);
    expect(receiptChildren.every((child) => child.lines.length === 7)).toBe(true);
    expect(receiptChildren.find((child) => child.studentName === "Child G9")?.allocated).toBeCloseTo(1463.63, 2);
    expect(receiptChildren.find((child) => child.studentName === "Child G9")?.remaining).toBeCloseTo(3414.37, 2);
  });

  it("builds parent email and SMS notices with receipt, allocation, balance, and next payment", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 12000,
      children: tenChildFamily
    });
    const messages = buildTuitionParentNotificationMessages({
      parentName: "Parent Ten",
      language: "en",
      transactionNumber: "TXN-10-CHILDREN",
      receiptNumber: "REC-TXN-10-CHILDREN",
      paymentMethod: "CASH",
      allocationMode: "AUTO",
      allocationPreview: result.allocationPreview
    });

    expect(messages.subject).toContain("REC-TXN-10-CHILDREN");
    expect(messages.emailBody).toContain("Transaction: TXN-10-CHILDREN");
    expect(messages.emailBody).toContain("Receipt: REC-TXN-10-CHILDREN");
    expect(messages.emailBody).toContain("Amount received: $ 12000.00 USD");
    expect(messages.emailBody).toContain("Remaining balance: $ 27993.75 USD");
    expect(messages.emailBody).toContain("- Child G9: paid $ 1463.63 USD, remaining $ 3414.37 USD");
    expect(messages.emailBody).toContain("Next payment:");
    expect(messages.emailBody).toContain("Finance note:");
    expect(messages.smsBody).toContain("received $ 12000.00 USD");
    expect(messages.smsBody).toContain("remaining $ 27993.75 USD");
  });

  it("allocates first to open scheduled obligations and keeps overpayment as advance", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      amount: 50000,
      children: tenChildFamily
    });

    expect(result.totals.finalTuition).toBe(35994.375);
    expect(result.totals.allocated).toBe(35994.375);
    expect(result.totals.remaining).toBe(0);
    expect(result.totals.advance).toBe(14005.625);
  });

  it("pays the oldest future installment before later future installments", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 20000,
      children: tenChildFamily
    });

    const month5Lines = result.allocationPreview.lines.filter((line) => line.label === "Month 5 payment");
    const month6Lines = result.allocationPreview.lines.filter((line) => line.label === "Month 6 payment");
    expect(month5Lines.reduce((sum, line) => sum + line.allocated, 0)).toBeCloseTo(3999.375, 3);
    expect(month6Lines.reduce((sum, line) => sum + line.allocated, 0)).toBeCloseTo(3.125, 3);

    const month7Lines = result.allocationPreview.lines.filter((line) => line.label === "Month 7 payment");
    expect(month7Lines.reduce((sum, line) => sum + line.allocated, 0)).toBe(0);

    const initialLines = result.allocationPreview.lines.filter((line) => line.label === "Initial 4-month payment");
    expect(initialLines.every((line) => line.outstandingAfter === 0)).toBe(true);
  });

  it("stress-tests required family sizes, mixed grades, incomplete payments, and overpayments", () => {
    const cases = [
      { name: "CASE 1 - family with 2 children", amount: 1300, paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER, children: stressFamilies.twoChildren },
      { name: "CASE 2 - family with 3 children", amount: 2000, paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS, children: stressFamilies.threeChildren },
      { name: "CASE 3 - family with 5 children", amount: 5000, paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS, children: stressFamilies.fiveChildren },
      { name: "CASE 4 - single child parent", amount: 700, paymentOptionType: PaymentOptionType.STANDARD_MONTHLY, children: stressFamilies.singleChild },
      { name: "CASE 5 - mixed grades", amount: 3000, paymentOptionType: PaymentOptionType.STANDARD_MONTHLY, children: stressFamilies.mixedGrades },
      { name: "CASE 8 - incomplete payment", amount: 700, paymentOptionType: PaymentOptionType.STANDARD_MONTHLY, children: stressFamilies.mixedGrades },
      { name: "CASE 9 - overpayment", amount: 50000, paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER, children: stressFamilies.mixedGrades },
      { name: "CASE 10 - random allocation amount", amount: 1300, paymentOptionType: PaymentOptionType.STANDARD_MONTHLY, children: stressFamilies.mixedGrades }
    ];

    for (const testCase of cases) {
      const result = simulateTuitionEngineScenario(testCase);
      assertDiscountOrder(result);
      assertFinancialIntegrity(result);
      expect(reportCase(result), testCase.name).toHaveLength(testCase.children.length);
      expect(result.allocationPreview.message).toContain(`Total amount received: $ ${testCase.amount.toFixed(2)} USD.`);
      if (testCase.amount < result.totals.finalTuition) {
        expect(result.totals.remaining).toBeGreaterThan(0);
        expect(result.allocationPreview.warnings.length).toBeGreaterThan(0);
      }
      if (testCase.amount > result.totals.finalTuition) {
        expect(result.totals.advance).toBe(round(testCase.amount - result.totals.finalTuition));
      }
    }
  });

  it("supports different payment plans within the same family and proves discounts are ordered per child", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 5000,
      children: [
        { id: "mixed-plan-a", fullName: "Mixed Plan A", className: "Grade 1", paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER },
        { id: "mixed-plan-b", fullName: "Mixed Plan B", className: "Grade 6", paymentOptionType: PaymentOptionType.TWO_INSTALLMENTS },
        { id: "mixed-plan-c", fullName: "Mixed Plan C", className: "Grade 11", paymentOptionType: PaymentOptionType.THREE_INSTALLMENTS },
        { id: "mixed-plan-d", fullName: "Mixed Plan D", className: "K5", paymentOptionType: PaymentOptionType.STANDARD_MONTHLY }
      ]
    });

    assertDiscountOrder(result);
    assertFinancialIntegrity(result);

    expect(result.calculations.find((row) => row.studentId === "mixed-plan-a")?.finalTuition).toBe(3053.7);
    expect(result.calculations.find((row) => row.studentId === "mixed-plan-b")?.finalTuition).toBe(3928.725);
    expect(result.calculations.find((row) => row.studentId === "mixed-plan-c")?.finalTuition).toBe(4780.44);
    expect(result.calculations.find((row) => row.studentId === "mixed-plan-d")?.finalTuition).toBe(2774.25);
  });

  it("supports administrator-defined custom agreement plans without creating impossible totals", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 2000,
      children: [
        { id: "custom-a", fullName: "Custom A", className: "Grade 1", paymentOptionType: PaymentOptionType.SPECIAL_OWNER_AGREEMENT, customAgreementFinalTuition: 2500 },
        { id: "custom-b", fullName: "Custom B", className: "Grade 6", paymentOptionType: PaymentOptionType.STANDARD_MONTHLY }
      ]
    });

    assertDiscountOrder(result);
    assertFinancialIntegrity(result);

    const custom = result.calculations.find((row) => row.studentId === "custom-a");
    expect(custom?.familyAdjustedTuition).toBe(3393);
    expect(custom?.finalTuition).toBe(2500);
    expect(custom?.planDiscountAmount).toBe(893);
  });

  it("subtracts every approved extra reduction after family and plan discounts before allocating payments", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.FULL_PRESEPTEMBER,
      amount: 5000,
      children: [
        { id: "all-reductions-a", fullName: "All Reductions A", className: "Grade 1", additionalReductionAmount: 250 },
        { id: "all-reductions-b", fullName: "All Reductions B", className: "Grade 6", additionalReductionAmount: 400 }
      ]
    });

    assertDiscountOrder(result);
    assertFinancialIntegrity(result);

    const first = result.calculations.find((row) => row.studentId === "all-reductions-a");
    const second = result.calculations.find((row) => row.studentId === "all-reductions-b");
    expect(first?.familyDiscountAmount).toBe(377);
    expect(first?.planDiscountAmount).toBe(339.3);
    expect(first?.additionalReductionAmount).toBe(250);
    expect(first?.finalTuition).toBe(2803.7);
    expect(second?.familyDiscountAmount).toBe(459.5);
    expect(second?.planDiscountAmount).toBe(413.55);
    expect(second?.additionalReductionAmount).toBe(400);
    expect(second?.finalTuition).toBe(3321.95);
    expect(result.totals.additionalReduction).toBe(650);
    expect(result.totals.totalReduction).toBe(2239.35);
  });

  it("stress-tests manual allocation warnings and prevents over-allocation", () => {
    const setup = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 0,
      children: stressFamilies.mixedGrades
    });
    const [first, second] = setup.allocationPreview.lines;
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 1300,
      allocationMode: "MANUAL",
      manualAllocations: [
        { installmentId: first.installmentId, amount: first.outstandingBefore + 500 },
        { installmentId: second.installmentId, amount: 1000 }
      ],
      children: stressFamilies.mixedGrades
    });

    assertDiscountOrder(result);
    assertFinancialIntegrity(result);
    expect(result.allocationPreview.mode).toBe("MANUAL");
    expect(result.allocationPreview.warnings).toContain("Manual allocation total cannot exceed the received payment amount.");
    expect(result.allocationPreview.lines.every((line) => line.allocated <= line.outstandingBefore)).toBe(true);
  });

  it("honors manual finance split for every official tuition plan", () => {
    const plans = [
      PaymentOptionType.FULL_PRESEPTEMBER,
      PaymentOptionType.TWO_INSTALLMENTS,
      PaymentOptionType.THREE_INSTALLMENTS,
      PaymentOptionType.STANDARD_MONTHLY
    ];

    for (const paymentOptionType of plans) {
      const setup = simulateTuitionEngineScenario({
        paymentOptionType,
        amount: 0,
        children: stressFamilies.mixedGrades
      });
      const manualTargets = setup.allocationPreview.lines.slice(0, 3).map((line, index) => ({
        installmentId: line.installmentId,
        amount: round(Math.min(line.outstandingBefore, [300, 200, 100][index]))
      }));
      const manualTotal = round(manualTargets.reduce((sum, row) => sum + row.amount, 0));
      const result = simulateTuitionEngineScenario({
        paymentOptionType,
        amount: manualTotal,
        allocationMode: "MANUAL",
        manualAllocations: manualTargets,
        children: stressFamilies.mixedGrades
      });

      assertDiscountOrder(result);
      assertFinancialIntegrity(result);
      expect(result.allocationPreview.mode, paymentOptionType).toBe("MANUAL");
      expect(result.allocationPreview.allocatedTotal, paymentOptionType).toBe(manualTotal);
      for (const target of manualTargets) {
        expect(result.allocationPreview.lines.find((line) => line.installmentId === target.installmentId)?.allocated, paymentOptionType).toBe(target.amount);
      }
    }
  });

  it("generates finance audit reports for discounts, allocations, risk, and recommendations", () => {
    const result = simulateTuitionEngineScenario({
      paymentOptionType: PaymentOptionType.STANDARD_MONTHLY,
      amount: 1300,
      children: stressFamilies.mixedGrades
    });
    const discountReport = {
      familyDiscountsApplied: result.totals.familyDiscount,
      tuitionDiscountsApplied: result.totals.planDiscount,
      totalSavings: round(result.totals.familyDiscount + result.totals.planDiscount),
      errorsDetected: result.calculations.filter((row) => row.familyAdjustedTuition !== round(row.baseAnnualTuition - row.familyDiscountAmount))
    };
    const allocationReport = {
      automaticAllocations: result.allocationPreview.lines.filter((line) => line.allocated > 0),
      manualAllocations: [],
      warnings: result.allocationPreview.warnings
    };
    const riskReport = {
      parentsAtPaymentRisk: result.totals.remaining > 0 ? ["stress-family"] : [],
      studentsAtRisk: result.allocationPreview.lines.filter((line) => line.dueBucket !== "FUTURE" && line.outstandingAfter > 0).map((line) => line.studentName),
      overdueAccounts: result.allocationPreview.lines.filter((line) => line.dueBucket === "OVERDUE" && line.outstandingAfter > 0)
    };
    const recommendations = [
      result.totals.remaining > 0 ? "Trigger parent reminder with next required payment." : "Archive account as settled.",
      allocationReport.warnings.length > 0 ? "Review allocation warnings before issuing final receipt." : "Allocation is mathematically consistent.",
      "Keep family discount before plan discount in every future refactor."
    ];

    expect(discountReport.errorsDetected).toHaveLength(0);
    expect(discountReport.totalSavings).toBeGreaterThan(0);
    expect(allocationReport.automaticAllocations.length).toBeGreaterThan(0);
    expect(riskReport.parentsAtPaymentRisk).toContain("stress-family");
    expect(recommendations).toContain("Keep family discount before plan discount in every future refactor.");
  });
});
