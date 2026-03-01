import crypto from "node:crypto";

const MAX_SLACK_REQUEST_AGE_SECONDS = 60 * 5;

export type SlackWebhookValidationResult =
  | { valid: true }
  | { valid: false; reason: "stale_timestamp" | "invalid_signature" };

export function validateSlackWebhookRequest({
  signingSecret,
  timestamp,
  body,
  signature,
}: {
  signingSecret: string;
  timestamp: string;
  body: string;
  signature: string;
}): SlackWebhookValidationResult {
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (
    Number.isNaN(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) >
      MAX_SLACK_REQUEST_AGE_SECONDS
  ) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const expectedSignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature ?? "");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return { valid: false, reason: "invalid_signature" };
  }

  if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true };
}
