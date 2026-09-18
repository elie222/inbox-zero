import { describe, expect, it } from "vitest";
import { MAIL_PROTOCOL_VERSION } from "../identities";
import { createBackendMailboxSource } from "./backend-adapter";

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
