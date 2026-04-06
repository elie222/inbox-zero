import type { Action, Rule, Prisma } from "@/generated/prisma/client";

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
