import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { discardMailboxDraft } from "./discard-mailbox-draft";

const { discardComposeDraftAction } = vi.hoisted(() => ({
  discardComposeDraftAction: vi.fn(),
}));

vi.mock("@/utils/actions/mail", () => ({ discardComposeDraftAction }));

describe("discardMailboxDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discardComposeDraftAction.mockResolvedValue({ data: { success: true } });
  });

  it("hides the mailbox copies through the engine without calling the server", async () => {
    const client = engineClient({ status: "queued" });

    await discardMailboxDraft({
      client,
      emailAccountId: "account",
      messageIds: ["m1", "m2"],
      draftId: "d1",
    });

    expect(client.submitMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          { accountId: "account", messageId: "m1" },
          { accountId: "account", messageId: "m2" },
        ],
        change: { kind: "discard_draft", draftId: "d1" },
      }),
    );
    expect(discardComposeDraftAction).not.toHaveBeenCalled();
  });

  it("deletes the provider draft directly when the engine refuses, then syncs", async () => {
    const client = engineClient({ status: "rejected", code: "queue_full" });

    await discardMailboxDraft({
      client,
      emailAccountId: "account",
      messageIds: ["m1"],
      draftId: "d1",
    });

    expect(discardComposeDraftAction).toHaveBeenCalledWith("account", {
      draftId: "d1",
    });
    expect(client.requestSync).toHaveBeenCalledWith(["account"]);
  });

  it("deletes the provider draft directly without the engine", async () => {
    await discardMailboxDraft({
      client: null,
      emailAccountId: "account",
      messageIds: ["m1"],
      draftId: "d1",
    });

    expect(discardComposeDraftAction).toHaveBeenCalledWith("account", {
      draftId: "d1",
    });
  });

  it("fails when there is neither an engine nor a provider draft to delete", async () => {
    await expect(
      discardMailboxDraft({
        client: null,
        emailAccountId: "account",
        messageIds: ["m1"],
      }),
    ).rejects.toThrow("Failed to discard draft");
  });
});

function engineClient(admission: { status: string; code?: string }) {
  return {
    submitMetadata: vi.fn(async () => admission),
    requestSync: vi.fn(async () => {}),
  } as unknown as MailClient & {
    submitMetadata: ReturnType<typeof vi.fn>;
    requestSync: ReturnType<typeof vi.fn>;
  };
}
