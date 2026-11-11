import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  describeCronExpression,
  type NamedCronWeekdays,
  parseCronSchedule,
} from "@/utils/automation-jobs/describe";

// describeCronSchedule in utils/automation-jobs/describe also feeds the AI
// assistant, so it stays English and the UI uses this translated copy.
// Custom weekday sets and unusual crons still come from cronstrue in English.
export function describeCronScheduleText(
  cronExpression: string,
  i18n: I18n,
): string {
  const schedule = parseCronSchedule(cronExpression, i18n.locale);
  if (!schedule) return describeCronExpression(cronExpression);

  const days =
    schedule.weekdays.kind === "custom"
      ? schedule.weekdays.text
      : i18n._(WEEKDAY_MESSAGES[schedule.weekdays.kind]);
  const { localTimes, timeZoneName } = schedule;
  const lastTime = localTimes[localTimes.length - 1];
  const leadingTimes = localTimes.slice(0, -1).join(", ");
  const times =
    localTimes.length === 1
      ? lastTime
      : i18n._(msg`${leadingTimes} and ${lastTime}`);

  return i18n._(msg`${days} at ${times} ${timeZoneName}`);
}

const WEEKDAY_MESSAGES: Record<NamedCronWeekdays, MessageDescriptor> = {
  everyDay: msg`Every day`,
  weekdays: msg`Weekdays`,
  weekends: msg`Weekends`,
};
