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
});
