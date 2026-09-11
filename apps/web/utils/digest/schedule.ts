import type { Schedule } from "@/generated/prisma/client";
import { calculateNextScheduleDate } from "@/utils/schedule";

export const DIGEST_DISPATCH_INTERVAL_MINUTES = 5;

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

export function getEstimatedDigestDeliveryAt(
  nextOccurrenceAt: Date | null | undefined,
): Date | null {
  if (!nextOccurrenceAt) return null;

  const dispatchIntervalMs = DIGEST_DISPATCH_INTERVAL_MINUTES * 60 * 1000;

  return new Date(
    Math.ceil(nextOccurrenceAt.getTime() / dispatchIntervalMs) *
      dispatchIntervalMs,
  );
}
