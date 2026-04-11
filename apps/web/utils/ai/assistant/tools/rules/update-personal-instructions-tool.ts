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
    description:
      "Update the user's personal instructions (about). Write the durable instruction itself in about, not a wrapper like 'add this to my instructions'. Use mode 'append' to add to the existing content and mode 'replace' to overwrite it after reviewing the current value.",
    inputSchema: z.object({
      about: z.string(),
      mode: z
        .enum(["replace", "append"])
        .default("append")
        .describe(
          "Use 'append' to add to existing instructions, 'replace' to overwrite entirely.",
        ),
    }),
    execute: async ({ about, mode = "append" }) => {
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
            ? `${existing.about}\n${about}`
            : about;

        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { about: updatedAbout },
        });

        return {
          success: true,
          previousAbout: existing.about,
          updatedAbout,
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
