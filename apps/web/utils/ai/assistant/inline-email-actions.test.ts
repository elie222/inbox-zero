import { describe, expect, it } from "vitest";
import {
  buildInlineEmailActionSystemMessage,
  mergeInlineEmailActions,
} from "./inline-email-actions";

describe("mergeInlineEmailActions", () => {
  it("dedupes thread IDs and lets archive override mark-read state", () => {
    const actions = mergeInlineEmailActions(
      [
        {
          type: "mark_read_threads",
          threadIds: ["thread-1", "thread-2", "thread-2"],
        },
      ],
      {
        type: "archive_threads",
        threadIds: ["thread-2", "thread-3"],
      },
    );

    expect(actions).toEqual([
      {
        type: "mark_read_threads",
        threadIds: ["thread-1"],
      },
      {
        type: "archive_threads",
        threadIds: ["thread-2", "thread-3"],
      },
    ]);
  });

  it("does not add mark-read state for threads that are already archived", () => {
    const actions = mergeInlineEmailActions(
      [
        {
          type: "archive_threads",
          threadIds: ["thread-1"],
        },
      ],
      {
        type: "mark_read_threads",
        threadIds: ["thread-1", "thread-2"],
      },
    );

    expect(actions).toEqual([
      {
        type: "archive_threads",
        threadIds: ["thread-1"],
      },
      {
        type: "mark_read_threads",
        threadIds: ["thread-2"],
      },
    ]);
  });

  it("caps merged thread IDs to the schema maximum", () => {
    const existingThreadIds = Array.from({ length: 150 }, (_, index) => {
      return `existing-${index}`;
    });
    const nextThreadIds = Array.from({ length: 150 }, (_, index) => {
      return `next-${index}`;
    });

    const actions = mergeInlineEmailActions(
      [
        {
          type: "archive_threads",
          threadIds: existingThreadIds,
        },
      ],
      {
        type: "archive_threads",
        threadIds: nextThreadIds,
      },
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].threadIds).toHaveLength(200);
    expect(actions[0].threadIds[0]).toBe("existing-100");
    expect(actions[0].threadIds[199]).toBe("next-149");
  });

  it("prioritizes newer archive thread IDs when the archive list is full", () => {
    const existingArchiveThreadIds = Array.from({ length: 200 }, (_, index) => {
      return `archive-${index}`;
    });

    const actions = mergeInlineEmailActions(
      [
        {
          type: "archive_threads",
          threadIds: existingArchiveThreadIds,
        },
        {
          type: "mark_read_threads",
          threadIds: ["mark-read-1"],
        },
      ],
      {
        type: "archive_threads",
        threadIds: ["mark-read-1"],
      },
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("archive_threads");
    expect(actions[0].threadIds).toHaveLength(200);
    expect(actions[0].threadIds).toContain("mark-read-1");
    expect(actions[0].threadIds).not.toContain("archive-0");
  });
});

describe("buildInlineEmailActionSystemMessage", () => {
  it("builds a single hidden context block for the assistant", () => {
    const message = buildInlineEmailActionSystemMessage([
      {
        type: "mark_read_threads",
        threadIds: ["thread-1", "thread-2"],
      },
      {
        type: "archive_threads",
        threadIds: ["thread-2", "thread-3"],
      },
    ]);

    expect(message).toContain(
      "Hidden UI state update from the user since the last visible message:",
    );
    expect(message).toContain("Archived threads (2): thread-2, thread-3");
    expect(message).toContain("Marked read threads (1): thread-1");
    expect(message).toContain(
      "These actions already succeeded in the UI. Treat them as authoritative current inbox state for this turn.",
    );
    expect(message).toContain(
      'If the user follows up with a short confirmation or acknowledgement about these same threads (for example "yes", "sure", "do it", or "thanks"), do not repeat the same archive or mark-read action that already happened in the UI unless they clearly request a different inbox action.',
    );
  });
});
