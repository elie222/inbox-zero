import type { safeCreateRule } from "@/utils/rule/rule";
import type { Action, Rule, Category, Prisma } from "@prisma/client";

export type CreateRuleResult = NonNullable<
  Awaited<ReturnType<typeof safeCreateRule>>
>;

export type RuleWithRelations = Rule & {
  actions: Action[];
  categoryFilters?: Category[];
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
