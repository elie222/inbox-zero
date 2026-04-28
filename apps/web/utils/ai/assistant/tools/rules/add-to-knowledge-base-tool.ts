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
    description: `Add an entry to the knowledge base. The knowledge base is used for drafting when a draft-reply rule has no preset content.

Use this for reusable drafting reference material, not for global user preferences or assistant behavior. Use updatePersonalInstructions for stable tone, background, and future behavior preferences.`,
    inputSchema: z.object({
      title: z.string().describe("The knowledge base entry title."),
      content: z.string().describe("The knowledge base entry content."),
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
