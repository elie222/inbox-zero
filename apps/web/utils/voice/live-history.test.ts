import { describe, expect, it } from "vitest";
import { liveHistoryFromUiMessages } from "./live-history";

describe("liveHistoryFromUiMessages", () => {
  it("keeps recent user and assistant text and drops tool parts", () => {
    const history = liveHistoryFromUiMessages([
      { role: "user", parts: [{ type: "text", text: "Draft a reply" }] },
      {
        role: "assistant",
        parts: [
          { type: "tool-searchInbox", text: "ignored" },
          { type: "text", text: "Here is a draft." },
        ],
      },
      { role: "system", parts: [{ type: "text", text: "hidden" }] },
    ]);
    expect(history).toEqual([
      { role: "user", text: "Draft a reply" },
      { role: "assistant", text: "Here is a draft." },
    ]);
  });

  it("trims to the most recent messages when over the cap", () => {
    const history = liveHistoryFromUiMessages(
      [
        { role: "user", parts: [{ type: "text", text: "one" }] },
        { role: "assistant", parts: [{ type: "text", text: "two" }] },
        { role: "user", parts: [{ type: "text", text: "three" }] },
      ],
      { maxMessages: 2 },
    );
    expect(history.map((message) => message.text)).toEqual(["two", "three"]);
  });
});
