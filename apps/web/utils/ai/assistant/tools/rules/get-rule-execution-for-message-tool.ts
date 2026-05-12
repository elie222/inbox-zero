import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { ExecutedRuleStatus } from "@/generated/prisma/enums";
import { serializedMatchMetadataSchema } from "@/app/api/chat/validation";
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

type GetRuleExecutionForMessageOutput =
  | {
      messageId: string;
      threadId: string | null;
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
      "Fetch the recorded rule executions for a specific processed email by message ID. Returns the executions for that message, including status, matched rule, reason, and the actions that were taken such as drafting, labeling, archiving, or forwarding. Use this when the user is asking what happened to a particular email, why it was processed a certain way, or whether multiple rules matched.",
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
