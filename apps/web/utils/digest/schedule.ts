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

  const nextOccurrenceAt = calculateNextScheduleDate({
    ...schedule,
    lastOccurrenceAt,
  });

  // A schedule that fell more than one interval behind (paused account,
  // lapsed plan, cron outage) would still be due after one step, and every
  // dispatch run would send another digest until it caught up. Skip ahead to
  // the first slot after now instead.
  if (nextOccurrenceAt && nextOccurrenceAt <= now) {
    return {
      lastOccurrenceAt,
      nextOccurrenceAt: calculateNextScheduleDate({
        ...schedule,
        lastOccurrenceAt: now,
      }),
    };
  }

  return { lastOccurrenceAt, nextOccurrenceAt };
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
