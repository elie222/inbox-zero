import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { ExecutedRuleStatus } from "@/generated/prisma/enums";
import { serializedMatchMetadataSchema } from "@/utils/ai/assistant/chat-context-validation";
import prisma from "@/utils/prisma";
import { trackRuleToolCall } from "./shared";

const getRuleExecutionForMessageInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Exact message ID for the processed email. Use a messageId from searchInbox or readEmail.",
    ),
});

type RuleExecutionEvidence =
  | {
      state: "NO_EXECUTION_RECORDS";
      rootCauseKnown: false;
      summary: string;
    }
  | {
      state: "INCONCLUSIVE_SKIPPED_RECORDS";
      rootCauseKnown: false;
      summary: string;
    }
  | {
      state: "RECORDED_EXECUTIONS";
      rootCauseKnown: null;
      summary: string;
    };

type GetRuleExecutionForMessageOutput =
  | {
      messageId: string;
      threadId: string | null;
      evidence: RuleExecutionEvidence;
      executions: Array<{
        executedRuleId: string;
        ruleId: string | null;
        ruleName: string | null;
        status: ExecutedRuleStatus;
        executedAt: string;
        reason: string | null;
        matchMetadata: z.infer<typeof serializedMatchMetadataSchema>;
        automated: boolean;
        actions: Array<{
          type: string;
          label: string | null;
          labelId: string | null;
          subject: string | null;
          to: string | null;
          cc: string | null;
          bcc: string | null;
          url: string | null;
          folderName: string | null;
        }>;
      }>;
    }
  | {
      messageId: string;
      error: string;
    };

export const getRuleExecutionForMessageTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool<
    z.infer<typeof getRuleExecutionForMessageInputSchema>,
    GetRuleExecutionForMessageOutput
  >({
    description:
      "Fetch the recorded rule executions for a specific processed email by message ID. Returns an evidence summary plus executions for that message, including status, matched rule, reason, and actions such as drafting, labeling, archiving, or forwarding. Use this when the user asks what happened to a particular email, why it was processed a certain way, or whether multiple rules matched. When rootCauseKnown is false, say the cause cannot be determined from the available evidence; do not infer even a likely cause from rule configuration or message content.",
    inputSchema: getRuleExecutionForMessageInputSchema,
    execute: async ({ messageId }) => {
      trackRuleToolCall({
        tool: "get_rule_execution_for_message",
        email,
        logger,
      });

      try {
        const executedRules = await prisma.executedRule.findMany({
          where: {
            emailAccountId,
            messageId,
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            ruleId: true,
            threadId: true,
            createdAt: true,
            status: true,
            reason: true,
            matchMetadata: true,
            automated: true,
            actionItems: {
              select: {
                type: true,
                label: true,
                labelId: true,
                subject: true,
                to: true,
                cc: true,
                bcc: true,
                url: true,
                folderName: true,
              },
            },
            rule: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        const executions = executedRules.map((executedRule) => ({
          executedRuleId: executedRule.id,
          ruleId: executedRule.ruleId,
          ruleName: executedRule.rule?.name ?? null,
          status: executedRule.status,
          executedAt: executedRule.createdAt.toISOString(),
          reason: executedRule.reason,
          matchMetadata:
            serializedMatchMetadataSchema.safeParse(executedRule.matchMetadata)
              .data ?? null,
          automated: executedRule.automated,
          actions: executedRule.actionItems.map((action) => ({
            type: action.type,
            label: action.label,
            labelId: action.labelId,
            subject: action.subject,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            url: action.url,
            folderName: action.folderName,
          })),
        }));

        return {
          messageId,
          threadId: executedRules[0]?.threadId ?? null,
          evidence: getExecutionEvidence(executions),
          executions,
        };
      } catch (error) {
        logger.error("Failed to load rule execution for message", {
          error,
          messageId,
        });
        return {
          messageId,
          error: "Failed to load rule execution for message",
        };
      }
    },
  });

export type GetRuleExecutionForMessageTool = InferUITool<
  ReturnType<typeof getRuleExecutionForMessageTool>
>;

function getExecutionEvidence(
  executions: Array<{
    ruleId: string | null;
    status: ExecutedRuleStatus;
    matchMetadata: unknown;
    actions: unknown[];
  }>,
): RuleExecutionEvidence {
  if (executions.length === 0) {
    return {
      state: "NO_EXECUTION_RECORDS",
      rootCauseKnown: false,
      summary:
        "No execution records were found. This is missing evidence, not proof that processing never ran or of why a rule did not match.",
    };
  }

  if (executions.every(isInconclusiveSkippedExecution)) {
    return {
      state: "INCONCLUSIVE_SKIPPED_RECORDS",
      rootCauseKnown: false,
      summary:
        "Only inconclusive skipped execution records were found. They do not establish whether a specific rule matched, was later deleted, or why processing was skipped.",
    };
  }

  return {
    state: "RECORDED_EXECUTIONS",
    rootCauseKnown: null,
    summary:
      "Recorded rule executions are available. Use each execution's rule, status, reason, match metadata, and actions to explain only what those records establish.",
  };
}

function isInconclusiveSkippedExecution(execution: {
  ruleId: string | null;
  status: ExecutedRuleStatus;
  matchMetadata: unknown;
  actions: unknown[];
}) {
  return (
    execution.ruleId === null &&
    execution.status === "SKIPPED" &&
    execution.matchMetadata === null &&
    execution.actions.length === 0
  );
}
