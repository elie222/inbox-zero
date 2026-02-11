import crypto from "node:crypto";

export function verifyWhatsAppSignature(
  appSecret: string,
  body: string,
  signatureHeader: string | null | undefined,
): boolean {
  if (!signatureHeader) return false;

  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
