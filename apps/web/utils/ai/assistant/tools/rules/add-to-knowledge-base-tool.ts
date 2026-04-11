import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { trackRuleToolCall } from "./shared";

export const addToKnowledgeBaseTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Add content to the knowledge base",
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
    execute: async ({ title, content }) => {
      trackRuleToolCall({ tool: "add_to_knowledge_base", email, logger });

      try {
        await prisma.knowledge.create({
          data: {
            emailAccountId,
            title,
            content,
          },
        });

        return { success: true };
      } catch (error) {
        if (isDuplicateError(error, "title")) {
          return {
            error: "A knowledge item with this title already exists",
          };
        }

        logger.error("Failed to add to knowledge base", { error });
        return { error: "Failed to add to knowledge base" };
      }
    },
  });

export type AddToKnowledgeBaseTool = InferUITool<
  ReturnType<typeof addToKnowledgeBaseTool>
>;
