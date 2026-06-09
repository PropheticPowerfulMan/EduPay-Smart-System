import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("syncPaymentToOrbit", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      KCS_ORBIT_API_URL: "http://localhost:4500",
      KCS_ORBIT_API_KEY: "edupay-test-key",
      KCS_ORBIT_ORGANIZATION_ID: "org-test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts a payment contract carrying the external student id and metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { syncPaymentToOrbit } = await import("../src/integrations/orbit");

    await syncPaymentToOrbit({
      payment: {
        id: "payment-1",
        transactionNumber: "SIM-TX-TEST-001",
        amount: 125.5,
        reason: "Tuition",
        method: "CASH",
        status: "COMPLETED",
        createdAt: new Date("2026-05-05T05:00:00.000Z"),
        schoolId: "school-1",
        parentId: "parent-1",
      },
      studentExternalIds: ["STU-EXT-001", "STU-EXT-002"],
      localStudentIds: ["student-1", "student-2"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    const body = JSON.parse(options.body);

    expect(url).toBe("http://localhost:4500/api/integration/ingest/edupay/payments");
    expect(options.headers["x-api-key"]).toBe("edupay-test-key");
    expect(body.organizationId).toBe("org-test");
    expect(body.payload.studentExternalId).toBe("STU-EXT-001");
    expect(body.payload.reference).toBe("SIM-TX-TEST-001");
    expect(body.metadata.studentExternalIds).toEqual(["STU-EXT-001", "STU-EXT-002"]);
    expect(body.metadata.localStudentIds).toEqual(["student-1", "student-2"]);
  });
});
