import { describe, expect, it } from "vitest";
import { latestShownMessage } from "./latest-shown-message";

describe("latestShownMessage", () => {
  it("selects the last visible message instead of a hidden sending draft", () => {
    const received = { id: "received" };
    const draft = { id: "draft" };
    expect(latestShownMessage([received, draft], [draft.id])).toBe(received);
    expect(latestShownMessage([received, draft], [])).toBe(draft);
  });

  it("does not supply a hidden message when every message is hidden", () => {
    expect(latestShownMessage([{ id: "draft" }], ["draft"])).toBeUndefined();
    expect(latestShownMessage([], [])).toBeUndefined();
  });
});
