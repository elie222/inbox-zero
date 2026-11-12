import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import {
  CAPTURED_MEETING_STATUSES,
  NO_RECORDING_STATUSES,
} from "@/utils/meeting-recorder/recording-lifecycle";

type StatusBadge = {
  label: MessageDescriptor;
  variant: "default" | "secondary" | "green" | "red";
};

// Waiting-room and failure states are the ones users need to act on, so they
// are called out rather than folded into a generic "recording" state.
const STATUS_BADGES: Record<MeetingRecordingStatus, StatusBadge> = {
  [MeetingRecordingStatus.PENDING]: {
    label: msg`Scheduling`,
    variant: "secondary",
  },
  [MeetingRecordingStatus.SCHEDULED]: {
    label: msg`Scheduled`,
    variant: "secondary",
  },
  [MeetingRecordingStatus.CANCELLING]: {
    label: msg`Cancelling`,
    variant: "secondary",
  },
  [MeetingRecordingStatus.JOINING]: {
    label: msg`Joining`,
    variant: "secondary",
  },
  [MeetingRecordingStatus.IN_WAITING_ROOM]: {
    label: msg`Waiting to be let in`,
    variant: "default",
  },
  [MeetingRecordingStatus.IN_CALL]: {
    label: msg`Notetaker joined`,
    variant: "default",
  },
  [MeetingRecordingStatus.RECORDING]: {
    label: msg`Recording`,
    variant: "green",
  },
  [MeetingRecordingStatus.CALL_ENDED]: {
    label: msg`Processing`,
    variant: "secondary",
  },
  [MeetingRecordingStatus.DONE]: { label: msg`Recorded`, variant: "green" },
  [MeetingRecordingStatus.FAILED]: { label: msg`Failed`, variant: "red" },
  [MeetingRecordingStatus.CANCELLED]: {
    label: msg`Cancelled`,
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
      return { label: msg`Call in progress`, variant: "secondary" };
    }
    if (status === MeetingRecordingStatus.SCHEDULED) {
      return { label: msg`Waiting to join`, variant: "secondary" };
    }
  }

  if (end <= now && status && !CAPTURED_MEETING_STATUSES.includes(status)) {
    return NO_RECORDING_STATUSES.includes(status)
      ? { label: msg`Not recorded`, variant: "red" }
      : null;
  }

  return status ? STATUS_BADGES[status] : null;
}
