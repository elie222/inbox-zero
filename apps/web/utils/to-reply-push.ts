import { SystemType } from "@/generated/prisma/enums";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { extractNameFromEmail } from "@/utils/email";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import type { Logger } from "@/utils/logger";
import { sendMobilePushNotification } from "@/utils/mobile-push";
import { truncate } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";

const TO_REPLY_MAX_AGE_MS = 15 * 60 * 1000;

export async function sendToReplyPushNotification({
  emailAccountId,
  userId,
  message,
  results,
  logger,
  now = new Date(),
}: {
  emailAccountId: string;
  userId: string;
  message: ParsedMessage;
  results: RunRulesResult[];
  logger: Logger;
  now?: Date;
}) {
  const receivedAt = getMessageTimestamp(message);
  if (
    !message.threadId ||
    receivedAt <= 0 ||
    receivedAt < now.getTime() - TO_REPLY_MAX_AGE_MS ||
    receivedAt > now.getTime() ||
    !results.some(
      (result) =>
        !result.existing && result.rule?.systemType === SystemType.TO_REPLY,
    )
  )
    return;

  try {
    await sendMobilePushNotification({
      userId,
      deduplicationKey: `to-reply:${emailAccountId}:${message.id}`,
      notification: {
        title: truncate(extractNameFromEmail(message.headers.from), 100),
        body: truncate(message.subject.trim() || "(no subject)", 200),
        sound: "default",
        data: {
          threadId: message.threadId,
          emailAccountId,
          messageId: message.id,
          type: "to_reply",
        },
      },
      logger,
    });
  } catch (error) {
    logger.warn("To Reply push notification processing failed", { error });
  }
}
