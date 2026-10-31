import { describe, expect, it, vi } from "vitest";
import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/protocol/mail-http";
import {
  bodyAccountMismatchResponse,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "./authorization";

vi.mock("server-only", () => ({}));

describe("unsupportedVersionResponse", () => {
  it("allows the current protocol version and a missing version", () => {
    expect(
      unsupportedVersionResponse("req-1", MAIL_PROTOCOL_VERSION),
    ).toBeNull();
    expect(unsupportedVersionResponse("req-1", undefined)).toBeNull();
  });

  it("rejects an older protocol version", async () => {
    const response = unsupportedVersionResponse("req-1", 0);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId: "req-1",
      error: { code: "unsupported_version", retryable: false },
    });
  });
});

describe("protocolVersionFromRequest", () => {
  it("allows a missing query version and parses the current version", () => {
    expect(
      protocolVersionFromRequest({
        nextUrl: new URL("http://localhost/attachment-content"),
      }),
    ).toBeUndefined();
    expect(
      protocolVersionFromRequest({
        nextUrl: new URL(
          `http://localhost/attachment-content?protocolVersion=${MAIL_PROTOCOL_VERSION}`,
        ),
      }),
    ).toBe(MAIL_PROTOCOL_VERSION);
  });

  it("keeps an older numeric version so unsupportedVersionResponse can reject it", () => {
    expect(
      protocolVersionFromRequest({
        nextUrl: new URL(
          "http://localhost/attachment-content?protocolVersion=0",
        ),
      }),
    ).toBe(0);
  });
});

describe("bodyAccountMismatchResponse", () => {
  it("allows matching nested account ids", () => {
    const response = bodyAccountMismatchResponse(
      "acc-1",
      {
        session: { accountId: "acc-1", generation: "g1" },
        operation: {
          key: { accountId: "acc-1", operationId: "op-1" },
          intent: {
            targets: [{ accountId: "acc-1", messageId: "m1" }],
          },
        },
      },
      "req-1",
    );
    expect(response).toBeNull();
  });

  it("rejects mismatched nested account ids", async () => {
    const response = bodyAccountMismatchResponse(
      "acc-1",
      {
        session: { accountId: "acc-1", generation: "g1" },
        operation: {
          key: { accountId: "acc-2", operationId: "op-1" },
          intent: {
            targets: [{ accountId: "acc-1", messageId: "m1" }],
          },
        },
      },
      "req-1",
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      requestId: "req-1",
      error: { code: "forbidden", retryable: false },
    });
  });
});
