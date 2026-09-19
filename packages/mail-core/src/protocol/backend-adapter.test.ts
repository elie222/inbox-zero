import { describe, expect, it } from "vitest";
import { MAIL_PROTOCOL_VERSION } from "../identities";
import {
  createBackendMailboxSource,
  createBackendOperationExecutor,
} from "./backend-adapter";

describe("backend mailbox source", () => {
  it("maps reset_required JSON without requiring the error envelope", async () => {
    const source = createBackendMailboxSource({
      accountId: "acc-1",
      request: async () => ({
        status: 409,
        json: { status: "reset_required", scopeId: "primary" },
      }),
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "stale",
      },
      pageSize: 50,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "reset_required",
      scopeId: "primary",
    });
  });

  it("sends the protocol version on bootstrap", async () => {
    let body: unknown;
    const source = createBackendMailboxSource({
      accountId: "acc-1",
      request: async (input) => {
        body = input.body;
        return {
          status: 200,
          json: {
            protocolVersion: MAIL_PROTOCOL_VERSION,
            requestId: "r1",
            bootstrapId: "boot",
            enumerationToken: "{}",
            catchUpFrom: null,
          },
        };
      },
    });
    const result = await source.beginBootstrap({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      scope: { id: "primary", kind: "account", folderId: null },
      afterMs: null,
    });
    expect(result.status).toBe("ok");
    expect(body).toMatchObject({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId: "r1",
    });
  });
});

describe("backend operation executor", () => {
  it("inspects over POST so Chromium can send the operation body", async () => {
    let method: string | undefined;
    let body: unknown;
    const executor = createBackendOperationExecutor({
      accountId: "acc-1",
      request: async (input) => {
        method = input.method;
        body = input.body;
        return {
          status: 200,
          json: {
            status: "uncertain",
            protocolVersion: MAIL_PROTOCOL_VERSION,
            requestId: "inspect-op-1",
            receiptId: null,
          },
        };
      },
    });
    const result = await executor.inspect({
      operation: {
        key: { accountId: "acc-1", operationId: "op-1" },
        session: { accountId: "acc-1", generation: "g1" },
        authority: "backend",
        payloadHash: "hash",
        intent: {
          kind: "metadata",
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "archive" },
        },
      },
      receiptId: "receipt-1",
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "uncertain",
      receiptId: null,
    });
    expect(method).toBe("POST");
    expect(body).toMatchObject({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId: "inspect-op-1",
      receiptId: "receipt-1",
    });
  });
});
