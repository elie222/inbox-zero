import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import {
  createRuleSchema,
  type CreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { getUserCategoriesForNames } from "@/utils/category.server";
import prisma from "@/utils/prisma";
import { createRule } from "@/utils/rule/rule";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

const logger = createScopedLogger("chat");

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  const { messages } = await req.json();

  const system =
    "You are an assistant that helps create rules to manage a user's inbox.";

  const result = streamText({
    model: anthropic("claude-3-5-sonnet-20240620"),
    messages,
    system,
    tools: {
      create_rule: tool({
        description: "Create a new rule",
        // parameters: categories
        //   ? getCreateRuleSchemaWithCategories(
        //       categories.map((c) => c.name) as [string, ...string[]],
        //     )
        //   : createRuleSchema,
        parameters: createRuleSchema,
        execute: async ({ name, condition, actions }) => {
          logger.info("Create Rule", { name, condition, actions });
          // trackToolCall("create_rule", user.email);

          const conditions =
            condition as CreateRuleSchemaWithCategories["condition"];

          try {
            const categoryIds = await getUserCategoriesForNames(
              userId,
              conditions.categories?.categoryFilters || [],
            );

            const rule = await createRule({
              result: { name, condition, actions },
              userId,
              categoryIds,
            });

            if ("error" in rule) {
              logger.error("Error while creating rule", {
                // ...loggerOptions,
                error: rule.error,
              });

              return {
                error: "Failed to create rule",
                message: rule.error,
              };
            }

            // createdRules.set(rule.id, rule);

            return { success: true };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            logger.error("Failed to create rule", {
              // ...loggerOptions,
              error: message,
            });

            return {
              error: "Failed to create rule",
              message,
            };
          }
        },
      }),
      list_rules: tool({
        description: "List all existing rules for the user",
        parameters: z.object({}),
        execute: async () => {
          // trackToolCall("list_rules", user.email);
          // return userRules;

          const rules = await prisma.rule.findMany({
            where: { userId },
          });

          return rules;
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
