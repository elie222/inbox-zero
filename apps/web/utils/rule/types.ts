import type { createRule } from "@/utils/rule/rule";
import type { Action, Rule, Prisma } from "@prisma/client";

export type CreateRuleResult = NonNullable<
  Awaited<ReturnType<typeof createRule>>
>;

export type RuleWithRelations = Rule & {
  actions: Action[];
  group?:
    | (Prisma.GroupGetPayload<{
        select: { id: true; name: true };
      }> & {
        items?:
          | Prisma.GroupItemGetPayload<{
              select: { id: true; type: true; value: true };
            }>[]
          | null;
      })
    | null;
};
