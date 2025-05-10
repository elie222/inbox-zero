import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import type { ExecutedRule } from "@prisma/client";

const logger = createScopedLogger("webhook");

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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { webhookSecret: true },
  });
  if (!user) throw new Error("User not found");

  try {
    await Promise.race([
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": user.webhookSecret || "",
        },
        body: JSON.stringify(payload),
      }),
      sleep(1000),
    ]);

    logger.info("Webhook called", { url });
  } catch (error) {
    logger.error("Webhook call failed", { error, url });
    // Don't throw the error since we want to continue execution
    logger.info("Continuing after webhook timeout/error");
  }
};
