import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import {
  getGmailMailChangesPage,
  hydrateGmailMailMessages,
} from "@/utils/gmail/local-mail-sync";
import {
  getOutlookLocalMailMessage,
  getOutlookMailBackfillPage,
  getOutlookMailFolderChangesPage,
  resolveOutlookLocalMailFolderIds,
} from "@/utils/outlook/local-mail-sync";

vi.mock("@/utils/gmail/local-mail-sync");
vi.mock("@/utils/outlook/local-mail-sync");
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({ redis: {} }));
const logger = createTestLogger();
const gmail = new GmailProvider({} as never, logger, "account-1");
const outlook = new OutlookProvider({} as never, logger);
const context = { emailAccountId: "account-1" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOutlookLocalMailFolderIds).mockResolvedValue({
    drafts: "draft-folder",
    deleteditems: "trash-folder",
    junkemail: "spam-folder",
  });
});
describe("local mail provider adapters", () => {
  it("keeps historical Outlook metadata and exceptional body lookups in the background budget", async () => {
    vi.mocked(getOutlookMailFolderChangesPage).mockResolvedValue({
      resetRequired: true,
    });
    await outlook.syncLocalMail(
      {
        phase: "folder-changes",
        folderId: "folder",
        cursor: "next-initial-page",
        limit: 100,
        stream: "backfill",
      },
      context,
    );
    expect(getOutlookMailFolderChangesPage).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "backfill" }),
    );
    vi.mocked(getOutlookLocalMailMessage).mockResolvedValue({
      status: "notFound",
    });
    await outlook.syncLocalMail(
      { phase: "message-lookup", messageId: "message", stream: "backfill" },
      context,
    );
    expect(getOutlookLocalMailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "backfill" }),
    );
    await outlook.syncLocalMail(
      { phase: "message-lookup", messageId: "message", stream: "changes" },
      context,
    );
    expect(getOutlookLocalMailMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ priority: "current" }),
    );
  });

  it("exposes strategy and rejects unsupported operations without making provider calls", async () => {
    expect(gmail.localMailSyncStrategy).toBe("account-history");
    expect(outlook.localMailSyncStrategy).toBe("folder-delta");
    expect(
      await gmail.syncLocalMail({ phase: "folders", limit: 10 }, context),
    ).toEqual({ status: "unsupported", strategy: "account-history" });
    expect(
      await outlook.syncLocalMail(
        { phase: "history-baseline", after: 0 },
        context,
      ),
    ).toEqual({ status: "unsupported", strategy: "folder-delta" });
    expect(resolveOutlookLocalMailFolderIds).not.toHaveBeenCalled();
  });
  it("binds Gmail hydration to the provider account and maps stream priority", async () => {
    vi.mocked(hydrateGmailMailMessages).mockResolvedValue({
      messages: [],
      removedMessageIds: [],
      confirmedDeletedMessageIds: [],
    });
    await gmail.syncLocalMail(
      {
        phase: "history-hydrate",
        after: 0,
        messageIds: ["message"],
        stream: "changes",
      },
      context,
    );
    expect(hydrateGmailMailMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        priority: "current",
        after: new Date(0),
      }),
    );
    await expect(
      gmail.syncLocalMail(
        { phase: "capabilities" },
        { emailAccountId: "another-account" },
      ),
    ).rejects.toThrow("context mismatch");
  });
  it("preserves expired history as an explicit reconciliation signal", async () => {
    vi.mocked(getGmailMailChangesPage).mockResolvedValue({
      resetRequired: true,
    });
    expect(
      await gmail.syncLocalMail(
        { phase: "history-changes", after: 0, cursor: "opaque", limit: 10 },
        context,
      ),
    ).toEqual({ status: "reset-required", phase: "history-changes" });
  });
  it("uses server-resolved excluded folders and exact body ranges", async () => {
    vi.mocked(getOutlookMailBackfillPage).mockResolvedValue({
      resetRequired: false,
      messages: [],
      nextCursor: undefined,
    });
    await outlook.syncLocalMail(
      {
        phase: "folder-backfill",
        folderId: "archive-folder",
        after: -1000,
        before: 1000,
        limit: 10,
      },
      context,
    );
    expect(getOutlookMailBackfillPage).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        after: new Date(-1000),
        before: new Date(1000),
        folderIds: {
          drafts: "draft-folder",
          deleteditems: "trash-folder",
          junkemail: "spam-folder",
        },
      }),
    );
  });
  it("does not reinterpret folder removal membership or expired delta", async () => {
    vi.mocked(getOutlookMailFolderChangesPage).mockResolvedValue({
      resetRequired: true,
    });
    expect(
      await outlook.syncLocalMail(
        { phase: "folder-changes", folderId: "folder", limit: 10 },
        context,
      ),
    ).toEqual({ status: "reset-required", phase: "folder-changes" });
  });
});
