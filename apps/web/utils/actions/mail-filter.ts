"use server";

import { after } from "next/server";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { ActionType } from "@/generated/prisma/enums";
import { createRule } from "@/utils/rule/rule";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { aiProposeRuleFromEmail } from "@/utils/ai/rule/propose-rule-from-email";
import { runWithBoundedConcurrency } from "@/utils/async";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  createMailFilterBody,
  type FilterMatchType,
  proposeRuleFromEmailBody,
} from "@/utils/actions/mail-filter.validation";

const BACKFILL_MAX_MESSAGES = 500;
const BACKFILL_CONCURRENCY = 3;

// Creates a filing rule from the mail list ("filter messages like this"):
// matching mail gets the folder's label and, unless skipInbox is off,
// leaves the inbox. The folder is created when it doesn't exist yet, and
// applyToExisting sweeps mail already sitting in the inbox in the
// background.
export const createMailFilterAction = actionClient
  .metadata({ name: "createMailFilter" })
  .inputSchema(createMailFilterBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: {
        matchType,
        value,
        labelName,
        skipInbox = true,
        markRead,
        star,
        applyToExisting,
      },
    }) => {
      const conditionValue = normalizeFilterValue(matchType, value);

      const rule = await createRule({
        result: {
          name: `Filter: ${conditionValue}`,
          condition: {
            conditionalOperator: null,
            aiInstructions: null,
            static:
              matchType === "subject"
                ? { from: null, to: null, subject: conditionValue }
                : { from: conditionValue, to: null, subject: null },
          },
          // The label resolves by name — created on the provider when it
          // doesn't exist yet
          actions: [
            { type: ActionType.LABEL, fields: { label: labelName } },
            ...(skipInbox ? [{ type: ActionType.ARCHIVE }] : []),
            ...(markRead ? [{ type: ActionType.MARK_READ }] : []),
            ...(star ? [{ type: ActionType.STAR }] : []),
          ],
        },
        emailAccountId,
        provider,
        runOnThreads: false,
        logger,
      });

      // The label action carries the resolved (possibly just-created) id
      const resolvedLabelId =
        rule.actions?.find((action) => action.type === ActionType.LABEL)
          ?.labelId ?? null;

      if (applyToExisting) {
        const account = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: { email: true },
        });
        const ownerEmail = account?.email;
        if (ownerEmail) {
          after(async () => {
            try {
              const emailProvider = await createEmailProvider({
                emailAccountId,
                provider,
                logger,
              });
              await applyFilterToExistingMail({
                emailProvider,
                ownerEmail,
                matchType,
                value: conditionValue,
                labelId: resolvedLabelId,
                labelName,
                skipInbox,
                logger,
              });
            } catch (error) {
              logger.error("Filter backfill failed", {
                ruleId: rule.id,
                error,
              });
            }
          });
        }
      }

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        labelId: resolvedLabelId,
        backfillQueued: !!applyToExisting,
      };
    },
  );

// AI proposal for "rule from this email": destination folder, match scope,
// and inbox behavior — reviewed by the user before anything is created.
export const proposeRuleFromEmailAction = actionClient
  .metadata({ name: "proposeRuleFromEmail" })
  .inputSchema(proposeRuleFromEmailBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { from, subject, snippet },
    }) => {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const labels = await emailProvider.getLabels();
      const folders = labels
        .filter((label) => label.type === "user")
        .map((label) => label.name);

      const proposal = await aiProposeRuleFromEmail({
        emailAccount,
        from,
        subject,
        snippet: snippet ?? null,
        folders,
      });
      if (!proposal) {
        throw new SafeError("Couldn't propose a rule for this email");
      }

      return {
        ...proposal,
        matchValue: normalizeFilterValue(
          proposal.matchType,
          proposal.matchValue,
        ),
      };
    },
  );

function normalizeFilterValue(
  matchType: FilterMatchType,
  value: string,
): string {
  const trimmed = value.trim();
  if (matchType === "domain") {
    const domain = trimmed.replace(/^@/, "").toLowerCase();
    return `@${domain}`;
  }
  if (matchType === "sender") return trimmed.toLowerCase();
  return trimmed;
}

// Sweeps matching mail that's already in the inbox into the new filter's
// folder. Bounded: a few pages of matches, a few threads at a time.
async function applyFilterToExistingMail({
  emailProvider,
  ownerEmail,
  matchType,
  value,
  labelId,
  labelName,
  skipInbox,
  logger,
}: {
  emailProvider: EmailProvider;
  ownerEmail: string;
  matchType: FilterMatchType;
  value: string;
  labelId: string | null;
  labelName: string;
  skipInbox: boolean;
  logger: Logger;
}) {
  const query =
    matchType === "sender"
      ? `from:${value}`
      : matchType === "domain"
        ? `from:${value.replace(/^@/, "")}`
        : `subject:"${value.replace(/"/g, "")}"`;

  const threadIds = new Set<string>();
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  while (messageIds.length < BACKFILL_MAX_MESSAGES) {
    const { messages, nextPageToken } =
      await emailProvider.getMessagesWithPagination({
        query,
        maxResults: 100,
        pageToken,
        // Moving mail out of the inbox only touches what's in it; a
        // label-only filter tags everything matching
        inboxOnly: skipInbox,
      });
    for (const message of messages) {
      messageIds.push(message.id);
      if (message.threadId) threadIds.add(message.threadId);
    }
    if (!nextPageToken || !messages.length) break;
    pageToken = nextPageToken;
  }

  if (skipInbox) {
    const results = await runWithBoundedConcurrency({
      items: [...threadIds],
      concurrency: BACKFILL_CONCURRENCY,
      run: (threadId) =>
        emailProvider.archiveThreadWithLabel(
          threadId,
          ownerEmail,
          labelId ?? undefined,
        ),
    });
    const failed = results.filter(
      (entry) => entry.result.status === "rejected",
    ).length;
    logger.info("Filter backfill finished", {
      threads: threadIds.size,
      failed,
    });
    return;
  }

  if (!labelId) return;
  const results = await runWithBoundedConcurrency({
    items: messageIds,
    concurrency: BACKFILL_CONCURRENCY,
    run: (messageId) =>
      emailProvider.labelMessage({ messageId, labelId, labelName }),
  });
  const failed = results.filter(
    (entry) => entry.result.status === "rejected",
  ).length;
  logger.info("Filter backfill finished", {
    messages: messageIds.length,
    failed,
  });
}
