import crypto from "node:crypto";
import { secureCompareBuffers } from "@/utils/crypto-compare";

// Recall delivers webhooks through Svix. Rather than pull in the Svix SDK we
// verify the signature by hand: it is a documented, stable HMAC scheme.
// https://docs.svix.com/receiving/verifying-payloads/how-manual

const TOLERANCE_SECONDS = 5 * 60;

export function verifyRecallWebhook({
  secret,
  headers,
  rawBody,
}: {
  secret: string;
  headers: Headers;
  rawBody: string;
}): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");

  if (!(id && timestamp && signatureHeader)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skewSeconds > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // The header holds space-separated `v1,<base64>` entries so a secret can be
  // rotated without dropping deliveries. Any match is enough.
  return signatureHeader
    .split(" ")
    .some((entry) => matchesSignature(entry, expected));
}

function matchesSignature(entry: string, expected: Buffer): boolean {
  const [version, signature] = entry.split(",");
  if (version !== "v1" || !signature) return false;

  return secureCompareBuffers(Buffer.from(signature, "base64"), expected);
}
