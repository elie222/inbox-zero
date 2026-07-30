import prisma from "@/utils/prisma";
import { buildDailySeries, type DayCount } from "../daily-series";
import type { AdminStatsParams } from "../types";
import { createAdminStatsRoute, resolveDateRange } from "../utils";

export type GetAdminSignupsResponse = Awaited<ReturnType<typeof getSignups>>;

export const GET = createAdminStatsRoute("admin/stats/signups", getSignups);

async function getSignups(params: AdminStatsParams) {
  const { from, to } = resolveDateRange(params);

  // to_char rather than a bare date_trunc so the day crosses the wire as an
  // unambiguous UTC "YYYY-MM-DD" string. A timestamp would be re-read in the
  // server's local zone and land on the wrong day west of UTC.
  const [users, mailboxes] = await Promise.all([
    prisma.$queryRaw<DayCount[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<DayCount[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM "EmailAccount"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  return { result: buildDailySeries({ from, to, users, mailboxes }) };
}
