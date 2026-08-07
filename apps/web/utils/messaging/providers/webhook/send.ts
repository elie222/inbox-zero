import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolveSafeExternalHttpUrl } from "@/utils/network/safe-http-url";

const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;

export type DigestWebhookItem = {
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

/**
 * POST a digest payload to a user-configured webhook URL.
 *
 * SSRF-safe: the URL is validated and DNS-resolved to public addresses via
 * {@link resolveSafeExternalHttpUrl}, and the request is pinned to those
 * addresses (mirroring `utils/webhook.ts`). Unlike the rule webhook, this
 * THROWS on a blocked or non-2xx response so the caller's `Promise.allSettled`
 * counts it as a failed delivery channel.
 */
export async function sendDigestToWebhook({
  url,
  secret,
  payload,
}: {
  url: string;
  secret: string | null;
  payload: DigestWebhookPayload;
}): Promise<void> {
  const resolvedUrl = await resolveSafeExternalHttpUrl(url);
  if (!resolvedUrl) {
    throw new Error("Webhook URL blocked by SSRF protection");
  }

  // Never transmit the shared webhook secret over plaintext HTTP: a network
  // observer could capture `X-Webhook-Secret` and forge authenticated requests.
  // Plain HTTP is still allowed when no secret is configured.
  if (secret && resolvedUrl.url.protocol !== "https:") {
    throw new Error(
      "Webhook secret can only be sent over HTTPS; use an https:// URL or remove the secret",
    );
  }

  const requestBody = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(requestBody).toString(),
  };
  if (secret) headers["X-Webhook-Secret"] = secret;

  const statusCode = await new Promise<number>((resolve, reject) => {
    const request = (
      resolvedUrl.url.protocol === "https:" ? httpsRequest : httpRequest
    )(
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
