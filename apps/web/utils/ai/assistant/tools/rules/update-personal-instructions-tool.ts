import { type InferUITool, tool } from "ai";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
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
        if (mode === "append") {
          const [updatedAccount] = await prisma.$queryRaw<
            Array<{ previous: string | null; updated: string | null }>
          >(Prisma.sql`
            WITH existing AS (
              SELECT "id", "about" AS "previous"
              FROM "EmailAccount"
              WHERE "id" = ${emailAccountId}
              FOR UPDATE
            )
            UPDATE "EmailAccount"
            SET "about" = CASE
              WHEN existing."previous" IS NULL OR existing."previous" = '' THEN ${personalInstructions}
              ELSE existing."previous" || E'\n' || ${personalInstructions}
            END
            FROM existing
            WHERE "EmailAccount"."id" = existing."id"
            RETURNING existing."previous", "EmailAccount"."about" AS "updated"
          `);

          if (!updatedAccount) return { error: "Account not found" };

          return {
            success: true,
            previous: updatedAccount.previous,
            updated: updatedAccount.updated,
          };
        }

        const existing = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: { about: true },
        });
        if (!existing) return { error: "Account not found" };

        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { about: personalInstructions },
        });

        return {
          success: true,
          previous: existing.about,
          updated: personalInstructions,
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
