import { MeetingRecordingStatus } from "@/generated/prisma/enums";

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

export function getRecordingStatusBadge(
  status: MeetingRecordingStatus | undefined,
): StatusBadge | null {
  return status ? STATUS_BADGES[status] : null;
}
