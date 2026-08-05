import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import {
  NO_RECORDING_STATUSES,
  RECORDED_SECTION_STATUSES,
} from "@/utils/meeting-recorder/recording-lifecycle";

type StatusBadge = {
  label: string;
  variant: "default" | "secondary" | "green" | "red";
};

// The recorder has reported no progress in these states, so during the meeting
// the event's own time window is fresher information than the status.
const NO_PROGRESS_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.PENDING,
  MeetingRecordingStatus.SCHEDULED,
];

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
    label: "In the call",
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

  if (
    start <= now &&
    now < end &&
    (!status || NO_PROGRESS_STATUSES.includes(status))
  ) {
    return { label: "Ongoing", variant: "green" };
  }

  if (end <= now && status) {
    if (!RECORDED_SECTION_STATUSES.includes(status)) return null;
    if (NO_RECORDING_STATUSES.includes(status)) {
      return { label: "Not recorded", variant: "red" };
    }
  }

  return status ? STATUS_BADGES[status] : null;
}
