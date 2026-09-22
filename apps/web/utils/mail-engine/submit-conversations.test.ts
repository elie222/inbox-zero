import { describe, expect, it, vi } from "vitest";
import { submitConversationChanges } from "./submit-conversations";

describe("submitConversationChanges", () => {
  it("skips rejected conversations and keeps accepted command ids", async () => {
    const client = {
      getDiagnostics: vi.fn().mockResolvedValue({ revision: 4 }),
      submitConversations: vi
        .fn()
        .mockResolvedValueOnce({ status: "queued" })
        .mockResolvedValueOnce({ status: "rejected" })
        .mockResolvedValueOnce({ status: "queued" }),
    };

    const accepted = await submitConversationChanges({
      accountId: "account",
      change: { kind: "archive" },
      client: client as never,
      conversationIds: ["one", "two", "three"],
    });

    expect(accepted).toEqual([
      { commandId: expect.any(String), conversationId: "one" },
      { commandId: expect.any(String), conversationId: "three" },
    ]);
    expect(client.submitConversations).toHaveBeenCalledTimes(3);
  });
});
