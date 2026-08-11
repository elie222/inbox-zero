import prisma from "@/utils/prisma";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { extractEmailAddresses } from "@/utils/email";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";

const SENDING_ACTION_TYPES = [
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
];

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
  logger,
}: {
  emailAccountId: string;
  message: Pick<ParsedMessage, "headers" | "threadId">;
  logger: Logger;
}) {
  const recipients = [
    ...new Set(
      [message.headers.to, message.headers.cc ?? "", message.headers.bcc ?? ""]
        .flatMap((header) => extractEmailAddresses(header))
        .map((email) => email.toLowerCase()),
    ),
  ];

  if (!recipients.length) return;

  const coldEmailRule = await getColdEmailRule(emailAccountId);
  const groupId = coldEmailRule?.groupId;
  if (!groupId) return;

  // A reply a rule sent on the user's behalf is not the user vouching for the
  // sender. Un-blocking is permanent and hard to notice, so a thread the product
  // has sent on keeps its pattern.
  const sentByRuleOnThread = await prisma.executedRule.count({
    where: {
      emailAccountId,
      threadId: message.threadId,
      actionItems: { some: { type: { in: SENDING_ACTION_TYPES } } },
    },
  });

  if (sentByRuleOnThread) {
    logger.info("Keeping cold email pattern: a rule sent on this thread");
    return;
  }

  // Matched case-insensitively because senders are pinned using the casing of
  // whichever From header arrived first.
  const pinned = await prisma.groupItem.findMany({
    where: {
      groupId,
      type: GroupItemType.FROM,
      exclude: false,
      OR: recipients.map((value) => ({
        value: { equals: value, mode: "insensitive" as const },
      })),
    },
    select: { value: true },
  });

  if (!pinned.length) return;

  for (const { value } of pinned) {
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
    count: pinned.length,
  });
}
