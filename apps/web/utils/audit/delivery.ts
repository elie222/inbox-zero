import { env } from "@/env";

export type AuditEvent = {
  _time: string;
  event_type: "db_access";
  model: string;
  operation: string;
  op_class: "read" | "write" | "other";
  status: "success" | "error";
  duration_ms: number;
  result_count: number | null;
  actor_type: string | null;
  user_id: string | null;
  email_account_id: string | null;
  api_key_id: string | null;
  source: string | null;
  request_id: string | null;
  env: string;
  region: string | null;
  error_name?: string;
};

const MAX_BATCH_SIZE = 100;
const MAX_PENDING_EVENTS = 10_000;
const AXIOM_INGEST_API_URL = "https://api.axiom.co";

let pendingEvents: AuditEvent[] = [];
let flushPromise: Promise<void> | undefined;

export function recordAuditEvent(event: AuditEvent) {
  if (!isAuditLoggingEnabled()) return;

  if (pendingEvents.length >= MAX_PENDING_EVENTS) {
    pendingEvents.shift();
  }
  pendingEvents.push(event);

  if (pendingEvents.length >= MAX_BATCH_SIZE) {
    flushAuditEvents().catch(() => {});
  }
}

export function isAuditLoggingEnabled() {
  return Boolean(env.AXIOM_AUDIT_DATASET && env.AXIOM_AUDIT_TOKEN);
}

export async function flushAuditEvents() {
  if (flushPromise) {
    await flushPromise;
    return;
  }

  flushPromise = flushPendingAuditEvents();

  try {
    await flushPromise;
  } finally {
    flushPromise = undefined;
  }
}

export const __testing__ = {
  getPendingAuditEventCount,
  resetAuditDelivery,
};

async function flushPendingAuditEvents(): Promise<void> {
  while (pendingEvents.length > 0) {
    const batch = pendingEvents.splice(0, MAX_BATCH_SIZE);
    await deliverAuditBatch(batch);
  }
}

async function deliverAuditBatch(events: AuditEvent[]) {
  const config = getAxiomAuditConfig();
  if (!config) return;

  try {
    const response = await fetch(getAxiomIngestUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      return;
    }

    const result = (await response.json().catch(() => null)) as {
      failed?: number;
    } | null;
    if (result?.failed) return;
  } catch {
    return;
  }
}

function getAxiomAuditConfig() {
  if (!isAuditLoggingEnabled()) return null;

  return {
    dataset: env.AXIOM_AUDIT_DATASET!,
    token: env.AXIOM_AUDIT_TOKEN!,
  };
}

function getAxiomIngestUrl(config: { dataset: string; token: string }) {
  const url = new URL(
    `/v1/datasets/${encodeURIComponent(config.dataset)}/ingest`,
    `${AXIOM_INGEST_API_URL}/`,
  );
  url.searchParams.set("timestamp-field", "_time");
  return url.toString();
}

function getPendingAuditEventCount() {
  return pendingEvents.length;
}

function resetAuditDelivery() {
  pendingEvents = [];
  flushPromise = undefined;
}
