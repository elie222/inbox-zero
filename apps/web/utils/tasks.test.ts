import { describe, expect, it } from "vitest";
import {
  isTaskOpen,
  isTaskOverdue,
  nextFollowUpFrom,
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
