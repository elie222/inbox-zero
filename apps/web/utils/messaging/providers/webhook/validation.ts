import { SafeError } from "@/utils/error";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import { allowPrivateIps } from "@/utils/webhook-validation";

export function assertDigestWebhookUrl(url: string): void {
  if (!isSafeExternalHttpUrl(url, { allowPrivateIps: allowPrivateIps() })) {
    throw new SafeError("Webhook URL must be an allowed HTTPS endpoint");
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new SafeError(
      "Digest webhooks require HTTPS to protect email contents",
    );
  }
  if (parsed.username || parsed.password) {
    throw new SafeError(
      "Use the webhook secret field instead of URL credentials",
    );
  }
}
