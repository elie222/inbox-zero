import { request as httpsRequest } from "node:https";
import { resolveSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import { assertDigestWebhookUrl } from "@/utils/messaging/providers/webhook/validation";
import { allowPrivateIps } from "@/utils/webhook-validation";

const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;

type DigestWebhookItem = {
  from: string;
  subject: string;
  content: string;
};

export type DigestWebhookPayload = {
  type: "digest";
  date: string;
  ruleNames: Record<string, string>;
  itemsByRule: Record<string, DigestWebhookItem[] | undefined>;
};

// Pin the connection to validated DNS addresses so a second lookup cannot
// redirect delivery to a private address. Internal targets require operator opt-in.
export async function sendDigestToWebhook({
  url,
  secret,
  payload,
}: {
  url: string;
  secret: string | null;
  payload: DigestWebhookPayload;
}): Promise<void> {
  assertDigestWebhookUrl(url);
  const resolvedUrl = await resolveSafeExternalHttpUrl(url, {
    allowPrivateIps: allowPrivateIps(),
  });
  if (!resolvedUrl) {
    throw new Error("Webhook URL blocked by SSRF protection");
  }

  const requestBody = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(requestBody).toString(),
  };
  const trimmedSecret = secret?.trim();
  if (trimmedSecret) headers["X-Webhook-Secret"] = trimmedSecret;

  const statusCode = await new Promise<number>((resolve, reject) => {
    const request = httpsRequest(
      resolvedUrl.url,
      {
        method: "POST",
        lookup: resolvedUrl.lookup,
        headers,
      },
      (response) => {
        response.resume();
        response.on("error", reject);
        response.on("end", () => resolve(response.statusCode || 0));
      },
    );

    request.setTimeout(WEBHOOK_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Webhook request timed out"));
    });

    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Webhook responded with status ${statusCode}`);
  }
}
