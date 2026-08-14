import prisma from "@/utils/prisma";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { canonicalizeEmailAddress, extractEmailAddresses } from "@/utils/email";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import type { EmailProvider } from "@/utils/email/types";
import { isAutomatedOutboundMessage } from "@/utils/email/automated-outbound";

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
  message: Pick<ParsedMessage, "headers" | "threadId">;
  provider: Pick<EmailProvider, "getMessageByRfc822MessageId">;
  logger: Logger;
}) {
  if (isAutomatedOutboundMessage(message)) {
    logger.info("Keeping cold email pattern for automated outbound message");
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

  // Matched case-insensitively because senders are pinned using the casing of
  // whichever From header arrived first.
  const candidates = await prisma.groupItem.findMany({
    where: {
      groupId,
      type: GroupItemType.FROM,
      exclude: false,
      OR: [
        ...recipients.map((value) => ({
          value: { equals: value, mode: "insensitive" as const },
        })),
        ...(inReplyTo ? [{ threadId: message.threadId }] : []),
      ],
    },
    select: { value: true },
  });

  if (!candidates.length) return;

  const recipientSet = new Set(recipients);
  const directMatches = candidates.filter(({ value }) =>
    recipientSet.has(value.toLowerCase()),
  );
  const threadCandidates = candidates.filter(
    ({ value }) => !recipientSet.has(value.toLowerCase()),
  );

  let sourceMatches: typeof candidates = [];
  if (inReplyTo && threadCandidates.length) {
    const sourceMessage = await provider.getMessageByRfc822MessageId(inReplyTo);
    const sourceAddress = canonicalizeEmailAddress(
      sourceMessage?.headers.from ?? "",
    );
    sourceMatches = threadCandidates.filter(
      ({ value }) => value.toLowerCase() === sourceAddress,
    );
  }

  const pinned = [...directMatches, ...sourceMatches];
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
