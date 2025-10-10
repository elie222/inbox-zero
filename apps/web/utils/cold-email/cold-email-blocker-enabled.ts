import { type Prisma, SystemType } from "@prisma/client";

export type RuleWithActions = Prisma.RuleGetPayload<{
  select: { systemType: true; enabled: true };
}>;

export function isColdEmailBlockerEnabled(rules: RuleWithActions[]) {
  return rules.some(
    (rule) => rule.systemType === SystemType.COLD_EMAIL && rule.enabled,
  );
}
