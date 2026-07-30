import { Prisma } from "@/generated/prisma/client";

/**
 * Users carrying at least one unresolved error.
 *
 * Shared by the admin overview count, the broken-users list and the error-type
 * breakdown so the three cannot drift apart and report different numbers.
 *
 * Must *imply* the predicate on User_errorMessages_updatedAt_idx
 * (20260730190000_admin_dashboard_indexes) for Postgres to use that partial
 * index. Extra conjuncts are fine; a weaker predicate is not.
 *
 * Deliberately unqualified so it works whether or not the query aliases
 * "User" — no other table in these queries has an errorMessages column.
 */
export const HAS_ERROR_MESSAGES = Prisma.sql`"errorMessages" IS NOT NULL AND "errorMessages" <> '{}'::jsonb`;
