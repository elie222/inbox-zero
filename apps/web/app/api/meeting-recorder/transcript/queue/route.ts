import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { meetingRecorderTranscriptBody } from "../validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "meeting-recorder/transcript/queue",
  schema: meetingRecorderTranscriptBody,
  path: "/api/meeting-recorder/transcript",
  invalidPayloadMessage: "Invalid meeting recorder transcript queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({ recordingId: payload.recordingId }),
});
