import { PaymentOptionType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { simulateTuitionEngineScenario } from "../src/modules/finance/service";

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
