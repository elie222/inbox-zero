import { GroupItemType } from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { splitEmailPatterns } from "@/utils/rule/email-from-pattern";

type SenderOnlyRuleScope = {
  instructions?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  groupId?: string | null;
};

type SenderOnlyOverlapConflict = {
  ruleName: string;
  overlappingSenders: string[];
};

export async function assertNoSenderOnlyOverlap({
  emailAccountId,
  rule,
  excludeRuleId,
}: {
  emailAccountId: string;
  rule: SenderOnlyRuleScope;
  excludeRuleId?: string;
}) {
  const conflict = await findSenderOnlyOverlapConflict({
    emailAccountId,
    rule,
    excludeRuleId,
  });

  if (!conflict) return;

  throw new SafeError(formatSenderOnlyOverlapError(conflict), 400);
}

export async function findSenderOnlyOverlapConflict({
  emailAccountId,
  rule,
  excludeRuleId,
}: {
  emailAccountId: string;
  rule: SenderOnlyRuleScope;
  excludeRuleId?: string;
}): Promise<SenderOnlyOverlapConflict | null> {
  if (!isSenderOnlyScope(rule)) return null;

  const proposedPatterns = parseSenderScopePatterns(rule.from);
  if (!proposedPatterns.length) return null;

  const existingRules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
      from: { not: null },
      ...(excludeRuleId && { id: { not: excludeRuleId } }),
    },
    select: {
      name: true,
      instructions: true,
      from: true,
      to: true,
      subject: true,
      body: true,
      groupId: true,
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
    if (!isSenderOnlyScope(existingRule)) continue;

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

export function formatSenderOnlyOverlapError({
  ruleName,
  overlappingSenders,
}: SenderOnlyOverlapConflict) {
  return `Cannot create this rule because it overlaps the existing "${ruleName}" rule on sender scope ${overlappingSenders.join(", ")}. Update the existing rule instead of creating a duplicate.`;
}

function isSenderOnlyScope(
  rule: SenderOnlyRuleScope,
): rule is SenderOnlyRuleScope & { from: string } {
  return Boolean(
    rule.from &&
      !rule.instructions &&
      !rule.to &&
      !rule.subject &&
      !rule.body &&
      !rule.groupId,
  );
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
