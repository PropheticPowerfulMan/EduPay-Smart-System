import { describe, expect, it } from "vitest";

import { mapOrbitFamiliesToSharedOptions } from "../src/integrations/orbitRegistry";

describe("mapOrbitFamiliesToSharedOptions", () => {
  it("maps Orbit families into EduPay parent and student options with shared external ids", () => {
    const mapped = mapOrbitFamiliesToSharedOptions([
      {
        id: "family-1",
        familyLabel: "Tshisekedi Family",
        studentCount: 2,
        parents: [
          {
            id: "parent-1",
            externalId: "PAR-EXT-001",
            relation: "Parent",
            parent: {
              firstName: "Mireille",
              lastName: "Tshisekedi",
              fullName: "Mireille Tshisekedi",
              email: "mireille@example.com",
              phone: "+243000000111",
            },
          },
        ],
        children: [
          {
            id: "student-1",
            externalId: "STU-EXT-001",
            studentNumber: "STU-EXT-001",
            grade: "Grade 4",
            section: "A",
            status: "ACTIVE",
            student: {
              firstName: "Nadia",
              lastName: "Tshisekedi",
              fullName: "Nadia Tshisekedi",
            },
          },
          {
            id: "student-2",
            externalId: "STU-EXT-002",
            studentNumber: "STU-EXT-002",
            grade: "Grade 2",
            section: "B",
            status: "ACTIVE",
            student: {
              firstName: "Bryan",
              lastName: "Tshisekedi",
              fullName: "Bryan Tshisekedi",
            },
          },
        ],
      },
    ]);

    expect(mapped.classes).toEqual(["Grade 2 - B", "Grade 4 - A"]);
    expect(mapped.parents).toHaveLength(1);
    expect(mapped.parents[0].fullName).toBe("Mireille Tshisekedi");
    expect(mapped.parents[0].students).toEqual([
      {
        id: "student-1",
        externalStudentId: "STU-EXT-001",
        fullName: "Nadia Tshisekedi",
        classId: "Grade 4 - A",
        className: "Grade 4 - A",
        annualFee: 0,
      },
      {
        id: "student-2",
        externalStudentId: "STU-EXT-002",
        fullName: "Bryan Tshisekedi",
        classId: "Grade 2 - B",
        className: "Grade 2 - B",
        annualFee: 0,
      },
    ]);
  });
});