import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import type { ExecutedRule } from "@/generated/prisma/client";
import { resolveSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import { validateWebhookUrl } from "@/utils/webhook-validation";

const logger = createScopedLogger("webhook");
const WEBHOOK_REQUEST_TIMEOUT_MS = 1000;

type WebhookPayload = {
  email: {
    threadId: string;
    messageId: string;
    subject: string;
    from: string;
    cc?: string;
    bcc?: string;
    headerMessageId: string;
  };
  executedRule: Pick<
    ExecutedRule,
    "id" | "ruleId" | "reason" | "automated" | "createdAt"
  >;
};

export const callWebhook = async (
  userId: string,
  url: string,
  payload: WebhookPayload,
) => {
  if (!url) throw new Error("Webhook URL is required");

  // Validate URL to prevent SSRF attacks
  const validation = await validateWebhookUrl(url);
  if (!validation.valid) {
    logger.warn("Webhook URL validation failed", {
      url,
      error: validation.error,
    });
    throw new SafeError(`Invalid webhook URL: ${validation.error}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { webhookSecret: true },
  });
  if (!user) throw new Error("User not found");

  const requestBody = JSON.stringify(payload);

  try {
    const response = await sendWebhookRequest({
      url,
      requestBody,
      webhookSecret: user.webhookSecret || "",
    });

    if (response.blocked) {
      logger.warn("Webhook request blocked after DNS revalidation", { url });
      return;
    }

    if (response.ok) {
      logger.info("Webhook called", { url, statusCode: response.statusCode });
      return;
    }

    logger.warn("Webhook call rejected", {
      url,
      statusCode: response.statusCode,
    });
  } catch (error) {
    logger.error("Webhook call failed", { error, url });
    // Don't throw the error since we want to continue execution
    logger.info("Continuing after webhook timeout/error");
  }
};

async function sendWebhookRequest({
  url,
  requestBody,
  webhookSecret,
}: {
  url: string;
  requestBody: string;
  webhookSecret: string;
}) {
  const resolvedUrl = await resolveSafeExternalHttpUrl(url);
  if (!resolvedUrl) {
    return { blocked: true, ok: false, statusCode: 0 };
  }

  return new Promise<{
    blocked: boolean;
    ok: boolean;
    statusCode: number;
  }>((resolve, reject) => {
    const request = (
      resolvedUrl.url.protocol === "https:" ? httpsRequest : httpRequest
    )(
      resolvedUrl.url,
      {
        method: "POST",
        lookup: resolvedUrl.lookup,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody).toString(),
          "X-Webhook-Secret": webhookSecret,
        },
      },
      (response) => {
        response.resume();
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            blocked: false,
            ok: isSuccessfulStatusCode(response.statusCode || 0),
            statusCode: response.statusCode || 0,
          }),
        );
      },
    );

    request.setTimeout(WEBHOOK_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Webhook request timed out"));
    });

    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

function isSuccessfulStatusCode(statusCode: number) {
  return statusCode >= 200 && statusCode < 300;
}
