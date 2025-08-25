import type { safeCreateRule } from "@/utils/rule/rule";

export type CreateRuleResult = NonNullable<
  Awaited<ReturnType<typeof safeCreateRule>>
>;
