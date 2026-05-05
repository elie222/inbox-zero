/**
 * Today's ET calendar date as a Date at UTC midnight.
 *
 * The DigestSend table's composite unique key (emailAccountId, date) uses this Date
 * as its idempotency anchor — calling the cron twice on the same ET day must produce
 * the same Date value so findUnique short-circuits the second call.
 *
 * DST-safe because Intl.DateTimeFormat handles the offset. Example: at
 * 2026-05-04T03:00:00Z (which is 2026-05-03 23:00 ET) this returns Date for
 * 2026-05-03 00:00:00Z.
 */
export function getTodayET(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function formatTodayHumanET(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}
