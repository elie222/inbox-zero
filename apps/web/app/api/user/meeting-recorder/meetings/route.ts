import { NextResponse } from "next/server";
import { RECORDED_SECTION_STATUSES } from "@/utils/meeting-recorder/recording-lifecycle";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const PAGE_SIZE = 20;

export type GetMeetingRecorderMeetingsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder/meetings",
  async (request) => {
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
    });

    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  // Scoped by emailAccountId so a recording shared with another tenant is only
  // ever reachable through this account's own Meeting row.
  const meetings = await prisma.meeting.findMany({
    where: {
      emailAccountId,
      endTime: { lte: new Date() },
      recording: { status: { in: RECORDED_SECTION_STATUSES } },
    },
    orderBy: { startTime: "desc" },
    take: PAGE_SIZE,
    // The summary and transcript are fetched per meeting; both are far too
    // large to list.
    select: {
      id: true,
      eventTitle: true,
      startTime: true,
      endTime: true,
      followUpDraftId: true,
      recording: {
        select: {
          status: true,
          failureReason: true,
        },
      },
    },
  });

  return { meetings };
}
