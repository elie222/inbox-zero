import { describe, expect, it } from "vitest";
import { getDisplayedMessage } from "./displayed-message";

const sent = (id: string) => ({ id, labelIds: ["SENT"] });
const received = (id: string) => ({ id, labelIds: ["INBOX"] });
const archived = (id: string) => ({ id, labelIds: [] as string[] });

describe("getDisplayedMessage", () => {
  it("returns the last message for non-sent views", () => {
    const thread = { messages: [sent("a"), received("b")] };
    expect(getDisplayedMessage(thread, "inbox")?.id).toBe("b");
    expect(getDisplayedMessage(thread)?.id).toBe("b");
  });

  it("leads with the newest inbox message in the inbox view, not the chain tail", () => {
    // Older chain + the user's own reply follow the inbox message
    const thread = {
      messages: [archived("a"), received("b"), sent("c")],
    };
    expect(getDisplayedMessage(thread, "inbox")?.id).toBe("b");
  });

  it("falls back to the last message when nothing is in the inbox", () => {
    const thread = { messages: [archived("a"), sent("b")] };
    expect(getDisplayedMessage(thread, "inbox")?.id).toBe("b");
  });

  it("returns the user's last sent message in the sent view", () => {
    const thread = {
      messages: [sent("a"), received("b"), sent("c"), received("d")],
    };
    expect(getDisplayedMessage(thread, "sent")?.id).toBe("c");
  });

  it("falls back to the last message when no sent message exists", () => {
    const thread = { messages: [received("a"), received("b")] };
    expect(getDisplayedMessage(thread, "sent")?.id).toBe("b");
  });

  it("handles missing label ids", () => {
    const thread = { messages: [{ id: "a" }, { id: "b", labelIds: null }] };
    expect(getDisplayedMessage(thread, "sent")?.id).toBe("b");
  });

  it("returns undefined for empty threads", () => {
    expect(getDisplayedMessage({ messages: [] }, "sent")).toBeUndefined();
    expect(getDisplayedMessage({}, "inbox")).toBeUndefined();
  });
});
