import type { Schedule } from "@/generated/prisma/client";
import { calculateNextScheduleDate } from "@/utils/schedule";

type DigestScheduleForProgression = Pick<
  Schedule,
  | "intervalDays"
  | "occurrences"
  | "daysOfWeek"
  | "timeOfDay"
  | "nextOccurrenceAt"
>;

export function isDigestScheduleDue(
  schedule: Pick<Schedule, "nextOccurrenceAt"> | null | undefined,
  now = new Date(),
): boolean {
  return !!schedule?.nextOccurrenceAt && schedule.nextOccurrenceAt <= now;
}

export function getDigestScheduleProgression(
  schedule: DigestScheduleForProgression,
  now = new Date(),
) {
  const lastOccurrenceAt =
    schedule.nextOccurrenceAt && schedule.nextOccurrenceAt <= now
      ? schedule.nextOccurrenceAt
      : now;

  return {
    lastOccurrenceAt,
    nextOccurrenceAt: calculateNextScheduleDate({
      ...schedule,
      lastOccurrenceAt,
    }),
  };
}
