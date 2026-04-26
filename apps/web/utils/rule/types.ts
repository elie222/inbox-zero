import type { Prisma } from "@/generated/prisma/client";

export type RuleWithRelations = Prisma.RuleGetPayload<{
  include: {
    actions: true;
    group: true;
  };
}>;
