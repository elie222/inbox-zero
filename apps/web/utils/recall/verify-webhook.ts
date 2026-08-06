import crypto from "node:crypto";
import { secureCompareBuffers } from "@/utils/crypto-compare";

// Recall delivers webhooks through Svix. Rather than pull in the Svix SDK we
// verify the signature by hand: it is a documented, stable HMAC scheme.
// https://docs.svix.com/receiving/verifying-payloads/how-manual

const TOLERANCE_SECONDS = 5 * 60;

type MissingHeader = "id" | "timestamp" | "signature";

type RecallWebhookVerification =
  | { verified: true }
  | {
      verified: false;
      reason: "missing_headers";
      missingHeaders: MissingHeader[];
    }
  | { verified: false; reason: "invalid_timestamp" }
  | {
      verified: false;
      reason: "timestamp_outside_tolerance";
      timestampSkewSeconds: number;
    }
  | { verified: false; reason: "signature_mismatch" };

export function verifyRecallWebhook({
  secret,
  headers,
  rawBody,
}: {
  secret: string;
  headers: Headers;
  rawBody: string;
}): RecallWebhookVerification {
  // Svix sends `svix-*`; the vendor-neutral standard-webhooks names are
  // `webhook-*`. The signature is computed identically either way, so accept
  // both rather than 401 on a delivery we could have verified.
  const id = getHeader(headers, "id");
  const timestamp = getHeader(headers, "timestamp");
  const signatureHeader = getHeader(headers, "signature");

  const missingHeaders: MissingHeader[] = [];
  if (!id) missingHeaders.push("id");
  if (!timestamp) missingHeaders.push("timestamp");
  if (!signatureHeader) missingHeaders.push("signature");
  if (!(id && timestamp && signatureHeader)) {
    return { verified: false, reason: "missing_headers", missingHeaders };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { verified: false, reason: "invalid_timestamp" };
  }

  const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skewSeconds > TOLERANCE_SECONDS) {
    return {
      verified: false,
      reason: "timestamp_outside_tolerance",
      timestampSkewSeconds: Math.round(skewSeconds),
    };
  }

  const key = getVerificationKey(secret);
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // The header holds space-separated `v1,<base64>` entries so a secret can be
  // rotated without dropping deliveries. Any match is enough.
  const verified = signatureHeader
    .split(" ")
    .some((entry) => matchesSignature(entry, expected));

  return verified
    ? { verified: true }
    : { verified: false, reason: "signature_mismatch" };
}

function matchesSignature(entry: string, expected: Buffer): boolean {
  const [version, signature] = entry.split(",");
  if (version !== "v1" || !signature) return false;

  return secureCompareBuffers(Buffer.from(signature, "base64"), expected);
}

function getHeader(headers: Headers, suffix: string): string | null {
  return headers.get(`svix-${suffix}`) ?? headers.get(`webhook-${suffix}`);
}

export function getRecallWebhookSecretFingerprint(secret: string): string {
  const fingerprint = crypto
    .createHash("sha256")
    .update(getVerificationKey(secret))
    .digest("hex")
    .slice(0, 12);

  return `sha256:${fingerprint}`;
}

function getVerificationKey(secret: string): Buffer {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}
