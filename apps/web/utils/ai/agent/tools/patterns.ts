import { createHash } from "node:crypto";
import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { AgentToolContext } from "@/utils/ai/agent/types";

const createPatternSchema = z.object({
  matcher: z.unknown().describe("Connector-defined matcher object"),
  reason: z.string().optional().describe("Reason this pattern was created"),
  actions: z
    .array(
      z.object({
        actionType: z.string().min(1),
        actionData: z.unknown(),
      }),
    )
    .min(1)
    .describe("Actions to execute when the pattern matches"),
});

export const createPatternTool = ({
  emailAccountId,
  provider,
  resourceType,
  logger,
}: AgentToolContext) =>
  tool({
    description: "Create a learned pattern with associated actions",
    inputSchema: createPatternSchema,
    execute: async ({ matcher, reason, actions }) => {
      const log = logger.with({ tool: "createPattern" });
      log.info("Creating learned pattern", { provider, resourceType });

      const matcherHash = hashMatcher(matcher);

      try {
        const pattern = await prisma.learnedPattern.create({
          data: {
            provider,
            resourceType,
            matcher,
            matcherHash,
            reason,
            emailAccountId,
            actions: {
              create: actions.map((action) => ({
                actionType: action.actionType,
                actionData: action.actionData,
              })),
            },
          },
        });

        return {
          success: true,
          patternId: pattern.id,
          matcherHash: pattern.matcherHash,
        };
      } catch (error) {
        if (isDuplicateError(error, "matcherHash")) {
          return { error: "Pattern already exists for this matcher" };
        }

        log.error("Failed to create pattern", { error });
        return { error: "Failed to create pattern" };
      }
    },
  });

export type CreatePatternTool = InferUITool<
  ReturnType<typeof createPatternTool>
>;

const removePatternSchema = z
  .object({
    patternId: z.string().optional().describe("Pattern ID to remove"),
    matcherHash: z.string().optional().describe("Matcher hash to remove"),
  })
  .refine((value) => value.patternId || value.matcherHash, {
    message: "Provide patternId or matcherHash",
  });

export const removePatternTool = ({
  emailAccountId,
  provider,
  resourceType,
  logger,
}: AgentToolContext) =>
  tool({
    description: "Remove a learned pattern",
    inputSchema: removePatternSchema,
    execute: async ({ patternId, matcherHash }) => {
      const log = logger.with({ tool: "removePattern" });
      log.info("Removing learned pattern", {
        hasPatternId: Boolean(patternId),
        hasMatcherHash: Boolean(matcherHash),
      });

      if (patternId) {
        const pattern = await prisma.learnedPattern.findUnique({
          where: { id: patternId },
        });

        if (!pattern || pattern.emailAccountId !== emailAccountId) {
          return { error: "Pattern not found" };
        }

        await prisma.learnedPattern.delete({ where: { id: patternId } });
        return { success: true };
      }

      const pattern = await prisma.learnedPattern.findFirst({
        where: {
          emailAccountId,
          matcherHash: matcherHash,
          provider,
          resourceType,
        },
      });

      if (!pattern) {
        return { error: "Pattern not found" };
      }

      await prisma.learnedPattern.delete({ where: { id: pattern.id } });
      return { success: true };
    },
  });

export type RemovePatternTool = InferUITool<
  ReturnType<typeof removePatternTool>
>;

function hashMatcher(matcher: unknown): string {
  const stable = stableStringify(matcher);
  return createHash("sha256").update(stable).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}
