import { describe, expect, it } from "vitest";
import { buildLocalAssistantFallback } from "../src/modules/ai/router";

describe("EduPay AI local assistant", () => {
  it("returns a real unpaid-student table instead of a generic diagnostic", () => {
    const response = buildLocalAssistantFallback("donne moi la liste des eleves qui n'ont pas encore paye", {
      parents: [
        {
          id: "parent-1",
          fullName: "Parent A",
          students: [
            { id: "student-a", fullName: "Student A", className: "Grade 6", annualFee: 1000 },
            { id: "student-b", fullName: "Student B", className: "Grade 7", annualFee: 1200 }
          ]
        }
      ],
      parentProfiles: [
        {
          parent: { id: "parent-1", fullName: "Parent A" },
          students: [
            { id: "student-a", fullName: "Student A", className: "Grade 6", expectedTotal: 1000, paid: 0, balance: 1000 },
            { id: "student-b", fullName: "Student B", className: "Grade 7", expectedTotal: 1200, paid: 800, balance: 400 }
          ]
        }
      ],
      payments: [
        { status: "COMPLETED", studentNames: ["Student B"] }
      ]
    });

    expect(response.answer).toContain("Liste precise");
    expect(response.tableRows).toHaveLength(1);
    expect(response.tableRows?.[0]).toMatchObject({
      student: "Student A",
      className: "Grade 6",
      parent: "Parent A",
      expected: 1000,
      paid: 0,
      balance: 1000,
      status: "UNPAID"
    });
  });
});
