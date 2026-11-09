import type { Prisma } from "@/generated/prisma/client";

/**
 * The order the user arranged their accounts in. Accounts added since the
 * last reorder have no position yet, so they follow in the order they were
 * connected.
 */
export const EMAIL_ACCOUNT_ORDER_BY = [
  { sortOrder: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.EmailAccountOrderByWithRelationInput[];
