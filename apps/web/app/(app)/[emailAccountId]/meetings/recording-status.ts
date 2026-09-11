import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import {
  CAPTURED_MEETING_STATUSES,
  NO_RECORDING_STATUSES,
} from "@/utils/meeting-recorder/recording-lifecycle";

type StatusBadge = {
  label: string;
  variant: "default" | "secondary" | "green" | "red";
};

// Waiting-room and failure states are the ones users need to act on, so they
// are called out rather than folded into a generic "recording" state.
const STATUS_BADGES: Record<MeetingRecordingStatus, StatusBadge> = {
  [MeetingRecordingStatus.PENDING]: {
    label: "Scheduling",
    variant: "secondary",
  },
  [MeetingRecordingStatus.SCHEDULED]: {
    label: "Scheduled",
    variant: "secondary",
  },
  [MeetingRecordingStatus.CANCELLING]: {
    label: "Cancelling",
    variant: "secondary",
  },
  [MeetingRecordingStatus.JOINING]: { label: "Joining", variant: "secondary" },
  [MeetingRecordingStatus.IN_WAITING_ROOM]: {
    label: "Waiting to be let in",
    variant: "default",
  },
  [MeetingRecordingStatus.IN_CALL]: {
    label: "Notetaker joined",
    variant: "default",
  },
  [MeetingRecordingStatus.RECORDING]: { label: "Recording", variant: "green" },
  [MeetingRecordingStatus.CALL_ENDED]: {
    label: "Processing",
    variant: "secondary",
  },
  [MeetingRecordingStatus.DONE]: { label: "Recorded", variant: "green" },
  [MeetingRecordingStatus.FAILED]: { label: "Failed", variant: "red" },
  [MeetingRecordingStatus.CANCELLED]: {
    label: "Cancelled",
    variant: "secondary",
  },
};

export function getRecordingStatusBadge({
  status,
  startTime,
  endTime,
  now = new Date(),
}: {
  status: MeetingRecordingStatus | undefined;
  startTime: string | Date;
  endTime: string | Date;
  now?: Date;
}): StatusBadge | null {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start <= now && now < end) {
    if (!status) {
      return { label: "Call in progress", variant: "secondary" };
    }
    if (status === MeetingRecordingStatus.SCHEDULED) {
      return { label: "Waiting to join", variant: "secondary" };
    }
  }

  if (end <= now && status && !CAPTURED_MEETING_STATUSES.includes(status)) {
    return NO_RECORDING_STATUSES.includes(status)
      ? { label: "Not recorded", variant: "red" }
      : null;
  }

  return status ? STATUS_BADGES[status] : null;
}
