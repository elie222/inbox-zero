import { describe, expect, it } from "vitest";
import {
  formatRelativeShort,
  isTaskOpen,
  isTaskOverdue,
  nextFollowUpFrom,
  taskDueBucket,
  type TaskListItem,
} from "@/utils/tasks";

const NOW = new Date("2026-07-25T12:00:00Z");

describe("isTaskOpen", () => {
  it("open for TODO/IN_PROGRESS/BLOCKED, closed for DONE/CANCELLED", () => {
    expect(isTaskOpen("TODO")).toBe(true);
    expect(isTaskOpen("IN_PROGRESS")).toBe(true);
    expect(isTaskOpen("BLOCKED")).toBe(true);
    expect(isTaskOpen("DONE")).toBe(false);
    expect(isTaskOpen("CANCELLED")).toBe(false);
  });
});

describe("isTaskOverdue", () => {
  const task = (
    overrides: Partial<Pick<TaskListItem, "status" | "dueAt">>,
  ): Pick<TaskListItem, "status" | "dueAt"> => ({
    status: "TODO",
    dueAt: null,
    ...overrides,
  });

  it("overdue only when open and past due", () => {
    expect(
      isTaskOverdue(task({ dueAt: new Date("2026-07-24T12:00:00Z") }), NOW),
    ).toBe(true);
    expect(
      isTaskOverdue(task({ dueAt: new Date("2026-07-26T12:00:00Z") }), NOW),
    ).toBe(false);
    // Past due but already done → not overdue
    expect(
      isTaskOverdue(
        task({ status: "DONE", dueAt: new Date("2026-07-24T12:00:00Z") }),
        NOW,
      ),
    ).toBe(false);
    // No due date → never overdue
    expect(isTaskOverdue(task({ dueAt: null }), NOW)).toBe(false);
  });
});

describe("nextFollowUpFrom", () => {
  it("adds the cadence in days", () => {
    expect(nextFollowUpFrom(3, NOW).toISOString()).toBe(
      "2026-07-28T12:00:00.000Z",
    );
  });
});

describe("taskDueBucket", () => {
  const inHours = (hours: number) =>
    new Date(NOW.getTime() + hours * 60 * 60 * 1000);

  it("closed tasks land in done regardless of due date", () => {
    expect(taskDueBucket({ status: "DONE", dueAt: inHours(-48) }, NOW)).toBe(
      "done",
    );
    expect(taskDueBucket({ status: "CANCELLED", dueAt: null }, NOW)).toBe(
      "done",
    );
  });

  it("open past-due tasks are overdue", () => {
    expect(taskDueBucket({ status: "TODO", dueAt: inHours(-1) }, NOW)).toBe(
      "overdue",
    );
  });

  it("splits future due dates at 18h / 42h / 7d", () => {
    expect(taskDueBucket({ status: "TODO", dueAt: inHours(3) }, NOW)).toBe(
      "today",
    );
    expect(taskDueBucket({ status: "TODO", dueAt: inHours(24) }, NOW)).toBe(
      "tomorrow",
    );
    expect(taskDueBucket({ status: "TODO", dueAt: inHours(96) }, NOW)).toBe(
      "week",
    );
    expect(
      taskDueBucket({ status: "TODO", dueAt: inHours(24 * 10) }, NOW),
    ).toBe("later");
  });

  it("no due date buckets separately", () => {
    expect(taskDueBucket({ status: "IN_PROGRESS", dueAt: null }, NOW)).toBe(
      "nodue",
    );
  });
});

describe("formatRelativeShort", () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms);

  it("uses minutes under an hour, hours under 36h, days beyond", () => {
    expect(formatRelativeShort(at(20 * 60 * 1000), NOW)).toBe("in 20m");
    expect(formatRelativeShort(at(3 * 60 * 60 * 1000), NOW)).toBe("in 3h");
    expect(formatRelativeShort(at(4 * 24 * 60 * 60 * 1000), NOW)).toBe("in 4d");
  });

  it("marks past times with ago", () => {
    expect(formatRelativeShort(at(-2 * 24 * 60 * 60 * 1000), NOW)).toBe(
      "2d ago",
    );
    expect(formatRelativeShort(at(-5 * 60 * 1000), NOW)).toBe("5m ago");
  });
});
