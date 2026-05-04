import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/utils/audit/delivery";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: {
    AXIOM_AUDIT_DATASET: undefined as string | undefined,
    AXIOM_AUDIT_TOKEN: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

import {
  __testing__,
  flushAuditEvents,
  recordAuditEvent,
} from "@/utils/audit/delivery";

describe("audit delivery", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __testing__.resetAuditDelivery();
    mockedEnv.AXIOM_AUDIT_DATASET = undefined;
    mockedEnv.AXIOM_AUDIT_TOKEN = undefined;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts batched audit events to the dedicated Axiom dataset", async () => {
    mockedEnv.AXIOM_AUDIT_DATASET = "audit-dataset";
    mockedEnv.AXIOM_AUDIT_TOKEN = "audit-token";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ failed: 0, ingested: 1 }), {
        status: 200,
      }),
    );

    const event = createAuditEvent();
    recordAuditEvent(event);
    await flushAuditEvents();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.axiom.co/v1/datasets/audit-dataset/ingest?timestamp-field=_time",
      expect.objectContaining({
        body: JSON.stringify([event]),
        headers: {
          Authorization: "Bearer audit-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    expect(__testing__.getPendingAuditEventCount()).toBe(0);
  });

  it("skips delivery when audit config is missing", async () => {
    recordAuditEvent(createAuditEvent());
    await flushAuditEvents();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(__testing__.getPendingAuditEventCount()).toBe(0);
  });

  it("keeps failed deliveries queued for a later flush", async () => {
    mockedEnv.AXIOM_AUDIT_DATASET = "audit-dataset";
    mockedEnv.AXIOM_AUDIT_TOKEN = "audit-token";
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ failed: 0, ingested: 1 }), {
          status: 200,
        }),
      );

    const event = createAuditEvent();
    recordAuditEvent(event);
    await flushAuditEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__testing__.getPendingAuditEventCount()).toBe(1);

    await flushAuditEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(__testing__.getPendingAuditEventCount()).toBe(0);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.axiom.co/v1/datasets/audit-dataset/ingest?timestamp-field=_time",
      expect.objectContaining({
        body: JSON.stringify([event]),
      }),
    );
  });
});

function createAuditEvent(): AuditEvent {
  return {
    _time: "2026-05-03T00:00:00.000Z",
    actor_type: "user",
    api_key_id: null,
    duration_ms: 12,
    email_account_id: "email-account-1",
    env: "test",
    event_type: "db_access",
    model: "User",
    op_class: "read",
    operation: "findMany",
    region: null,
    request_id: "request-1",
    result_count: 1,
    source: "user/rules",
    status: "success",
    user_id: "user-1",
  };
}
