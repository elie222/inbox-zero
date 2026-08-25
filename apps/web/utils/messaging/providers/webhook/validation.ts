import { SafeError } from "@/utils/error";

export const WEBHOOK_SECRET_REQUIRES_HTTPS_MESSAGE =
  "Webhook secret can only be sent over HTTPS; use an https:// URL or remove the secret";

export function assertWebhookSecretUsesHttps({
  url,
  secret,
}: {
  url: string;
  secret: string | null | undefined;
}): void {
  if (!secret?.trim()) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  if (parsed.protocol !== "https:") {
    throw new SafeError(WEBHOOK_SECRET_REQUIRES_HTTPS_MESSAGE);
  }
}
