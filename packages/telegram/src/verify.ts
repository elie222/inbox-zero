export function verifyTelegramWebhookToken(
  expectedToken: string,
  tokenHeader: string | null | undefined,
): boolean {
  if (!tokenHeader) return false;
  return tokenHeader === expectedToken;
}
