import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRecallWebhook } from "@/utils/recall/verify-webhook";

const SECRET = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
const NOW = new Date("2026-05-04T09:00:00.000Z");
const RAW_BODY = JSON.stringify({ event: "bot.done" });

describe("verifyRecallWebhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a correctly signed payload", () => {
    expect(
      verifyRecallWebhook({
        secret: SECRET,
        headers: signedHeaders(),
        rawBody: RAW_BODY,
      }),
    ).toBe(true);
  });

  it("accepts a payload when one of several signatures matches", () => {
    const headers = signedHeaders();
    headers.set(
      "svix-signature",
      `v1,${Buffer.from("wrong-signature-of-same-length-000").toString(
        "base64",
      )} ${headers.get("svix-signature")}`,
    );

    expect(
      verifyRecallWebhook({ secret: SECRET, headers, rawBody: RAW_BODY }),
    ).toBe(true);
  });

  it("rejects a payload whose body was modified after signing", () => {
    expect(
      verifyRecallWebhook({
        secret: SECRET,
        headers: signedHeaders(),
        rawBody: `${RAW_BODY} `,
      }),
    ).toBe(false);
  });

  it("rejects a replayed payload outside the timestamp tolerance", () => {
    const headers = signedHeaders({
      timestamp: Math.floor(NOW.getTime() / 1000) - 6 * 60,
    });

    expect(
      verifyRecallWebhook({ secret: SECRET, headers, rawBody: RAW_BODY }),
    ).toBe(false);
  });

  it("rejects a payload signed with a different secret", () => {
    const headers = signedHeaders({
      secret: `whsec_${Buffer.from("other-secret").toString("base64")}`,
    });

    expect(
      verifyRecallWebhook({ secret: SECRET, headers, rawBody: RAW_BODY }),
    ).toBe(false);
  });

  it("rejects a payload with missing Svix headers", () => {
    const headers = signedHeaders();
    headers.delete("svix-id");

    expect(
      verifyRecallWebhook({ secret: SECRET, headers, rawBody: RAW_BODY }),
    ).toBe(false);
  });
});

function signedHeaders({
  secret = SECRET,
  timestamp = Math.floor(NOW.getTime() / 1000),
  id = "msg_123",
  rawBody = RAW_BODY,
}: {
  secret?: string;
  timestamp?: number;
  id?: string;
  rawBody?: string;
} = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`,
  });
}
