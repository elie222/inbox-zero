import { NextResponse } from "next/server";
import { format } from "date-fns";
import { z } from "zod";
import keyBy from "lodash/keyBy";
import groupBy from "lodash/groupBy";
import merge from "lodash/merge";
import sumBy from "lodash/sumBy";
import {
  getEmailsByPeriod,
  getInboxEmailsByPeriod,
  getReadEmailsByPeriod,
  getSentEmailsByPeriod,
  zodPeriod,
} from "@inboxzero/tinybird";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";

const statsByWeekParams = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type StatsByWeekParams = z.infer<typeof statsByWeekParams>;
export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByPeriod>>;

async function getStatsByPeriod(
  options: StatsByWeekParams & {
    ownerEmail: string;
  }
) {
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
    (readUnreadGroups["true"] || []).map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Read: d.count,
    })),
    "startOfPeriod"
  );
  const unreadObject = keyBy(
    (readUnreadGroups["false"] || []).map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Unread: d.count,
    })),
    "startOfPeriod"
  );

  // inbox/archived
  const inboxArchiveGroups = groupBy(inbox.data, "inbox");
  const inboxObject = keyBy(
    (inboxArchiveGroups["true"] || []).map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Unarchived: d.count,
    })),
    "startOfPeriod"
  );
  const archiveObject = keyBy(
    (inboxArchiveGroups["false"] || []).map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Archived: d.count,
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

  return {
    result: Object.values(merged),
    allCount: sumBy(all.data, "count"),
    inboxCount: sumBy(inboxArchiveGroups["true"], "count"),
    readCount: sumBy(readUnreadGroups["true"], "count"),
    sentCount: sumBy(sent.data, "count"),
  };
}

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const params = statsByWeekParams.parse({
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getStatsByPeriod({
    ownerEmail: session.user.email,
    ...params,
  });

  return NextResponse.json(result);
});
