import { describe, expect, it, vi } from "vitest";
import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/protocol/mail-http";
import { unsupportedVersionResponse } from "./authorization";

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
