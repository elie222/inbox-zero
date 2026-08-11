import { describe, expect, it } from "vitest";
import { restoreThreadOrder } from "./thread-order";

describe("restoreThreadOrder", () => {
  it("uses a surviving neighbor when earlier threads were also removed", () => {
    expect(
      restoreThreadOrder(
        ["thread-3", "thread-4"],
        [
          {
            threadId: "thread-2",
            index: 1,
            threadOrder: ["thread-1", "thread-2", "thread-3", "thread-4"],
          },
        ],
      ),
    ).toEqual(["thread-2", "thread-3", "thread-4"]);
  });

  it("keeps input order when fallback positions are equal", () => {
    expect(
      restoreThreadOrder(
        ["thread-3"],
        [
          { threadId: "thread-1", index: 0 },
          { threadId: "thread-2", index: 0 },
        ],
      ),
    ).toEqual(["thread-1", "thread-2", "thread-3"]);
  });

  it("restores an adjacent run against the nearest surviving neighbors", () => {
    const threadOrder = [
      "thread-1",
      "thread-2",
      "thread-3",
      "thread-4",
      "thread-5",
    ];

    expect(
      restoreThreadOrder(
        ["thread-1", "thread-5"],
        [
          {
            threadId: "thread-3",
            index: 2,
            threadOrder,
          },
          {
            threadId: "thread-4",
            index: 3,
            threadOrder,
          },
        ],
      ),
    ).toEqual(["thread-1", "thread-3", "thread-4", "thread-5"]);
  });

  it("moves an earlier fallback with a later anchored run", () => {
    expect(
      restoreThreadOrder(
        ["thread-4"],
        [
          { threadId: "thread-2", index: 1 },
          {
            threadId: "thread-3",
            index: 2,
            threadOrder: ["thread-1", "thread-2", "thread-3", "thread-4"],
          },
        ],
      ),
    ).toEqual(["thread-2", "thread-3", "thread-4"]);
  });

  it("preserves recorded order for every partial batch restore", () => {
    const original = ["1", "2", "3", "4", "5"];

    for (
      let removedMask = 1;
      removedMask < 1 << original.length;
      removedMask++
    ) {
      const removed = original.filter(
        (_, index) => (removedMask & (1 << index)) !== 0,
      );
      const retained = original.filter(
        (threadId) => !removed.includes(threadId),
      );

      for (
        let restoreMask = 1;
        restoreMask < 1 << removed.length;
        restoreMask++
      ) {
        const restoring = removed.filter(
          (_, index) => (restoreMask & (1 << index)) !== 0,
        );
        const expected = original.filter(
          (threadId) =>
            retained.includes(threadId) || restoring.includes(threadId),
        );
        const entries = restoring.map((threadId) => {
          const index = original.indexOf(threadId);
          return {
            threadId,
            index,
            threadOrder: original,
          };
        });

        expect(restoreThreadOrder(retained, entries)).toEqual(expected);
      }
    }
  });
});
