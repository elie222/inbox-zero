import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";
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
        ruleId: string;
        ruleName: string;
        appliedAt: string;
        reason: string | null;
        matchMetadata: z.infer<typeof serializedMatchMetadataSchema>;
        automated: boolean;
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
      "Fetch the exact rule execution reasoning for a specific processed email by message ID. Use this only when the user is asking why a particular email was processed a certain way.",
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
            status: ExecutedRuleStatus.APPLIED,
            rule: { isNot: null },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            threadId: true,
            createdAt: true,
            reason: true,
            matchMetadata: true,
            automated: true,
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
          ruleId: executedRule.rule!.id,
          ruleName: executedRule.rule!.name,
          appliedAt: executedRule.createdAt.toISOString(),
          reason: executedRule.reason,
          matchMetadata:
            serializedMatchMetadataSchema.safeParse(executedRule.matchMetadata)
              .data ?? null,
          automated: executedRule.automated,
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
