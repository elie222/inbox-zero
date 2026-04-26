import { type InferUITool, tool } from "ai";
import { GroupItemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import {
  createRule,
  outboundActionsNeedChatRiskConfirmation,
} from "@/utils/rule/rule";
import { splitEmailPatterns } from "@/utils/rule/email-from-pattern";
import {
  buildCreateRuleSchemaFromChatToolInput,
  type ChatCreateRuleToolInvocation,
  trackRuleToolCall,
} from "./shared";

export const createRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description: "Create a new rule.",
    inputSchema: createRuleSchema(provider),
    execute: async ({ name, condition, actions }) => {
      trackRuleToolCall({ tool: "create_rule", email, logger });

      try {
        const overlapConflict = await findSenderOnlyOverlapConflict({
          emailAccountId,
          condition,
        });

        if (overlapConflict) {
          return {
            success: false,
            error: `Cannot create this rule because it overlaps the existing "${overlapConflict.ruleName}" rule on sender scope ${overlapConflict.overlappingSenders.join(", ")}. Update the existing rule instead of creating a duplicate.`,
            conflictingRuleName: overlapConflict.ruleName,
            overlappingSenders: overlapConflict.overlappingSenders,
          };
        }

        const resultPayload = buildCreateRuleSchemaFromChatToolInput(
          { name, condition, actions },
          provider,
        );

        const { needsConfirmation, riskMessages } =
          outboundActionsNeedChatRiskConfirmation(resultPayload);

        if (needsConfirmation) {
          return {
            success: true,
            actionType: "create_rule" as const,
            requiresConfirmation: true as const,
            confirmationState: "pending" as const,
            riskMessages,
          };
        }

        const rule = await createRule({
          result: resultPayload,
          emailAccountId,
          provider,
          runOnThreads: true,
          logger,
          enablement: { source: "chat" },
        });

        return { success: true, ruleId: rule.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Failed to create rule", { error });

        return { error: "Failed to create rule", message };
      }
    },
  });

export type CreateRuleTool = InferUITool<ReturnType<typeof createRuleTool>>;

async function findSenderOnlyOverlapConflict({
  emailAccountId,
  condition,
}: {
  emailAccountId: string;
  condition: ChatCreateRuleToolInvocation["condition"];
}) {
  if (
    condition.aiInstructions ||
    condition.static?.to ||
    condition.static?.subject ||
    !condition.static?.from
  ) {
    return null;
  }

  const proposedPatterns = parseSenderScopePatterns(condition.static.from);
  if (!proposedPatterns.length) return null;

  const existingRules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
      from: { not: null },
    },
    select: {
      name: true,
      instructions: true,
      from: true,
      to: true,
      subject: true,
      group: {
        select: {
          items: {
            where: {
              type: GroupItemType.FROM,
            },
            select: {
              value: true,
              exclude: true,
            },
          },
        },
      },
    },
  });

  for (const existingRule of existingRules) {
    if (
      existingRule.instructions ||
      existingRule.to ||
      existingRule.subject ||
      !existingRule.from
    ) {
      continue;
    }

    const overlappingSenders = getOverlappingSenderScopes(
      proposedPatterns,
      parseSenderScopePatterns(existingRule.from),
      getExcludedSenderScopePatterns(existingRule.group?.items ?? []),
      getIncludedSenderScopePatterns(existingRule.group?.items ?? []),
    );

    if (!overlappingSenders.length) continue;

    return {
      ruleName: existingRule.name,
      overlappingSenders,
    };
  }

  return null;
}

function getOverlappingSenderScopes(
  left: SenderScopePattern[],
  right: SenderScopePattern[],
  rightExcluded: SenderScopePattern[] = [],
  rightIncluded: SenderScopePattern[] = [],
) {
  const overlaps = new Set<string>();

  for (const leftPattern of left) {
    if (
      rightIncluded.some((includedPattern) =>
        senderScopesOverlap(leftPattern, includedPattern),
      )
    ) {
      overlaps.add(leftPattern.raw);
      continue;
    }

    for (const rightPattern of right) {
      if (!senderScopesOverlap(leftPattern, rightPattern)) continue;
      if (isSenderScopeFullyExcluded(leftPattern, rightExcluded)) continue;
      overlaps.add(leftPattern.raw);
    }
  }

  return [...overlaps];
}

type SenderScopePattern =
  | {
      kind: "domain";
      value: string;
      raw: string;
    }
  | {
      kind: "email";
      value: string;
      raw: string;
    };

function parseSenderScopePatterns(value: string) {
  return splitEmailPatterns(value)
    .map(normalizeSenderScopePattern)
    .filter((pattern): pattern is SenderScopePattern => Boolean(pattern));
}

function normalizeSenderScopePattern(value: string): SenderScopePattern | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.startsWith("@")) {
    const domain = normalized.slice(1);
    return domain
      ? {
          kind: "domain",
          value: domain,
          raw: normalized,
        }
      : null;
  }

  if (normalized.includes("@")) {
    return {
      kind: "email",
      value: normalized,
      raw: normalized,
    };
  }

  return {
    kind: "domain",
    value: normalized,
    raw: normalized,
  };
}

function senderScopesOverlap(
  left: SenderScopePattern,
  right: SenderScopePattern,
) {
  if (left.kind === "email" && right.kind === "email") {
    return left.value === right.value;
  }

  if (left.kind === "domain" && right.kind === "domain") {
    return left.value === right.value;
  }

  if (left.kind === "email" && right.kind === "domain") {
    return left.value.endsWith(`@${right.value}`);
  }

  return right.value.endsWith(`@${left.value}`);
}

function isSenderScopeFullyExcluded(
  pattern: SenderScopePattern,
  excludedPatterns: SenderScopePattern[],
) {
  if (!excludedPatterns.length) return false;

  if (pattern.kind === "email") {
    return excludedPatterns.some((excludedPattern) =>
      senderScopesOverlap(pattern, excludedPattern),
    );
  }

  return excludedPatterns.some(
    (excludedPattern) =>
      excludedPattern.kind === "domain" &&
      excludedPattern.value === pattern.value,
  );
}

function getExcludedSenderScopePatterns(
  items: Array<{ value: string; exclude: boolean }>,
) {
  return items
    .filter((item) => item.exclude)
    .flatMap((item) => parseSenderScopePatterns(item.value));
}

function getIncludedSenderScopePatterns(
  items: Array<{ value: string; exclude: boolean }>,
) {
  return items
    .filter((item) => !item.exclude)
    .flatMap((item) => parseSenderScopePatterns(item.value));
}
