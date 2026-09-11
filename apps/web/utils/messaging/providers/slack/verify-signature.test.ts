import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateSlackWebhookRequest } from "./verify-signature";

describe("validateSlackWebhookRequest", () => {
  it("accepts a valid Slack signature", () => {
    const signingSecret = "slack-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "event_callback" });

    expect(
      validateSlackWebhookRequest({
        signingSecret,
        timestamp,
        body,
        signature: signSlackRequest({ signingSecret, timestamp, body }),
      }),
    ).toEqual({ valid: true });
  });

  it("rejects wrong-length signatures without throwing", () => {
    expect(
      validateSlackWebhookRequest({
        signingSecret: "slack-secret",
        timestamp: String(Math.floor(Date.now() / 1000)),
        body: JSON.stringify({ type: "event_callback" }),
        signature: "v0=short",
      }),
    ).toEqual({ valid: false, reason: "invalid_signature" });
  });
});

function signSlackRequest({
  signingSecret,
  timestamp,
  body,
}: {
  signingSecret: string;
  timestamp: string;
  body: string;
}) {
  return `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}
