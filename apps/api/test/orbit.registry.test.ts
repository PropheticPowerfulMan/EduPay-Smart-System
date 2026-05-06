import { describe, expect, it } from "vitest";

import { mapOrbitDirectoryToSharedOptions } from "../src/integrations/orbitRegistry";

describe("mapOrbitDirectoryToSharedOptions", () => {
  it("maps the Orbit shared directory into EduPay parent and student options with shared external ids", () => {
    const mapped = mapOrbitDirectoryToSharedOptions({
      source: "orbit",
      visibility: "shared-directory",
      parents: [
        {
          id: "parent-1",
          fullName: "Mireille Tshisekedi",
          firstName: "Mireille",
          lastName: "Tshisekedi",
          phone: "+243000000111",
          email: "mireille@example.com",
          studentIds: ["student-1", "student-2"],
          externalIds: [{ appSlug: "SAVANEX", externalId: "PAR-EXT-001" }],
        },
      ],
      students: [
        {
          id: "student-1",
          fullName: "Nadia Tshisekedi",
          firstName: "Nadia",
          lastName: "Tshisekedi",
          studentNumber: "STU-EXT-001",
          className: "Grade 4 - A",
          externalIds: [{ appSlug: "SAVANEX", externalId: "STU-EXT-001" }],
        },
        {
          id: "student-2",
          fullName: "Bryan Tshisekedi",
          firstName: "Bryan",
          lastName: "Tshisekedi",
          studentNumber: "STU-EXT-002",
          className: "Grade 2 - B",
          externalIds: [{ appSlug: "SAVANEX", externalId: "STU-EXT-002" }],
        },
      ],
      teachers: [],
    });

    expect(mapped.classes).toEqual(["Grade 2 - B", "Grade 4 - A"]);
    expect(mapped.parents).toHaveLength(1);
    expect(mapped.parents[0].fullName).toBe("Mireille Tshisekedi");
    expect(mapped.parents[0].students).toEqual([
      {
        id: "student-1",
        externalStudentId: "STU-EXT-001",
        studentNumber: "STU-EXT-001",
        fullName: "Nadia Tshisekedi",
        classId: "Grade 4 - A",
        className: "Grade 4 - A",
        annualFee: 0,
      },
      {
        id: "student-2",
        externalStudentId: "STU-EXT-002",
        studentNumber: "STU-EXT-002",
        fullName: "Bryan Tshisekedi",
        classId: "Grade 2 - B",
        className: "Grade 2 - B",
        annualFee: 0,
      },
    ]);
  });
});
