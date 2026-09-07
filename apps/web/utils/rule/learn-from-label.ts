import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";

export async function isLearnFromLabelsEnabled(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { learnFromLabels: true },
  });
  return !!emailAccount?.learnFromLabels;
}

/**
 * The user moved an email to a label themselves. Remember the sender so the
 * next email from them gets the same label without an AI call.
 *
 * When no rule applies this label yet, one is created from the label: it
 * labels, and also archives when the user moved the email out of the inbox
 * rather than only tagging it.
 */
export async function learnSenderFromLabel({
  emailAccountId,
  labelId,
  sender,
  messageId,
  threadId,
  ruleId,
  provider,
  logger,
}: {
  emailAccountId: string;
  labelId: string;
  sender: string;
  messageId: string;
  threadId: string;
  ruleId: string | null | undefined;
  provider: EmailProvider;
  logger: Logger;
}) {
  const targetRuleId =
    ruleId ??
    (await createRuleForLabel({
      emailAccountId,
      labelId,
      messageId,
      provider,
      logger,
    }));

  if (!targetRuleId) return;

  logger.info("Learning sender from user-applied label", {
    labelId,
    ruleId: targetRuleId,
  });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId: targetRuleId,
    exclude: false,
    logger,
    messageId,
    threadId,
    reason: "Moved to label by user",
    source: GroupItemSource.LABEL_ADDED,
  });
}

/**
 * The user took the label off again (e.g. moved the email back to the inbox).
 * Flip the sender to an exclusion so the rule stops matching them.
 */
export async function unlearnSenderFromLabel({
  emailAccountId,
  labelId,
  sender,
  messageId,
  threadId,
  ruleId,
  logger,
}: {
  emailAccountId: string;
  labelId: string;
  sender: string;
  messageId: string;
  threadId: string;
  ruleId: string;
  logger: Logger;
}) {
  logger.info("Unlearning sender from user-removed label", {
    labelId,
    ruleId,
  });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId,
    exclude: true,
    logger,
    messageId,
    threadId,
    reason: "Moved out of label by user",
    source: GroupItemSource.LABEL_REMOVED,
  });
}

async function createRuleForLabel({
  emailAccountId,
  labelId,
  messageId,
  provider,
  logger,
}: {
  emailAccountId: string;
  labelId: string;
  messageId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<string | null> {
  const label = await provider.getLabelById(labelId).catch((error) => {
    logger.warn("Could not read label", { labelId, error });
    return null;
  });
  if (!label?.name) return null;

  // A rule may already label with this name but not know the ID yet (org rule
  // copies only carry the name until they first run). Adopt it instead of
  // creating a duplicate.
  const byName = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      enabled: true,
      actions: {
        some: {
          type: ActionType.LABEL,
          labelId: null,
          label: { equals: label.name, mode: "insensitive" },
        },
      },
    },
    select: { id: true },
  });
  if (byName) {
    await prisma.action.updateMany({
      where: { ruleId: byName.id, type: ActionType.LABEL, labelId: null },
      data: { labelId },
    });
    logger.info("Adopted rule that labels by name", {
      labelId,
      ruleId: byName.id,
    });
    return byName.id;
  }

  // A rule can carry this name without labeling with it (e.g. it was edited).
  // Don't attach learning to it, and don't try to create a duplicate.
  const existing = await findRuleByName({ emailAccountId, name: label.name });
  if (existing) {
    logger.info("Rule with label name exists but does not label, skipping", {
      labelId,
    });
    return null;
  }

  // Gmail's "move to" is add-label plus remove-INBOX; a plain label add keeps
  // the email in the inbox. Mirror what the user did. Without the message we
  // can't tell which, so don't guess.
  const message = await provider.getMessage(messageId).catch((error) => {
    logger.warn("Could not read message while learning label rule", {
      messageId,
      error,
    });
    return null;
  });
  if (!message) return null;

  const archived = !message.labelIds?.includes(GmailLabel.INBOX);

  try {
    const rule = await createRuleWithResolvedActions({
      emailAccountId,
      data: { name: label.name, enabled: true, runOnThreads: false },
      actions: [
        { type: ActionType.LABEL, label: label.name, labelId },
        ...(archived ? [{ type: ActionType.ARCHIVE }] : []),
      ],
    });

    logger.info("Created rule from user-applied label", {
      labelId,
      ruleId: rule.id,
      archived,
    });

    return rule.id;
  } catch (error) {
    // Labeling a thread fires one event per message; another one may have
    // just created the rule. Learn into that one.
    if (isDuplicateError(error, ["name", "emailAccountId"])) {
      const created = await findRuleByName({
        emailAccountId,
        name: label.name,
      });
      if (created) return created.id;
    }

    logger.error("Error creating rule from label", { labelId, error });
    return null;
  }
}

function findRuleByName({
  emailAccountId,
  name,
}: {
  emailAccountId: string;
  name: string;
}) {
  return prisma.rule.findUnique({
    where: { name_emailAccountId: { name, emailAccountId } },
    select: { id: true },
  });
}
