import { describe, expect, it, vi } from "vitest";
import { submitConversationChanges } from "./submit-conversations";

describe("submitConversationChanges", () => {
  it("submits the whole selection as one command", async () => {
    const client = createClient();

    const { accepted } = await submitConversationChanges({
      accountId: "account",
      change: { kind: "archive" },
      client: client as never,
      conversationIds: ["one", "two", "two", "three"],
    });

    expect(client.submitConversations).toHaveBeenCalledTimes(1);
    expect(client.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        conversations: ["one", "two", "three"].map((conversationId) => ({
          accountId: "account",
          conversationId,
        })),
      }),
    );
    const commandId = client.submitConversations.mock.calls[0][0].commandId;
    expect(accepted).toEqual(
      ["one", "two", "three"].map((conversationId) => ({
        commandId,
        conversationId,
      })),
    );
  });

  it("splits selections larger than the engine's command limit", async () => {
    const client = createClient();
    const conversationIds = Array.from({ length: 501 }, (_, i) => `c${i}`);

    const { accepted } = await submitConversationChanges({
      accountId: "account",
      change: { kind: "archive" },
      client: client as never,
      conversationIds,
    });

    expect(
      client.submitConversations.mock.calls.map(
        ([command]) => command.conversations.length,
      ),
    ).toEqual([500, 1]);
    expect(accepted).toHaveLength(501);
  });

  it("reports a rejected command without accepting its conversations", async () => {
    const client = createClient();
    client.submitConversations.mockResolvedValue({
      status: "rejected",
      code: "queue_full",
    });

    const result = await submitConversationChanges({
      accountId: "account",
      change: { kind: "archive" },
      client: client as never,
      conversationIds: ["one", "two"],
    });

    expect(result).toEqual({ accepted: [], rejectionCodes: ["queue_full"] });
  });

  it("submits snoozes one conversation per command", async () => {
    const client = createClient();

    const { accepted } = await submitConversationChanges({
      accountId: "account",
      change: { kind: "snooze", untilMs: 1 },
      client: client as never,
      conversationIds: ["one", "two"],
    });

    expect(client.submitConversations).toHaveBeenCalledTimes(2);
    expect(new Set(accepted.map((item) => item.commandId)).size).toBe(2);
  });
});

function createClient() {
  return {
    getDiagnostics: vi.fn().mockResolvedValue({ revision: 4 }),
    submitConversations: vi.fn().mockResolvedValue({ status: "queued" }),
  };
}
