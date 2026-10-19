import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { ExecutedRuleStatus } from "@/generated/prisma/enums";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules-on-message";
import { trackRuleToolCall } from "./shared";

const runRulesOnEmailInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Exact message ID of the email to run the rules on. Use a messageId from searchInbox or readEmail.",
    ),
  apply: z
    .boolean()
    .describe(
      "false: preview which rule would match and what it would do, nothing changes. true: actually run the matched rule's actions on the email.",
    ),
});

type RunRulesOnEmailOutput =
  | {
      messageId: string;
      preview: boolean;
      results: Array<{
        ruleName: string | null;
        reason: string | null;
        status: ExecutedRuleStatus;
        alreadyProcessed: boolean;
        actions: Array<{
          type: string;
          label: string | null;
          folderName: string | null;
        }>;
      }>;
    }
  | { error: string };

export const runRulesOnEmailTool = ({
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
      "Run the user's enabled rules on one email by message ID and report which rule matches, why, and what its actions are. With apply=false (a preview) nothing changes: it only shows the rule that would match and the actions it would take. With apply=true the matched rule's actions are actually run (labeling, archiving, drafting, forwarding, etc.); if the email was already processed, the existing result is returned instead of running again. Prefer apply=false unless the user asked to run or apply the rules. Find the messageId with searchInbox first. This differs from getRuleExecutionForMessage, which only reads what past runs recorded and never evaluates the rules.",
    inputSchema: runRulesOnEmailInputSchema,
    execute: async ({ messageId, apply }): Promise<RunRulesOnEmailOutput> => {
      trackRuleToolCall({ tool: "run_rules_on_email", email, logger });

      const preview = !apply;

      try {
        const results = await runRulesOnMessage({
          emailAccountId,
          provider,
          messageId,
          isTest: preview,
          logger: logger.with({ messageId }),
        });

        return {
          messageId,
          preview,
          results: results.map((result) => ({
            ruleName: result.rule?.name ?? null,
            reason: result.reason ?? null,
            status: result.status,
            alreadyProcessed: result.existing ?? false,
            actions: (result.actionItems ?? []).map((action) => ({
              type: action.type,
              label: action.label ?? null,
              folderName: action.folderName ?? null,
            })),
          })),
        };
      } catch (error) {
        logger.error("Failed to run rules on email", { error, messageId });
        return { error: "Failed to run rules on email" };
      }
    },
  });

export type RunRulesOnEmailTool = InferUITool<
  ReturnType<typeof runRulesOnEmailTool>
>;
