import { describe, expect, it } from "vitest";
import { buildReceiptAllocationSnapshot, buildReceiptAllocationStatusNote } from "./receiptAllocation";

describe("receipt allocation snapshot", () => {
  it("builds a compact standard snapshot and truncates extra children", () => {
    const snapshot = buildReceiptAllocationSnapshot({
      mode: "AUTO",
      message: "ignored for print",
      totalReceived: 180,
      allocatedTotal: 180,
      missingAmount: 0,
      advanceBalance: 0,
      perChild: [
        { studentName: "A", allocated: 40, remaining: 10, lines: [] },
        { studentName: "B", allocated: 40, remaining: 0, lines: [] },
        { studentName: "C", allocated: 40, remaining: 5, lines: [] },
        { studentName: "D", allocated: 30, remaining: 0, lines: [] },
        { studentName: "E", allocated: 30, remaining: 2, lines: [] },
      ],
    });

    expect(snapshot.modeLabel).toBe("Imputation automatique");
    expect(snapshot.metrics.map((item) => item.label)).toEqual([
      "Montant reçu",
      "Montant imputé",
      "Solde non imputé",
      "Avance",
    ]);
    expect(snapshot.perChild).toHaveLength(4);
    expect(snapshot.overflowChildCount).toBe(1);
  });

  it("surfaces the unpaid balance note when money remains unapplied", () => {
    const note = buildReceiptAllocationStatusNote({
      mode: "MANUAL",
      message: "ignored for print",
      totalReceived: 100,
      allocatedTotal: 75,
      missingAmount: 25,
      advanceBalance: 0,
      perChild: [],
    });

    expect(note).toBe("Solde non imputé : $ 25");
  });
});
