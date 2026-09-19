import { describe, expect, it, vi } from "vitest";
import { createMailIpcClient } from "./mail-ipc-client";

describe("createMailIpcClient", () => {
  it("wraps an ok IPC result and rejects a failed method", async () => {
    const invoke = vi.fn(async (payload: unknown) => {
      const request = payload as { method: string; requestId: string };
      if (request.method === "getDiagnostics") {
        return { status: "ok", result: { accountId: "acc-1" } };
      }
      return { status: "invalid" };
    });
    const client = createMailIpcClient(invoke, {
      requestId: () => "req-1",
      pollMs: 60_000,
    });

    await expect(client.getDiagnostics("acc-1")).resolves.toEqual({
      accountId: "acc-1",
    });
    expect(invoke).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "req-1",
      method: "getDiagnostics",
      payload: { accountId: "acc-1" },
    });
    await expect(client.submitMetadata({} as never)).rejects.toThrow(
      "Mail engine submitMetadata failed",
    );
  });

  it("includes the mailbox provider on requestSync", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: { status: "scheduled" },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "sync-1",
      provider: "microsoft",
    });
    await expect(client.requestSync(["acc-1"])).resolves.toEqual({
      status: "scheduled",
    });
    expect(invoke).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "sync-1",
      method: "requestSync",
      payload: { accountIds: ["acc-1"], provider: "microsoft" },
    });
  });

  it("polls observeMailbox until close", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: {
        status: "ready",
        revision: { databaseEpoch: "e1", sequence: 1 },
        data: { conversations: [] },
        refreshing: false,
        error: null,
      },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "obs-1",
      pollMs: 20,
    });
    const handle = client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => {
      expect(handle.getSnapshot().status).toBe("ready");
    });
    handle.close();
    const calls = invoke.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke.mock.calls.length).toBe(calls);
  });

  it("stops mailbox polls when the client closes", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: {
        status: "ready",
        revision: { databaseEpoch: "e1", sequence: 1 },
        data: { conversations: [] },
        refreshing: false,
        error: null,
      },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "obs-close",
      pollMs: 20,
    });
    client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    await client.close?.();
    const calls = invoke.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke.mock.calls.length).toBe(calls);
  });
});
