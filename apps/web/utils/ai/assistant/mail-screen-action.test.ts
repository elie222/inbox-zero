import { describe, expect, it } from "vitest";
import { parseMailScreenAction } from "@/utils/ai/assistant/mail-screen-action";

describe("parseMailScreenAction", () => {
  it("rejects actions missing the field they act on", () => {
    expect(parseMailScreenAction({ action: "select_threads" })).toEqual({
      error: "select_threads requires threadIds.",
    });
    expect(
      parseMailScreenAction({ action: "open_thread", threadIds: ["a", "b"] }),
    ).toEqual({ error: "open_thread requires exactly one threadId." });
    expect(parseMailScreenAction({ action: "search", query: null })).toEqual({
      error: "search requires a query.",
    });
  });

  it("normalizes valid actions for the screen", () => {
    expect(
      parseMailScreenAction({
        action: "select_threads",
        threadIds: ["a", "b", "a"],
        query: null,
      }),
    ).toEqual({ action: "select_threads", threadIds: ["a", "b"] });
    expect(
      parseMailScreenAction({ action: "open_thread", threadIds: ["a"] }),
    ).toEqual({ action: "open_thread", threadId: "a" });
  });
});
