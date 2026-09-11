import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { meetingRecorderProcessBody } from "../validation";

export const maxDuration = 60;

export const POST = createForwardingQueueHandler({
  loggerScope: "meeting-recorder/process/queue",
  schema: meetingRecorderProcessBody,
  path: "/api/meeting-recorder/process",
  invalidPayloadMessage: "Invalid meeting recorder process queue payload",
  visibilityTimeoutSeconds: 55,
  getLoggerContext: (payload) => ({ meetingId: payload.meetingId }),
});
