import { NextResponse } from "next/server";
import { format } from "date-fns";
import keyBy from "lodash/keyBy";
import groupBy from "lodash/groupBy";
import merge from "lodash/merge";
import {
  getEmailsByPeriod,
  getReadEmailsByPeriod,
  getSentEmailsByPeriod,
} from "@inboxzero/tinybird";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";

export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByPeriod>>;

async function getStatsByPeriod(options: { email: string }) {
  const [all, read, sent] = await Promise.all([
    getEmailsByPeriod({ ownerEmail: options.email, period: "week" }),
    getReadEmailsByPeriod({ ownerEmail: options.email, period: "week" }),
    getSentEmailsByPeriod({ ownerEmail: options.email, period: "week" }),
  ]);

  const allObject = keyBy(
    all.data.map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      All: d.count,
    })),
    "startOfPeriod"
  );
  const readUnreadGroups = groupBy(read.data, "read");
  const readObject = keyBy(
    readUnreadGroups["true"].map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Read: d.count,
    })),
    "startOfPeriod"
  );
  const unreadObject = keyBy(
    readUnreadGroups["false"].map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Unread: d.count,
    })),
    "startOfPeriod"
  );
  const sentObject = keyBy(
    sent.data.map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Sent: d.count,
    })),
    "startOfPeriod"
  );

  const merged = merge(allObject, readObject, unreadObject, sentObject);

  return { result: Object.values(merged) };
}

export const GET = withError(async () => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getStatsByPeriod({ email: session.user.email });

  return NextResponse.json(result);
});
