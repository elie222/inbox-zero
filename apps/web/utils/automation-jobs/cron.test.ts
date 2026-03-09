import { describe, expect, it } from "vitest";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "./cron";

describe("validateAutomationCronExpression", () => {
  it("accepts valid cron with weekday range", () => {
    expect(() => validateAutomationCronExpression("0 9 * * 1-5")).not.toThrow();
  });

  it("rejects cron with non-wildcard day-of-month", () => {
    expect(() => validateAutomationCronExpression("0 9 1 * *")).toThrow(
      "Automation cron supports wildcard day-of-month and month only",
    );
  });

  it("rejects cron with invalid step", () => {
    expect(() => validateAutomationCronExpression("*/0 9 * * *")).toThrow(
      "Invalid minute step: 0",
    );
  });

  it("rejects cron with multiple step delimiters", () => {
    expect(() => validateAutomationCronExpression("1/2/3 9 * * *")).toThrow(
      "Invalid minute token 1/2/3: too many step delimiters",
    );
  });

  it("rejects cron with multiple range delimiters", () => {
    expect(() => validateAutomationCronExpression("1-2-3 9 * * *")).toThrow(
      "Invalid minute token 1-2-3: too many range delimiters",
    );
  });
});

describe("getNextAutomationJobRunAt", () => {
  it("returns the next daily run in UTC", () => {
    const next = getNextAutomationJobRunAt({
      cronExpression: "0 9 * * *",
      fromDate: new Date("2026-02-17T08:15:00.000Z"),
    });

    expect(next.toISOString()).toBe("2026-02-17T09:00:00.000Z");
  });

  it("rolls to next day when run time already passed", () => {
    const next = getNextAutomationJobRunAt({
      cronExpression: "0 9 * * *",
      fromDate: new Date("2026-02-17T09:00:00.000Z"),
    });

    expect(next.toISOString()).toBe("2026-02-18T09:00:00.000Z");
  });

  it("handles weekday-only schedules", () => {
    const next = getNextAutomationJobRunAt({
      cronExpression: "30 14 * * 1-5",
      fromDate: new Date("2026-02-20T15:00:00.000Z"), // Friday
    });

    expect(next.toISOString()).toBe("2026-02-23T14:30:00.000Z"); // Monday
  });

  it("supports comma-separated values", () => {
    const next = getNextAutomationJobRunAt({
      cronExpression: "0,30 9,17 * * *",
      fromDate: new Date("2026-02-17T09:05:00.000Z"),
    });

    expect(next.toISOString()).toBe("2026-02-17T09:30:00.000Z");
  });

  it("treats day-of-week 7 as Sunday", () => {
    const next = getNextAutomationJobRunAt({
      cronExpression: "0 10 * * 7",
      fromDate: new Date("2026-02-18T10:00:00.000Z"), // Wednesday
    });

    expect(next.toISOString()).toBe("2026-02-22T10:00:00.000Z"); // Sunday
  });
});
