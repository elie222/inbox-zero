import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";

export function isOrgAdminAnalyticsAutoEnabled() {
  return env.AUTO_ENABLE_ORG_ANALYTICS;
}

export function hasOrgAdminAnalyticsAccess(allowOrgAdminAnalytics: boolean) {
  return isOrgAdminAnalyticsAutoEnabled() || allowOrgAdminAnalytics;
}

export function getOrgAdminAnalyticsMemberFilter(): Prisma.MemberWhereInput {
  return isOrgAdminAnalyticsAutoEnabled()
    ? {}
    : { allowOrgAdminAnalytics: true };
}

export function getOrgAdminAnalyticsSqlClause() {
  return isOrgAdminAnalyticsAutoEnabled()
    ? Prisma.sql``
    : Prisma.sql` AND m."allowOrgAdminAnalytics" = true`;
}
