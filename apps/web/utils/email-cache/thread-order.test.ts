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
            previousThreadId: "thread-1",
            nextThreadId: "thread-3",
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
});
