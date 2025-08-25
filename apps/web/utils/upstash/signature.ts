import crypto from "node:crypto";
import { env } from "@/env";

function base64UrlEncode(input: Buffer | string) {
  const buff = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buff
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Creates a signature header for the Upstash request
 * https://docs.upstash.com/qstash/security/signing-requests
 *
 */
export function createUpstashSignature({
  endpointUrl,
  requestBody,
  signingKey,
}: {
  endpointUrl: string;
  requestBody: unknown;
  signingKey: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const bodyString = JSON.stringify(requestBody ?? {});
  const bodyHash = crypto.createHash("sha256").update(bodyString).digest();

  const payload = {
    iss: "Upstash",
    sub: endpointUrl,
    exp: now + 5 * 60,
    nbf: now - 5,
    iat: now,
    jti: `jwt_${crypto.randomBytes(12).toString("hex")}`,
    body: base64UrlEncode(bodyHash),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function buildUpstashRequestHeaders({
  baseHeaders,
  endpointUrl,
  requestBody,
}: {
  baseHeaders?: HeadersInit | IterableIterator<[string, string]>;
  endpointUrl: string;
  requestBody: unknown;
}): HeadersInit {
  const normalizedHeaders =
    baseHeaders && Symbol.iterator in baseHeaders
      ? Array.from(baseHeaders as IterableIterator<[string, string]>)
      : baseHeaders;

  const headers = new Headers(normalizedHeaders);
  headers.set("Content-Type", "application/json");

  const signingKey = env.QSTASH_NEXT_SIGNING_KEY;
  if (signingKey) {
    const signature = createUpstashSignature({
      endpointUrl,
      requestBody,
      signingKey,
    });
    headers.set("Upstash-Signature", signature);
  }

  return headers;
}
