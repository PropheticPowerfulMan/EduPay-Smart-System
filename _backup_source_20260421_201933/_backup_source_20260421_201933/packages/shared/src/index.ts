export const SUPPORTED_LANGUAGES = ["fr", "en"] as const;

export const PAYMENT_STATUS_COLORS = {
  COMPLETED: "#22c55e",
  PENDING: "#f59e0b",
  FAILED: "#ef4444"
};

export type Role = "ADMIN" | "ACCOUNTANT" | "PARENT";
