import { NextResponse } from "next/server";
import { format } from "date-fns";
import keyBy from "lodash/keyBy";
import groupBy from "lodash/groupBy";
import merge from "lodash/merge";
import {
  ZodPeriod,
  getEmailsByPeriod,
  getInboxEmailsByPeriod,
  getReadEmailsByPeriod,
  getSentEmailsByPeriod,
  zodPeriod,
} from "@inboxzero/tinybird";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";

export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByPeriod>>;

async function getStatsByPeriod(options: {
  ownerEmail: string;
  period: ZodPeriod;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  const [all, read, sent, inbox] = await Promise.all([
    getEmailsByPeriod(options),
    getReadEmailsByPeriod(options),
    getSentEmailsByPeriod(options),
    getInboxEmailsByPeriod(options),
  ]);

  const allObject = keyBy(
    all.data.map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      All: d.count,
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

  // read/unread
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

  // inbox/archived
  const inboxArchiveGroups = groupBy(inbox.data, "inbox");
  const inboxObject = keyBy(
    inboxArchiveGroups["true"].map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Inbox: d.count,
    })),
    "startOfPeriod"
  );
  const archiveObject = keyBy(
    inboxArchiveGroups["false"].map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Archive: d.count,
    })),
    "startOfPeriod"
  );

  const merged = merge(
    allObject,
    sentObject,
    readObject,
    unreadObject,
    inboxObject,
    archiveObject
  );

  return { result: Object.values(merged) };
}

export const GET = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const period = zodPeriod.parse(searchParams.get("period") || "week");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const result = await getStatsByPeriod({
    ownerEmail: session.user.email,
    period,
    fromDate: from,
    toDate: to,
  });

  return NextResponse.json(result);
});
