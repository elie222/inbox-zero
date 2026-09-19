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

  it("streams attachment-content bytes over GET", async () => {
    let path: string | undefined;
    let accept: string | undefined;
    const source = createBackendMailboxSource({
      accountId: "acc-1",
      request: async (input) => {
        path = input.path;
        accept = input.accept;
        return {
          status: 200,
          json: null,
          bytes: (async function* () {
            yield new Uint8Array([1, 2, 3]);
          })(),
          sizeBytes: 3,
        };
      },
    });
    const result = await source.readAttachment({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      key: { accountId: "acc-1", messageId: "m1" },
      attachmentId: "att-1",
    });
    expect(accept).toBe("bytes");
    expect(path).toContain("/attachment-content?");
    expect(path).toContain("messageId=m1");
    expect(path).toContain("attachmentId=att-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.value.bytes) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.value.sizeBytes).toBe(3);
  });

  it("does not retry a missing attachment", async () => {
    const source = createBackendMailboxSource({
      accountId: "acc-1",
      request: async () => ({
        status: 404,
        json: {
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId: "r1",
          error: { code: "not_found", retryable: false },
        },
      }),
    });
    await expect(
      source.readAttachment({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "r1",
        signal: new AbortController().signal,
        key: { accountId: "acc-1", messageId: "missing" },
        attachmentId: "att-1",
      }),
    ).resolves.toEqual({
      status: "paused",
      retryAfterMs: 0,
      reason: "unavailable",
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
