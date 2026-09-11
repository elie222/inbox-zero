import { NextResponse } from "next/server";
import { processMeetingForAccount } from "@/utils/meeting-recorder/process-meeting";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { meetingRecorderProcessBody } from "./validation";

export const maxDuration = 300;

export const POST = withError(
  "meeting-recorder/process",
  withQstashOrInternal(async (request) => {
    const { meetingId } = meetingRecorderProcessBody.parse(
      await request.json(),
    );

    await processMeetingForAccount({
      meetingId,
      logger: request.logger.with({ meetingId }),
    });

    return NextResponse.json({ ok: true });
  }),
);
