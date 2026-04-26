import { Prisma } from "@/generated/prisma/client";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";
import { withAuth } from "@/utils/middleware";
import { type OrgStatsParams, orgStatsParams } from "./types";

type OrgStatsRouteHandler<T> = (
  params: OrgStatsParams & {
    organizationId: string;
  },
) => Promise<T>;

type OrgStatsBucket = {
  label: string;
  min: number;
  max?: number;
};

export const ORG_STATS_BUCKETS: OrgStatsBucket[] = [
  { min: 500, label: "500+" },
  { min: 200, max: 499, label: "200-499" },
  { min: 100, max: 199, label: "100-199" },
  { min: 50, max: 99, label: "50-99" },
  { min: 0, max: 49, label: "<50" },
];

export function createOrgStatsRoute<T>(
  routeName: string,
  getData: OrgStatsRouteHandler<T>,
) {
  return withAuth(routeName, async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const { searchParams } = new URL(request.url);
    const queryParams = orgStatsParams.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    return Response.json(
      await getData({
        organizationId,
        fromDate: queryParams.fromDate ?? undefined,
        toDate: queryParams.toDate ?? undefined,
      }),
    );
  });
}

export function buildDateClause(
  field: Prisma.Sql,
  { fromDate, toDate }: OrgStatsParams,
) {
  const dateConditions: Prisma.Sql[] = [];

  if (fromDate) {
    dateConditions.push(Prisma.sql`${field} >= ${new Date(fromDate)}`);
  }

  if (toDate) {
    dateConditions.push(Prisma.sql`${field} <= ${new Date(toDate)}`);
  }

  return dateConditions.length > 0
    ? Prisma.sql` AND ${Prisma.join(dateConditions, " AND ")}`
    : Prisma.sql``;
}

export function getOrgAnalyticsMemberFilter(organizationId: string) {
  return Prisma.sql`m."organizationId" = ${organizationId} AND m."allowOrgAdminAnalytics" = true`;
}

export function bucketMemberCounts<T>(
  rows: readonly T[],
  getCount: (row: T) => number,
  buckets: readonly OrgStatsBucket[] = ORG_STATS_BUCKETS,
) {
  const bucketCounts = buckets.map((bucket) => ({
    label: bucket.label,
    userCount: 0,
  }));

  for (const row of rows) {
    const count = getCount(row);

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];

      if (
        count >= bucket.min &&
        (bucket.max === undefined || count <= bucket.max)
      ) {
        bucketCounts[i].userCount++;
        break;
      }
    }
  }

  return bucketCounts;
}
