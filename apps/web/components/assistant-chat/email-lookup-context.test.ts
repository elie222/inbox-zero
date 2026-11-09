import { describe, expect, it } from "vitest";
import { collectToolThreadIds } from "@/components/assistant-chat/email-lookup-context";

describe("collectToolThreadIds", () => {
  it("collects thread IDs from successful tool outputs only", () => {
    const parts = [
      {
        type: "tool-searchInbox",
        state: "output-available",
        output: { messages: [{ threadId: "thread-1", messageId: "m-1" }] },
      },
      {
        type: "tool-moveThreadsToFolder",
        state: "output-available",
        output: { result: { threadIds: ["thread-2", "thread-3"] } },
      },
      {
        type: "tool-readEmail",
        state: "output-available",
        output: { error: "Failed to read email", threadId: "thread-bad" },
      },
      {
        type: "tool-readEmail",
        state: "input-available",
        input: { threadId: "thread-input" },
      },
      { type: "text", text: 'threadid="thread-text"' },
    ];

    const threadIds = collectToolThreadIds([{ parts }]);

    expect([...threadIds].sort()).toEqual(["thread-1", "thread-2", "thread-3"]);
  });
});
