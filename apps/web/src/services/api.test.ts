import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, flushOfflineMutationQueue } from "./api";

if (typeof globalThis.localStorage === "undefined") {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value)
  });
}

describe("EduPay offline mutation queue", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues a write while offline and replays it when the API returns", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const queued = await api<{ offlineQueued: boolean; id: string }>("/api/contact", {
      method: "POST",
      body: JSON.stringify({ message: "offline note" })
    });

    expect(queued.offlineQueued).toBe(true);
    const result = await flushOfflineMutationQueue();

    expect(result).toMatchObject({ attempted: 1, sent: 1, remaining: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports the local forgot-password reset flow end to end", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const forgot = await api<{ message: string; resetToken?: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier: "admin@school.com" })
    });

    expect(forgot.resetToken).toBeTruthy();

    await api<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: forgot.resetToken, newPassword: "newPassword123" })
    });

    const login = await api<{ token: string; role: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@school.com", password: "newPassword123" })
    });

    expect(login).toMatchObject({ token: "local-admin-token", role: "ADMIN" });
  });

  it("records parent dashboard, email, and sms messages for local payments", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(new Response("Service unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await api<{
      payment: { id: string };
      notificationStatus: { dashboard?: string; email?: string; sms?: string };
    }>("/api/payments", {
      method: "POST",
      body: JSON.stringify({
        paymentCategory: "SERVICE",
        parentId: "PAR-KCS-001",
        parentFullName: "Rachel Kabongo",
        studentDisplayName: "Rachel Kabongo",
        reason: "Fournitures scolaires",
        amount: 25,
        method: "CASH",
        status: "COMPLETED",
        notifyParent: true
      })
    });

    expect(created.notificationStatus).toMatchObject({
      dashboard: "OPEN",
      email: "SIMULATED",
      sms: "SIMULATED"
    });

    localStorage.setItem("edupay_parent_id", "PAR-KCS-001");
    const profile = await api<{ notificationHistory: Array<{ channel: string; content: string; status: string }> }>(
      "/api/finance/me/profile"
    );

    expect(profile.notificationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "DASHBOARD", content: expect.stringContaining("Fournitures scolaires"), status: "OPEN" }),
        expect.objectContaining({ channel: "EMAIL", content: expect.stringContaining("Fournitures scolaires"), status: "SIMULATED" }),
        expect.objectContaining({ channel: "SMS", content: expect.stringContaining("Fournitures scolaires"), status: "SIMULATED" })
      ])
    );
  });
});
