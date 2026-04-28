import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { trackRuleToolCall } from "./shared";

export const updatePersonalInstructionsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: `Update the user's personal instructions with durable preferences for how the assistant should behave in future chat responses and email handling.

Use this for stable user preferences, background, tone, and future assistant behavior across workflows. Use saveMemory instead for facts or preferences that are only needed for future chat recall.

Write the instruction itself, not a wrapper like "add this to my instructions". Store only the new instruction text, not the existing instructions plus the new text. Prefer first-person or imperative wording such as "I prefer concise replies" instead of third-person like "the user prefers concise replies".

Only call this after the user directly requested the exact instruction or confirmed a concrete proposal for the exact instruction.

Append by default; replace only when the user clearly wants an overwrite.`,
    inputSchema: z.object({
      personalInstructions: z
        .string()
        .describe("The personal instructions content to write."),
      mode: z
        .enum(["replace", "append"])
        .default("append")
        .describe(
          "Use 'append' to add to existing instructions, 'replace' to overwrite entirely.",
        ),
    }),
    execute: async ({ personalInstructions, mode = "append" }) => {
      trackRuleToolCall({
        tool: "update_personal_instructions",
        email,
        logger,
      });
      try {
        const existing = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: { about: true },
        });

        if (!existing) return { error: "Account not found" };

        const updatedAbout =
          mode === "append" && existing.about
            ? `${existing.about}\n${personalInstructions}`
            : personalInstructions;

        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { about: updatedAbout },
        });

        return {
          success: true,
          previous: existing.about,
          updated: updatedAbout,
        };
      } catch (error) {
        logger.error("Failed to update personal instructions", { error });
        return {
          error: "Failed to update personal instructions",
        };
      }
    },
  });

export type UpdatePersonalInstructionsTool = InferUITool<
  ReturnType<typeof updatePersonalInstructionsTool>
>;
