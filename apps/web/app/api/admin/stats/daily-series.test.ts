import { describe, expect, it } from "vitest";
import { buildDailySeries } from "./daily-series";

const FROM = new Date("2026-07-01T00:00:00.000Z");
const TO = new Date("2026-07-03T23:59:59.000Z");

describe("buildDailySeries", () => {
  it("fills days that have no rows with zero", () => {
    const series = buildDailySeries({
      from: FROM,
      to: TO,
      users: [{ day: "2026-07-02", count: 4 }],
      mailboxes: [],
    });

    expect(series.map((point) => point.Users)).toEqual([0, 4, 0]);
    expect(series.map((point) => point.Mailboxes)).toEqual([0, 0, 0]);
  });

  // date_trunc buckets in UTC. Keying the generated series in local time put
  // every count on the wrong day west of UTC, and silently dropped the oldest
  // bucket because its key was never generated.
  it("keeps UTC buckets on their own day regardless of the machine's zone", () => {
    const series = buildDailySeries({
      from: FROM,
      to: TO,
      // 23:00 UTC on the 1st is still the 1st, even at UTC-5.
      users: [
        { day: "2026-07-01", count: 7 },
        { day: "2026-07-03", count: 2 },
      ],
      mailboxes: [],
    });

    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ date: "Jul 01, 2026", Users: 7 });
    expect(series[2]).toMatchObject({ date: "Jul 03, 2026", Users: 2 });
  });

  it("counts users and mailboxes independently on the same day", () => {
    const series = buildDailySeries({
      from: FROM,
      to: new Date("2026-07-01T12:00:00.000Z"),
      users: [{ day: "2026-07-01", count: 3 }],
      mailboxes: [{ day: "2026-07-01", count: 5 }],
    });

    expect(series).toEqual([{ date: "Jul 01, 2026", Users: 3, Mailboxes: 5 }]);
  });
});
