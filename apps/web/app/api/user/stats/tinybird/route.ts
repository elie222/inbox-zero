import { NextResponse } from "next/server";
import { format } from "date-fns";
import keyBy from "lodash/keyBy";
import groupBy from "lodash/groupBy";
import merge from "lodash/merge";
import {
  getEmailsByWeek,
  getReadEmailsByWeek,
  getSentEmailsByWeek,
} from "@inboxzero/tinybird";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";

export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByWeek>>;

async function getStatsByWeek(options: { email: string }) {
  const [all, read, sent] = await Promise.all([
    getEmailsByWeek({ ownerEmail: options.email }),
    getReadEmailsByWeek({ ownerEmail: options.email }),
    getSentEmailsByWeek({ ownerEmail: options.email }),
  ]);

  const allObject = keyBy(
    all.data.map((d) => ({
      week_start: format(d.week_start, "LLL dd, y"),
      All: d.count,
    })),
    "week_start"
  );
  const readUnreadGroups = groupBy(read.data, "read");
  const readObject = keyBy(
    readUnreadGroups["true"].map((d) => ({
      week_start: format(d.week_start, "LLL dd, y"),
      Read: d.count,
    })),
    "week_start"
  );
  const unreadObject = keyBy(
    readUnreadGroups["false"].map((d) => ({
      week_start: format(d.week_start, "LLL dd, y"),
      Unread: d.count,
    })),
    "week_start"
  );
  const sentObject = keyBy(
    sent.data.map((d) => ({
      week_start: format(d.week_start, "LLL dd, y"),
      Sent: d.count,
    })),
    "week_start"
  );

  const merged = merge(allObject, readObject, unreadObject, sentObject);

  return { result: Object.values(merged) };
}

export const GET = withError(async () => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getStatsByWeek({ email: session.user.email });

  return NextResponse.json(result);
});
