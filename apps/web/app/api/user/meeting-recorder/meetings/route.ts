import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const PAGE_SIZE = 20;

export type GetMeetingRecorderMeetingsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder/meetings",
  async (request) => {
    const cursor = new URL(request.url).searchParams.get("cursor");

    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
      cursor,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  cursor,
}: {
  emailAccountId: string;
  cursor: string | null;
}) {
  // Scoped by emailAccountId so a recording shared with another tenant is only
  // ever reachable through this account's own Meeting row.
  const meetings = await prisma.meeting.findMany({
    where: { emailAccountId, recordingId: { not: null } },
    orderBy: { startTime: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      eventTitle: true,
      startTime: true,
      endTime: true,
      attendees: true,
      summary: true,
      followUpDraftId: true,
      recapSentAt: true,
      processingStatus: true,
      // The transcript is fetched per meeting; it is far too large to list.
      recording: {
        select: {
          status: true,
          failureReason: true,
        },
      },
    },
  });

  const hasMore = meetings.length > PAGE_SIZE;

  return {
    meetings: meetings.slice(0, PAGE_SIZE),
    nextCursor: hasMore ? meetings[PAGE_SIZE - 1]?.id : null,
  };
}
