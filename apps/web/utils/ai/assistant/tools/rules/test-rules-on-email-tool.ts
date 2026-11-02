import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { serializeMatchReasons } from "@/utils/ai/choose-rule/types";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountForRuleExecution } from "@/utils/user/get";
import { trackRuleToolCall } from "./shared";

const testRulesOnEmailInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Exact message ID of the email to test. Use a messageId from searchInbox, readEmail, or the email the user asked to fix.",
    ),
});

export const testRulesOnEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Dry-run the user's current rules on one email and return which rules would match, why, and their actions, without applying anything. After changing rules to fix how emails were handled, test the email in question, or a recent example found with searchInbox if the user described a kind of email, and only tell the user it is fixed if the result shows what they wanted; otherwise keep fixing. Draft replies are not generated or listed.",
    inputSchema: testRulesOnEmailInputSchema,
    execute: async ({ messageId }) => {
      trackRuleToolCall({ tool: "test_rules_on_email", email, logger });

      try {
        const [emailAccount, rules, emailProvider] = await Promise.all([
          getEmailAccountForRuleExecution({ emailAccountId }),
          prisma.rule.findMany({
            where: { emailAccountId, enabled: true },
            include: { actions: true },
          }),
          createEmailProvider({ emailAccountId, provider, logger }),
        ]);
        if (!emailAccount) return { messageId, error: "Account not found" };

        const message = await emailProvider.getMessage(messageId);

        const results = await runRules({
          isTest: true,
          skipDraftReplies: true,
          provider: emailProvider,
          message,
          rules,
          emailAccount,
          logger,
          modelType: "chat",
        });

        const matches = results.filter((result) => result.rule);

        return {
          messageId,
          matchedRules: matches.map((result) => ({
            ruleName: result.rule!.name,
            reason: result.reason ?? null,
            matchMetadata: serializeMatchReasons(result.matchReasons) ?? null,
            actions: (result.actionItems ?? []).map((action) => ({
              type: action.type,
              label: action.label ?? null,
              folderName: action.folderName ?? null,
            })),
          })),
          noMatchReason: matches.length ? null : (results[0]?.reason ?? null),
          rulesSkippedByLearnedExclusions:
            results[0]?.selectionMetadata?.learnedPatternExcludedRules.map(
              (excluded) => ({
                ruleName: excluded.ruleName,
                excludedValue: excluded.itemValue,
              }),
            ) ?? [],
        };
      } catch (error) {
        logger.error("Failed to test rules on email", { error });
        return { messageId, error: "Failed to test rules on this email" };
      }
    },
  });

export type TestRulesOnEmailTool = InferUITool<
  ReturnType<typeof testRulesOnEmailTool>
>;
