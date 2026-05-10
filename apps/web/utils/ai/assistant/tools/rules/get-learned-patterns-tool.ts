import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { buildHiddenRuleNotFoundError, trackRuleToolCall } from "./shared";

export const getLearnedPatternsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Retrieve the learned patterns for a rule",
    inputSchema: z.object({
      ruleName: z
        .string()
        .describe("The name of the rule to get the learned patterns for"),
    }),
    execute: async ({ ruleName }) => {
      trackRuleToolCall({ tool: "get_learned_patterns", email, logger });
      try {
        const rule = await prisma.rule.findUnique({
          where: { name_emailAccountId: { name: ruleName, emailAccountId } },
          select: {
            group: {
              select: {
                items: {
                  select: {
                    type: true,
                    value: true,
                    exclude: true,
                  },
                },
              },
            },
          },
        });

        if (!rule) {
          return buildHiddenRuleNotFoundError();
        }

        return {
          patterns: rule.group?.items,
        };
      } catch (error) {
        logger.error("Failed to load learned patterns", { error, ruleName });
        return {
          error: "Failed to load learned patterns",
        };
      }
    },
  });

export type GetLearnedPatternsTool = InferUITool<
  ReturnType<typeof getLearnedPatternsTool>
>;
