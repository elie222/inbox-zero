import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetMeetingRecorderMeetingResponse = Awaited<
  ReturnType<typeof getMeeting>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder/meeting",
  async (request, { params }) => {
    const { meetingId } = await params;

    const meeting = await getMeeting({
      meetingId,
      emailAccountId: request.auth.emailAccountId,
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(meeting);
  },
);

// Scoped by emailAccountId: recordings are shared between accounts, so the
// account's own Meeting row is the only way in.
async function getMeeting({
  meetingId,
  emailAccountId,
}: {
  meetingId: string;
  emailAccountId: string;
}) {
  return prisma.meeting.findFirst({
    where: { id: meetingId, emailAccountId },
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
      recording: {
        select: {
          status: true,
          failureReason: true,
          transcript: true,
        },
      },
    },
  });
}
