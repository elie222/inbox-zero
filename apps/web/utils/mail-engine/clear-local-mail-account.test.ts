import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalMailAccountState } from "./clear-local-mail-account";

const account = vi.hoisted(() => ({
  drafts: vi.fn(),
  swr: vi.fn(),
  search: vi.fn(),
  archive: vi.fn(),
  trash: vi.fn(),
  read: vi.fn(),
  purge: vi.fn(),
  hasClient: true,
}));

vi.mock("@/utils/mail-engine/reply-drafts", () => ({
  clearLocalReplyDrafts: (emailAccountId: string) =>
    account.drafts(emailAccountId),
}));
vi.mock("@/utils/swr-persistence", () => ({
  clearPersistedSwrCacheForAccount: (emailAccountId: string) =>
    account.swr(emailAccountId),
}));
vi.mock("@/store/mail-search-history", () => ({
  clearRecentSearchHistoryForAccount: (emailAccountId: string) =>
    account.search(emailAccountId),
}));
vi.mock("@/store/archive-sender-queue", () => ({
  clearArchiveSenderStatuses: (emailAccountId: string) =>
    account.archive(emailAccountId),
}));
vi.mock("@/store/delete-sender-queue", () => ({
  clearDeleteSenderStatuses: (emailAccountId: string) =>
    account.trash(emailAccountId),
}));
vi.mock("@/store/mark-read-sender-queue", () => ({
  clearMarkReadSenderStatuses: (emailAccountId: string) =>
    account.read(emailAccountId),
}));
vi.mock("@/utils/mail-engine/active-client", () => ({
  getActiveMailClient: () =>
    account.hasClient
      ? {
          purgeAccount: (emailAccountId: string) =>
            account.purge(emailAccountId),
        }
      : null,
}));

describe("clearLocalMailAccountState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.hasClient = true;
    account.purge.mockResolvedValue({ databaseEpoch: "e", sequence: 1 });
  });

  it("clears account-scoped drafts, cache, search history, sender queues, and sqlite", async () => {
    await clearLocalMailAccountState("account-1");
    expect(account.drafts).toHaveBeenCalledWith("account-1");
    expect(account.swr).toHaveBeenCalledWith("account-1");
    expect(account.search).toHaveBeenCalledWith("account-1");
    expect(account.archive).toHaveBeenCalledWith("account-1");
    expect(account.trash).toHaveBeenCalledWith("account-1");
    expect(account.read).toHaveBeenCalledWith("account-1");
    expect(account.purge).toHaveBeenCalledWith("account-1");
  });

  it("throws when the mail engine is not ready", async () => {
    account.hasClient = false;
    await expect(clearLocalMailAccountState("account-1")).rejects.toThrow(
      "Mail engine is not ready to remove this mailbox.",
    );
    expect(account.purge).not.toHaveBeenCalled();
  });

  it("propagates a failed sqlite purge", async () => {
    account.purge.mockRejectedValue(new Error("worker_error"));
    await expect(clearLocalMailAccountState("account-1")).rejects.toThrow(
      "worker_error",
    );
  });
});
