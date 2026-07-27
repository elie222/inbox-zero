"use server";

import { after } from "next/server";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
  LogicalOperator,
} from "@/generated/prisma/enums";
import { createRule } from "@/utils/rule/rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
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

// Creates (or extends) a filing rule from the mail list: matching mail gets
// the folder's label and, unless skipInbox is off, leaves the inbox. When a
// rule already files into that folder, the senders/instructions merge into
// it instead of creating an overlapping rule. applyToExisting moves mail
// that already matches — wherever it currently sits — in the background.
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
        instructions,
        skipInbox = true,
        markRead,
        star,
        applyToExisting,
      },
    }) => {
      const conditionValue = normalizeFilterValue(matchType, value);
      const trimmedInstructions = instructions?.trim() || null;

      // A second sender-only rule for the same folder would be rejected as
      // overlapping — merge into the existing rule instead
      const existingRule =
        matchType === "subject"
          ? null
          : await prisma.rule.findFirst({
              where: {
                emailAccountId,
                enabled: true,
                actions: {
                  some: { type: ActionType.LABEL, label: labelName },
                },
              },
              select: {
                id: true,
                name: true,
                from: true,
                instructions: true,
                actions: { select: { type: true, labelId: true } },
              },
            });

      let ruleId: string;
      let ruleName: string;
      let resolvedLabelId: string | null;
      let merged = false;

      if (existingRule) {
        const mergedFrom = mergePatterns(existingRule.from, conditionValue);
        const mergedInstructions = trimmedInstructions
          ? existingRule.instructions
            ? `${existingRule.instructions}\n${trimmedInstructions}`
            : trimmedInstructions
          : existingRule.instructions;

        await prisma.rule.update({
          where: { id: existingRule.id },
          data: {
            from: mergedFrom,
            instructions: mergedInstructions,
            // Static senders and AI instructions each suffice on their own
            ...(mergedFrom && mergedInstructions
              ? { conditionalOperator: LogicalOperator.OR }
              : {}),
          },
        });

        ruleId = existingRule.id;
        ruleName = existingRule.name;
        resolvedLabelId =
          existingRule.actions.find(
            (action) => action.type === ActionType.LABEL,
          )?.labelId ?? null;
        merged = true;
        logger.info("Merged filter into existing rule", {
          ruleId,
          matchType,
        });
      } else {
        const condition =
          matchType === "subject"
            ? {
                conditionalOperator: trimmedInstructions
                  ? LogicalOperator.OR
                  : null,
                aiInstructions: trimmedInstructions,
                static: { from: null, to: null, subject: conditionValue },
              }
            : {
                conditionalOperator: trimmedInstructions
                  ? LogicalOperator.OR
                  : null,
                aiInstructions: trimmedInstructions,
                static: { from: conditionValue, to: null, subject: null },
              };

        const rule = await createRule({
          result: {
            name: `Filter: ${labelName}`,
            condition,
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

        ruleId = rule.id;
        ruleName = rule.name;
        // The label action carries the resolved (possibly just-created) id
        resolvedLabelId =
          rule.actions?.find((action) => action.type === ActionType.LABEL)
            ?.labelId ?? null;
      }

      // Retrain learned patterns: a stale pattern on another rule (e.g. an
      // earlier misfiling the AI "learned") short-circuits rule selection
      // and would keep beating this filter's senders. Remove the conflicts
      // and pin these senders to this rule instead.
      if (matchType !== "subject") {
        await retrainLearnedPatterns({
          emailAccountId,
          ruleId,
          values: splitPatterns(conditionValue),
          logger,
        });
      }

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
              logger.error("Filter backfill failed", { ruleId, error });
            }
          });
        }
      }

      return {
        ruleId,
        ruleName,
        merged,
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

function splitPatterns(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Normalizes one value or a comma-separated list ("a@x.com, b@y.com" /
// "@x.com, y.com") into the rule engine's canonical comma-joined form
function normalizeFilterValue(
  matchType: FilterMatchType,
  value: string,
): string {
  if (matchType === "subject") return value.trim();
  const parts = splitPatterns(value);
  if (matchType === "domain") {
    return [
      ...new Set(
        parts.map((part) => `@${part.replace(/^@/, "").toLowerCase()}`),
      ),
    ].join(", ");
  }
  return [...new Set(parts.map((part) => part.toLowerCase()))].join(", ");
}

// Union of two pattern lists, first-seen order, case-insensitive dedupe
function mergePatterns(existing: string | null, incoming: string): string {
  const seen = new Set<string>();
  const union: string[] = [];
  for (const part of [...splitPatterns(existing), ...splitPatterns(incoming)]) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    union.push(part);
  }
  return union.join(", ");
}

// Moves matching mail into the filter's folder — wherever it currently
// sits, not just the inbox: mail already filed under another folder gets
// that label replaced (this is what "apply to past matches" means when the
// old rule filed things wrong). Bounded: a few pages, a few threads at a
// time.
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
  const parts = splitPatterns(value);
  const query =
    matchType === "sender"
      ? parts.length > 1
        ? `from:(${parts.join(" OR ")})`
        : `from:${parts[0]}`
      : matchType === "domain"
        ? parts.length > 1
          ? `from:(${parts.map((part) => part.replace(/^@/, "")).join(" OR ")})`
          : `from:${parts[0]?.replace(/^@/, "")}`
        : `subject:"${value.replace(/"/g, "")}"`;

  // A merged rule may carry no label id — resolve it so the move can label
  let targetLabelId = labelId;
  if (!targetLabelId) {
    targetLabelId = (await emailProvider.getLabelByName(labelName))?.id ?? null;
  }
  if (!targetLabelId) {
    logger.error("Filter backfill couldn't resolve the folder label", {
      labelName,
    });
    return;
  }

  // Other user folders' labels get replaced — that's the move
  const labels = await emailProvider.getLabels();
  const userLabelIds = new Set(
    labels.filter((label) => label.type === "user").map((label) => label.id),
  );

  const threadLabelIds = new Map<string, Set<string>>();
  const threadMessageIds = new Map<string, string[]>();
  let fetched = 0;
  let pageToken: string | undefined;
  while (fetched < BACKFILL_MAX_MESSAGES) {
    const { messages, nextPageToken } =
      await emailProvider.getMessagesWithPagination({
        query,
        maxResults: 100,
        pageToken,
      });
    for (const message of messages) {
      fetched++;
      if (!message.threadId) continue;
      const labelSet =
        threadLabelIds.get(message.threadId) ?? new Set<string>();
      for (const id of message.labelIds ?? []) labelSet.add(id);
      threadLabelIds.set(message.threadId, labelSet);
      threadMessageIds.set(message.threadId, [
        ...(threadMessageIds.get(message.threadId) ?? []),
        message.id,
      ]);
    }
    if (!nextPageToken || !messages.length) break;
    pageToken = nextPageToken;
  }

  const resolvedTargetLabelId = targetLabelId;
  const results = await runWithBoundedConcurrency({
    items: [...threadLabelIds.keys()],
    concurrency: BACKFILL_CONCURRENCY,
    run: async (threadId) => {
      const present = threadLabelIds.get(threadId) ?? new Set<string>();

      if (skipInbox) {
        await emailProvider.archiveThreadWithLabel(
          threadId,
          ownerEmail,
          resolvedTargetLabelId,
        );
      } else {
        const messageIds = threadMessageIds.get(threadId) ?? [];
        for (const messageId of messageIds) {
          await emailProvider.labelMessage({
            messageId,
            labelId: resolvedTargetLabelId,
            labelName,
          });
        }
      }

      const stripIds = [...present].filter(
        (id) => userLabelIds.has(id) && id !== resolvedTargetLabelId,
      );
      if (stripIds.length) {
        await emailProvider.removeThreadLabels(threadId, stripIds);
      }
    },
  });

  const failed = results.filter(
    (entry) => entry.result.status === "rejected",
  ).length;
  logger.info("Filter backfill finished", {
    threads: threadLabelIds.size,
    failed,
  });
}

// Learned patterns match FROM by bidirectional substring, exactly like the
// engine (utils/group/find-matching-group.ts) — conflicts are judged the
// same way so we only delete patterns that would actually collide.
async function retrainLearnedPatterns({
  emailAccountId,
  ruleId,
  values,
  logger,
}: {
  emailAccountId: string;
  ruleId: string;
  values: string[];
  logger: Logger;
}) {
  const normalized = values
    .map((value) => value.replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (!normalized.length) return;

  // exclude:true items only prevent the other rule from matching — they
  // can't misroute mail here, so they stay
  const otherPatterns = await prisma.groupItem.findMany({
    where: {
      type: GroupItemType.FROM,
      exclude: false,
      group: {
        emailAccountId,
        rule: { is: { id: { not: ruleId } } },
      },
    },
    select: { id: true, value: true },
  });

  const conflicting = otherPatterns.filter((item) => {
    const itemValue = item.value.toLowerCase();
    return normalized.some(
      (value) => itemValue.includes(value) || value.includes(itemValue),
    );
  });

  if (conflicting.length) {
    await prisma.groupItem.deleteMany({
      where: { id: { in: conflicting.map((item) => item.id) } },
    });
    logger.info("Removed conflicting learned patterns", {
      ruleId,
      removed: conflicting.length,
    });
  }

  // Pinning the senders to this rule makes the filter win deterministically
  // even when another rule's AI condition would also match
  for (const value of values) {
    await saveLearnedPattern({
      emailAccountId,
      from: value,
      ruleId,
      logger,
      source: GroupItemSource.USER,
    });
  }
}
