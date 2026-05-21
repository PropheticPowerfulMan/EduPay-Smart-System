import { describe, expect, it, vi } from "vitest";
import { canSendOverdueStage, OVERDUE_REMINDER_STAGES } from "../src/modules/finance/service";

describe("overdue tuition reminder cadence", () => {
  it("defines exactly seven daily warning stages in one week", () => {
    expect(OVERDUE_REMINDER_STAGES.map((stage) => stage.stage)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(OVERDUE_REMINDER_STAGES.map((stage) => stage.minDelayDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(OVERDUE_REMINDER_STAGES.slice(1).every((stage) => stage.minDaysAfterPreviousNotice === 1)).toBe(true);
  });

  it("requires the previous warning before sending the next stage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));

    expect(canSendOverdueStage({ stage: 1, delayDays: 1, logs: [] })).toBe(true);
    expect(canSendOverdueStage({ stage: 2, delayDays: 2, logs: [] })).toBe(false);
    expect(canSendOverdueStage({
      stage: 2,
      delayDays: 2,
      logs: [{ content: "[OVERDUE_INSTALLMENT:test:STAGE:1]", createdAt: new Date("2026-05-07T09:00:00.000Z") }]
    })).toBe(true);
    expect(canSendOverdueStage({
      stage: 2,
      delayDays: 2,
      logs: [
        { content: "[OVERDUE_INSTALLMENT:test:STAGE:1]", createdAt: new Date("2026-05-07T09:00:00.000Z") },
        { content: "[OVERDUE_INSTALLMENT:test:STAGE:2]", createdAt: new Date("2026-05-08T09:00:00.000Z") }
      ]
    })).toBe(false);

    vi.useRealTimers();
  });
});
