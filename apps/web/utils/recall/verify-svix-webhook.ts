import { createScopedLogger } from "@/utils/logger";
import crypto from "node:crypto";

const logger = createScopedLogger("recall/verify-svix-webhook");

// Svix webhook verification
// Partial reimplementation of the Svix library's webhook verification
//
// Svix's webhook validation steps:
// 1. Extract svix-id, svix-timestamp, and svix-signature headers
// 2. Create signed content: svix-id.svix-timestamp.payload
// 3. Decode the webhook secret (remove 'whsec_' prefix, base64 decode)
// 4. Compute HMAC SHA-256 signature of the signed content
// 5. Compare signatures using constant-time comparison
// 6. Validate timestamp to prevent replay attacks (5 minute tolerance)
export function verifySvixWebhook(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  try {
    const timestamp = Number.parseInt(svixTimestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - timestamp);

    if (timeDiff > 300) {
      logger.warn("Webhook timestamp too old", {
        timestamp,
        currentTime,
        timeDiff,
      });
      return false;
    }

    const secretBase64 = secret.replace("whsec_", "");
    const secretBuffer = Buffer.from(secretBase64, "base64");

    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const hmac = crypto.createHmac("sha256", secretBuffer);
    hmac.update(signedContent);
    const computedSignature = hmac.digest("base64");

    const computedBuffer = Buffer.from(computedSignature, "base64");
    const receivedBuffer = Buffer.from(svixSignature, "base64");

    if (computedBuffer.length !== receivedBuffer.length) {
      logger.warn("Signature length mismatch", {
        computedLength: computedBuffer.length,
        receivedLength: receivedBuffer.length,
      });
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, receivedBuffer);
  } catch (error) {
    logger.error("Error verifying Svix webhook signature", { error });
    return false;
  }
}
