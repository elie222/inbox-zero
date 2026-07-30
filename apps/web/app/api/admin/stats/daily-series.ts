export type DayCount = { day: string; count: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A dense day-by-day series for the signups chart.
 *
 * Postgres only returns days that have rows, so without filling the gaps a day
 * with no signups would vanish from the chart rather than reading zero.
 *
 * Everything here is UTC. The queries bucket with date_trunc, which has no
 * time zone conversion, so the series has to be generated and keyed in UTC
 * too — doing it in local time shifts every count onto the neighbouring day
 * west of UTC and drops the oldest bucket entirely. UTC also sidesteps DST,
 * where a local day is not always 24 hours long.
 */
export function buildDailySeries({
  from,
  to,
  users,
  mailboxes,
}: {
  from: Date;
  to: Date;
  users: DayCount[];
  mailboxes: DayCount[];
}) {
  const usersByDay = indexByDay(users);
  const mailboxesByDay = indexByDay(mailboxes);

  return eachUtcDay(from, to).map((day) => ({
    date: formatUtcDay(day),
    Users: usersByDay.get(day) ?? 0,
    Mailboxes: mailboxesByDay.get(day) ?? 0,
  }));
}

function indexByDay(rows: DayCount[]) {
  return new Map(rows.map((row) => [row.day, row.count]));
}

/** Inclusive list of `YYYY-MM-DD` UTC days. */
function eachUtcDay(from: Date, to: Date) {
  const days: string[] = [];
  const end = startOfUtcDay(to);

  for (let time = startOfUtcDay(from); time <= end; time += MS_PER_DAY) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }

  return days;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatUtcDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
