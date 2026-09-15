import { describe, expect, it } from "vitest";
import { getReplyToEmailPayload } from "./reply-to-email-payload";

describe("getReplyToEmailPayload", () => {
  it("keeps the thread id when forwarding, so the forward stays in its thread", () => {
    expect(
      getReplyToEmailPayload({
        threadId: "thread-1",
        headerMessageId: undefined,
        references: "",
      }),
    ).toEqual({ threadId: "thread-1" });
  });

  it("sends the full threading metadata of a reply", () => {
    expect(
      getReplyToEmailPayload({
        threadId: "thread-1",
        headerMessageId: "<message-1@example.com>",
        references: "<root@example.com>",
        messageId: "message-1",
      }),
    ).toEqual({
      threadId: "thread-1",
      headerMessageId: "<message-1@example.com>",
      references: "<root@example.com>",
      messageId: "message-1",
    });
  });

  it.each([
    ["a new email", undefined],
    ["an email with no thread", { threadId: undefined }],
    ["a blank thread id", { threadId: "  " }],
  ])("sends no threading metadata for %s", (_description, replyingToEmail) => {
    expect(getReplyToEmailPayload(replyingToEmail)).toBeUndefined();
  });
});
