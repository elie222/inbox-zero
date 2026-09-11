import prisma from "@/utils/prisma";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { canonicalizeEmailAddress, extractEmailAddresses } from "@/utils/email";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import type { EmailProvider } from "@/utils/email/types";
import { isRuleGeneratedMessage } from "@/utils/ai/rule-generated-message";

/**
 * Writing to someone means they are not a cold emailer, so drop the learned
 * cold email pattern that says otherwise.
 *
 * A learned pattern short-circuits rule matching before the AI ever runs (see
 * `isColdEmail`), so a sender left pinned never gets a reply draft again,
 * however often the two of you write.
 *
 * This clears the pattern only. The thread the user replied to keeps whatever
 * label or folder the blocker already gave it; the "Not a cold email" button
 * remains the way to undo that.
 */
export async function excludeRepliedSendersFromColdEmail({
  emailAccountId,
  message,
  provider,
  logger,
}: {
  emailAccountId: string;
  message: Pick<ParsedMessage, "id" | "threadId" | "headers">;
  provider: Pick<EmailProvider, "getMessageByRfc822MessageId">;
  logger: Logger;
}) {
  if (
    await isRuleGeneratedMessage({
      emailAccountId,
      threadId: message.threadId,
      messageId: message.id,
    })
  ) {
    logger.info("Keeping cold email pattern for rule-generated message");
    return;
  }

  const recipients = [
    ...new Set(
      [message.headers.to, message.headers.cc ?? "", message.headers.bcc ?? ""]
        .flatMap((header) => extractEmailAddresses(header))
        .map((email) => email.toLowerCase()),
    ),
  ];
  const inReplyTo = message.headers["in-reply-to"]?.trim() ?? "";

  if (!recipients.length && !inReplyTo) return;

  const coldEmailRule = await getColdEmailRule(emailAccountId);
  const groupId = coldEmailRule?.groupId;
  if (!groupId) return;

  const sourceAddress = inReplyTo
    ? canonicalizeEmailAddress(
        (await provider.getMessageByRfc822MessageId(inReplyTo))?.headers.from ??
          "",
      )
    : "";
  const senderAddresses = [
    ...new Set([...recipients, sourceAddress].filter(Boolean)),
  ];

  if (!senderAddresses.length) return;

  // Matched case-insensitively because senders are pinned using the casing of
  // whichever From header arrived first.
  const candidates = await prisma.groupItem.findMany({
    where: {
      groupId,
      type: GroupItemType.FROM,
      exclude: false,
      OR: senderAddresses.map((value) => ({
        value: { equals: value, mode: "insensitive" as const },
      })),
    },
    select: { value: true },
  });

  if (!candidates.length) return;

  for (const { value } of candidates) {
    // Written through saveLearnedPattern so exclusion keeps one owner, and keyed
    // on the stored value so it claims the existing row rather than adding one.
    await saveLearnedPattern({
      emailAccountId,
      from: value,
      ruleId: coldEmailRule.id,
      exclude: true,
      source: GroupItemSource.USER,
      reason: "Excluded automatically: you replied to this sender",
      logger,
    });
  }

  logger.info("Excluded replied sender from cold email blocker", {
    count: candidates.length,
  });
}
