export type ReceiptAllocationSummary = {
  mode: "AUTO" | "MANUAL";
  message: string;
  totalReceived: number;
  allocatedTotal: number;
  missingAmount: number;
  advanceBalance: number;
  perChild: Array<{
    studentName: string;
    allocated: number;
    remaining: number;
    lines: Array<{
      label: string;
      dueBucket: string;
      outstandingBefore: number;
      allocated: number;
      outstandingAfter: number;
    }>;
  }>;
};

export type ReceiptAllocationSnapshot = {
  modeLabel: string;
  statusNote: string;
  metrics: Array<{ label: string; amount: number }>;
  perChild: Array<{ studentName: string; allocated: number; remaining: number }>;
  overflowChildCount: number;
};

function roundMoney(value: number) {
  const rounded = Math.round((Number(value || 0) + Number.EPSILON) * 100000) / 100000;
  const nearestInteger = Math.round(rounded);
  return Math.abs(rounded - nearestInteger) <= 0.00001 ? nearestInteger : rounded;
}

function formatMoney(value: number) {
  const rounded = roundMoney(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

export function getReceiptAllocationModeLabel(mode: ReceiptAllocationSummary["mode"]) {
  return mode === "AUTO" ? "Imputation automatique" : "Imputation manuelle";
}

export function buildReceiptAllocationStatusNote(summary: ReceiptAllocationSummary) {
  if (summary.missingAmount > 0) {
    return `Solde non impute: $ ${formatMoney(summary.missingAmount)}`;
  }
  if (summary.advanceBalance > 0) {
    return `Excédent conserve en avance: $ ${formatMoney(summary.advanceBalance)}`;
  }
  return summary.mode === "AUTO"
    ? "Imputation complete selon l'ordre d'échéance."
    : "Imputation complete selon la ventilation saisie.";
}

export function buildReceiptAllocationSnapshot(summary: ReceiptAllocationSummary, maxVisibleChildren = 4): ReceiptAllocationSnapshot {
  return {
    modeLabel: getReceiptAllocationModeLabel(summary.mode),
    statusNote: buildReceiptAllocationStatusNote(summary),
    metrics: [
      { label: "Montant reçu", amount: roundMoney(summary.totalReceived) },
      { label: "Montant impute", amount: roundMoney(summary.allocatedTotal) },
      { label: "Solde non impute", amount: roundMoney(summary.missingAmount) },
      { label: "Avance", amount: roundMoney(summary.advanceBalance) },
    ],
    perChild: summary.perChild.slice(0, maxVisibleChildren).map((child) => ({
      studentName: child.studentName,
      allocated: roundMoney(child.allocated),
      remaining: roundMoney(child.remaining),
    })),
    overflowChildCount: Math.max(0, summary.perChild.length - maxVisibleChildren),
  };
}
