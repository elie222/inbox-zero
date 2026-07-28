"use server";

import { after } from "next/server";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { createRule } from "@/utils/rule/rule";
import { retrainLearnedPatterns } from "@/utils/rule/learned-patterns";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { aiProposeRuleFromEmail } from "@/utils/ai/rule/propose-rule-from-email";
import prisma from "@/utils/prisma";
import {
  type ApplyFilterBody,
  queueApplyFilter,
  runApplyFilter,
  splitPatterns,
} from "@/utils/mail/apply-filter";
import {
  createMailFilterBody,
  type FilterMatchType,
  proposeRuleFromEmailBody,
} from "@/utils/actions/mail-filter.validation";

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
        threadIds,
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
            // "Always goes to this folder" includes replies in a thread —
            // otherwise the thread guard skips this rule for any thread it
            // hasn't run on before and the filter never fires
            runOnThreads: true,
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
          // Filters are deterministic filing — they apply to thread replies
          // too, or mail threading onto an old conversation escapes them
          runOnThreads: true,
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

      if (applyToExisting || threadIds?.length) {
        const account = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: { email: true },
        });
        const ownerEmail = account?.email;
        if (ownerEmail) {
          // The threads the user filtered from always move — a filter whose
          // own email stays put (or keeps a second folder label) reads as
          // broken. applyToExisting extends the move to all matching mail.
          const applyBody: ApplyFilterBody = {
            emailAccountId,
            provider,
            matchType,
            value: conditionValue,
            labelId: resolvedLabelId,
            labelName,
            skipInbox,
            threadIds: threadIds ?? [],
            applyToExisting: !!applyToExisting,
          };
          after(async () => {
            try {
              // Long moves run in the internal apply-filter route under its
              // own time budget; inline is the fallback when handoff fails
              const queued = await queueApplyFilter(applyBody, logger);
              if (queued) return;
              const emailProvider = await createEmailProvider({
                emailAccountId,
                provider,
                logger,
              });
              await runApplyFilter({
                emailProvider,
                ownerEmail,
                body: applyBody,
                logger,
              });
            } catch (error) {
              logger.error("Filter apply failed", { ruleId, error });
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
