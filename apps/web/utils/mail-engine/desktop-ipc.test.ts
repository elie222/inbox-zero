import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationQuery,
  MailPredicate,
} from "@inboxzero/mail-core/queries";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import {
  createDesktopIpcMailClient,
  startDesktopIpcMailClient,
} from "./desktop-ipc";

vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));

const invoke = vi.fn();
const subscribe = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue({
    startAuth: vi.fn(),
    mailEngine: invoke,
    mailEngineSubscribe: subscribe,
    mailEngineUnsubscribe: vi.fn().mockResolvedValue({ status: "ok" }),
    onMailEngineSnapshot: vi.fn(() => vi.fn()),
  });
});

describe("desktop split exclusions", () => {
  it.each([
    false,
    true,
  ])("sends supported predicates for mailbox rows and counts (conversation exclusions: %s)", async (supported) => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop) throw new Error("Expected desktop bridge");
    if (supported) {
      vi.mocked(getInboxZeroDesktopApp).mockReturnValue({
        ...desktop,
        supportsNoMatchingMessage: true,
      });
    }
    subscribe.mockResolvedValue({ status: "ok" });
    const client = createDesktopIpcMailClient();
    const splitPredicate = { kind: "read", value: false } as const;
    const query: ConversationQuery = {
      accountIds: ["test-account"],
      predicate: {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "no_matching_message", predicate: splitPredicate },
        ],
      },
      pageSize: 50,
      order: "newest_first",
      after: null,
    };
    const expectedPredicate: MailPredicate = {
      kind: "all",
      predicates: [
        { kind: "role", role: "inbox" },
        {
          kind: supported ? "no_matching_message" : "not",
          predicate: splitPredicate,
        },
      ],
    };
    if (!client.observeMailboxWindow)
      throw new Error("Expected mailbox window observer");
    client.observeMailboxWindow(query);
    client.observeMailboxCounts({
      accountIds: query.accountIds,
      targets: [{ id: "all", predicate: query.predicate }],
    });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: "observeMailboxWindow",
          payload: {
            query: { ...query, predicate: expectedPredicate },
            pageCount: 1,
          },
        }),
      }),
    );
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: "observeMailboxCounts",
          payload: {
            accountIds: query.accountIds,
            targets: [{ id: "all", predicate: expectedPredicate }],
          },
        }),
      }),
    );
    await client.close();
  });
});

describe("desktop IPC startup", () => {
  it("publishes the client before requesting sync, without waiting for sync", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const publish = vi.fn(async () => {
      expect(invoke).not.toHaveBeenCalled();
    });
    const startup = startDesktopIpcMailClient({
      provider: "google",
      accountId: "test-account",
      publish,
      onSyncError: vi.fn(),
    });
    expect(publish).toHaveBeenCalledOnce();
    await startup;
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "requestSync",
        payload: { accountIds: ["test-account"], provider: "google" },
      }),
    );
  });

  it("reports rejected sync without failing startup or withdrawing the client", async () => {
    const error = new Error("IPC disconnected");
    invoke.mockRejectedValue(error);
    const publish = vi.fn().mockResolvedValue(undefined);
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "microsoft",
        accountId: "test-account",
        publish,
        onSyncError,
      }),
    ).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledOnce();
    expect(onSyncError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("fails startup when client creation fails", async () => {
    vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
    const publish = vi.fn();
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "google",
        accountId: "test-account",
        publish,
        onSyncError,
      }),
    ).rejects.toThrow("Desktop mail engine IPC is unavailable");
    expect(publish).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("fails startup when publication fails, without requesting sync", async () => {
    const error = new Error("Publication failed");
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "google",
        accountId: "test-account",
        publish: vi.fn().mockRejectedValue(error),
        onSyncError,
      }),
    ).rejects.toBe(error);
    expect(invoke).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
  });
});
