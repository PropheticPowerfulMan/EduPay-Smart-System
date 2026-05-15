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
});
