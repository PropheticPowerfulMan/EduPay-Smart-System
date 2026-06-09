import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PaymentCreatedSchema } from "@ecosystem/shared-contracts";

const orbitApiUrl = (process.env.KCS_ORBIT_API_URL || "").replace(/\/$/, "");
const orbitApiKey = process.env.KCS_ORBIT_API_KEY || "";
const orbitOrganizationId = process.env.KCS_ORBIT_ORGANIZATION_ID || "";
const OUTBOX_PATH = join(__dirname, "..", "..", "var", "orbit-outbox.jsonl");
const OUTBOX_FLUSH_BATCH_SIZE = 10;
const DEFAULT_OUTBOX_RETRY_INTERVAL_MS = 30_000;

type OutboxRecord = {
  id: string;
  path: string;
  payload: unknown;
  attempts: number;
  lastError: string;
  queuedAt?: string;
};

let outboxLock: Promise<void> = Promise.resolve();
let flushInFlight: Promise<number> | null = null;

function orbitSyncEnabled() {
  return Boolean(orbitApiUrl && orbitApiKey && orbitOrganizationId);
}

async function withOutboxLock<T>(operation: () => Promise<T>): Promise<T> {
  const previousLock = outboxLock;
  let release!: () => void;
  outboxLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previousLock;

  try {
    return await operation();
  } finally {
    release();
  }
}

function createOutboxRecord(path: string, payload: unknown, errorMessage: string, attempts = 0, recordId?: string): OutboxRecord {
  return {
    id: recordId ?? crypto.randomUUID(),
    path,
    payload,
    attempts,
    lastError: errorMessage,
    queuedAt: typeof payload === "object" && payload !== null && "occurredAt" in payload
      ? String((payload as { occurredAt?: string }).occurredAt ?? "") || undefined
      : undefined
  };
}

async function appendOutbox(record: OutboxRecord) {
  await withOutboxLock(async () => {
    await mkdir(dirname(OUTBOX_PATH), { recursive: true });
    await appendFile(OUTBOX_PATH, `${JSON.stringify(record)}\n`, "utf8");
  });
}

async function loadOutbox(): Promise<OutboxRecord[]> {
  return withOutboxLock(async () => {
    try {
      const content = await readFile(OUTBOX_PATH, "utf8");
      return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as OutboxRecord];
          } catch {
            console.warn("Orbit outbox contains an unreadable line; skipping it");
            return [];
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  });
}

async function writeOutbox(records: OutboxRecord[]) {
  await withOutboxLock(async () => {
    await mkdir(dirname(OUTBOX_PATH), { recursive: true });
    const content = records.map((record) => JSON.stringify(record)).join("\n");
    await writeFile(OUTBOX_PATH, content ? `${content}\n` : "", "utf8");
  });
}

async function sendJson(path: string, payload: unknown): Promise<{ success: true } | { success: false; errorMessage: string }> {
  if (!orbitSyncEnabled()) {
    return { success: false, errorMessage: "Missing Orbit configuration" };
  }

  const response = await fetch(`${orbitApiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": orbitApiKey
    },
    body: JSON.stringify(payload)
  }).catch((error: unknown) => ({
    ok: false,
    status: 0,
    text: async () => error instanceof Error ? error.message : String(error)
  }));

  if (!response.ok) {
    const body = await response.text();
    return {
      success: false,
      errorMessage: response.status ? `HTTP ${response.status}: ${body}` : body
    };
  }

  return { success: true };
}

export async function flushOutbox(maxItems = OUTBOX_FLUSH_BATCH_SIZE) {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = (async () => {
  if (!orbitSyncEnabled()) {
    return 0;
  }

  const records = await loadOutbox();
  if (!records.length) {
    return 0;
  }

  const remaining: OutboxRecord[] = [];
  let flushed = 0;

  for (const [index, record] of records.entries()) {
    if (index < maxItems) {
      const result = await sendJson(record.path, record.payload);
      if (result.success) {
        flushed += 1;
        continue;
      }

      remaining.push(
        createOutboxRecord(
          record.path,
          record.payload,
          result.errorMessage,
          Number(record.attempts || 0) + 1,
          record.id
        )
      );
      continue;
    }

    remaining.push(record);
  }

  await writeOutbox(remaining);
  return flushed;
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

function getOutboxRetryIntervalMs() {
  const configured = Number(process.env.KCS_ORBIT_OUTBOX_RETRY_INTERVAL_MS ?? DEFAULT_OUTBOX_RETRY_INTERVAL_MS);

  if (!Number.isFinite(configured) || configured < 1_000) {
    return DEFAULT_OUTBOX_RETRY_INTERVAL_MS;
  }

  return Math.floor(configured);
}

export function startOrbitOutboxWorker() {
  if (!orbitSyncEnabled()) {
    return () => undefined;
  }

  const runFlush = async () => {
    try {
      const flushed = await flushOutbox();
      if (flushed) {
        console.info(`Orbit outbox worker flushed ${flushed} pending event(s)`);
      }
    } catch (error) {
      console.warn("Orbit outbox worker failed", error);
    }
  };

  void runFlush();

  const interval = setInterval(() => {
    void runFlush();
  }, getOutboxRetryIntervalMs());

  interval.unref?.();

  return () => {
    clearInterval(interval);
  };
}

async function postJson(path: string, payload: unknown) {
  const flushed = await flushOutbox();
  if (flushed) {
    console.info(`Orbit outbox flushed ${flushed} pending event(s)`);
  }

  const result = await sendJson(path, payload);
  if (result.success) {
    return;
  }

  await appendOutbox(createOutboxRecord(path, payload, result.errorMessage));
  console.warn(`Orbit payment sync queued for retry: ${result.errorMessage}`);
}

export async function syncPaymentToOrbit(input: {
  payment: {
    id: string;
    transactionNumber: string;
    amount: number;
    reason: string;
    method: string;
    status: string;
    createdAt: Date;
    schoolId: string;
    parentId: string;
  };
  studentExternalIds: string[];
  localStudentIds: string[];
}) {
  if (!orbitSyncEnabled()) {
    return;
  }

  const primaryStudentExternalId = input.studentExternalIds[0];
  if (!primaryStudentExternalId) {
    console.warn("Orbit payment sync skipped: no student external mapping found", {
      paymentId: input.payment.id,
      localStudentIds: input.localStudentIds
    });
    return;
  }

  const contract = PaymentCreatedSchema.parse({
    organizationId: orbitOrganizationId,
    externalId: input.payment.transactionNumber,
    sourceApp: "EDUPAY",
    occurredAt: input.payment.createdAt.toISOString(),
    version: "1.0.0",
    payload: {
      studentExternalId: primaryStudentExternalId,
      amount: input.payment.amount,
      currency: "USD",
      motif: input.payment.reason,
      method: input.payment.method,
      reference: input.payment.transactionNumber,
      status: input.payment.status
    }
  });

  await postJson("/api/integration/ingest/edupay/payments", {
    ...contract,
    metadata: {
      schoolId: input.payment.schoolId,
      parentId: input.payment.parentId,
      localStudentIds: input.localStudentIds,
      studentExternalIds: input.studentExternalIds
    }
  });
}