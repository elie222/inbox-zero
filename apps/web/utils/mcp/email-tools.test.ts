import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookFolder } from "@/utils/outlook/folders";
import type { ParsedMessage } from "@/utils/types";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules-on-message";
import {
  createDraftForMcp,
  deleteFolderForMcp,
  labelThreadForMcp,
  listFoldersForMcp,
  readThreadForMcp,
  runRulesForMcp,
  searchInboxForMcp,
  updateThreadForMcp,
} from "./email-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");
vi.mock("@/utils/ai/choose-rule/run-rules-on-message", () => ({
  runRulesOnMessage: vi.fn(),
}));
vi.mock("@/utils/mcp/account-selection", () => ({
  resolveMcpEmailAccount: vi.fn(),
}));

const logger = createTestLogger();
const emailAccount = {
  id: "account_1",
  email: "owner@example.com",
  name: null,
  provider: "google",
};

function message(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    snippet: "Can we meet Thursday?",
    historyId: "",
    inline: [],
    headers: {
      from: "contact@example.com",
      to: "owner@example.com",
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    },
    subject: "Question",
    date: "2026-02-18T00:00:00.000Z",
    textPlain: "Can we meet Thursday about the contract?",
    ...overrides,
  };
}

describe("MCP email tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveMcpEmailAccount).mockResolvedValue(emailAccount);
  });

  it("returns search metadata without message bodies", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [message({ textPlain: "SECRET BODY" })],
      nextPageToken: "page-2",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      searchMessages,
    } as never);

    const result = await searchInboxForMcp({
      userId: "user_1",
      query: "from:contact@example.com",
      logger,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "from:contact@example.com",
      maxResults: 10,
      pageToken: undefined,
    });
    expect(result.hasMore).toBe(true);
    expect(result.messages[0]).toMatchObject({
      messageId: "message-1",
      threadId: "thread-1",
      snippet: "Can we meet Thursday?",
      from: "contact@example.com",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET BODY");
  });

  it("reads the latest messages in a thread", async () => {
    const getThreadMessages = vi.fn().mockResolvedValue([
      message({ id: "old", textPlain: "older" }),
      message({
        id: "new",
        textPlain: "latest question",
        snippet: "latest question",
      }),
    ]);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
    } as never);

    const result = await readThreadForMcp({
      userId: "user_1",
      threadId: "thread-1",
      maxMessages: 1,
      logger,
    });

    expect(result.truncated).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.messageId).toBe("new");
    expect(result.messages[0]?.content).toContain("latest question");
  });

  it("creates a mailbox draft and does not send", async () => {
    const createDraft = vi.fn().mockResolvedValue({ id: "draft-1" });
    const sendEmail = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      createDraft,
      sendEmail,
    } as never);

    const result = await createDraftForMcp({
      userId: "user_1",
      to: "contact@example.com",
      subject: "Thursday",
      body: "See you then.",
      logger,
    });

    expect(createDraft).toHaveBeenCalledWith({
      to: "contact@example.com",
      subject: "Thursday",
      messageHtml: "<p>See you then.</p>",
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      draftId: "draft-1",
      sent: false,
    });
  });

  it("drafts a reply inside the original thread when given a message id", async () => {
    const createDraft = vi.fn().mockResolvedValue({ id: "draft-2" });
    vi.mocked(createEmailProvider).mockResolvedValue({ createDraft } as never);

    const result = await createDraftForMcp({
      userId: "user_1",
      to: "contact@example.com",
      subject: "Re: Thursday",
      body: "Works for me.",
      replyToMessageId: "message-1",
      logger,
    });

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ replyToMessageId: "message-1" }),
    );
    expect(result).toMatchObject({
      draftId: "draft-2",
      replyToMessageId: "message-1",
      sent: false,
    });
  });

  it("archives a thread for the mailbox owner without deleting it", async () => {
    const archiveThread = vi.fn();
    const trashThread = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      archiveThread,
      trashThread,
    } as never);

    const result = await updateThreadForMcp({
      userId: "user_1",
      threadId: "thread-1",
      action: "archive",
      logger,
    });

    expect(archiveThread).toHaveBeenCalledWith("thread-1", "owner@example.com");
    expect(trashThread).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: "archive", applied: true });
  });

  it("marks a thread unread", async () => {
    const markReadThread = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      markReadThread,
    } as never);

    await updateThreadForMcp({
      userId: "user_1",
      threadId: "thread-1",
      action: "mark_unread",
      logger,
    });

    expect(markReadThread).toHaveBeenCalledWith("thread-1", false);
  });

  it("labels every message in the thread with an existing label", async () => {
    const labelMessage = vi.fn().mockResolvedValue({});
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName: vi.fn().mockResolvedValue({ id: "label-1", name: "FYI" }),
      getThreadMessages: vi
        .fn()
        .mockResolvedValue([message(), message({ id: "message-2" })]),
      labelMessage,
    } as never);

    await labelThreadForMcp({
      userId: "user_1",
      threadId: "thread-1",
      labelName: "FYI",
      logger,
    });

    expect(labelMessage).toHaveBeenCalledTimes(2);
    expect(labelMessage).toHaveBeenCalledWith({
      messageId: "message-2",
      labelId: "label-1",
      labelName: "FYI",
    });
  });

  it("does not create a label that does not exist and lists the real ones", async () => {
    const createLabel = vi.fn();
    const labelMessage = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName: vi.fn().mockResolvedValue(null),
      getLabels: vi.fn().mockResolvedValue([{ id: "l1", name: "Newsletter" }]),
      createLabel,
      labelMessage,
    } as never);

    await expect(
      labelThreadForMcp({
        userId: "user_1",
        threadId: "thread-1",
        labelName: "Invented",
        logger,
      }),
    ).rejects.toThrow("Newsletter");
    expect(createLabel).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("previews rules without applying them unless asked", async () => {
    vi.mocked(runRulesOnMessage).mockResolvedValue([
      {
        rule: { name: "Newsletter" },
        reason: "Bulk sender",
        status: "SKIPPED",
        actionItems: [{ type: "ARCHIVE", label: null, folderName: null }],
      },
    ] as never);

    const result = await runRulesForMcp({
      userId: "user_1",
      messageId: "message-1",
      apply: false,
      logger,
    });

    expect(runRulesOnMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account_1",
        messageId: "message-1",
        isTest: true,
      }),
    );
    expect(result).toMatchObject({
      preview: true,
      results: [{ ruleName: "Newsletter", actions: [{ type: "ARCHIVE" }] }],
    });
  });

  describe("folders", () => {
    const outlookAccount = { ...emailAccount, provider: "microsoft" };
    const folderTree = [
      folder({ id: "inbox", displayName: "Inbox", systemType: "INBOX" }),
      folder({
        id: "projects",
        displayName: "Projects",
        childFolderCount: 1,
        childFolders: [folder({ id: "old", displayName: "Old" })],
      }),
      folder({ id: "receipts", displayName: "Receipts", totalItemCount: 3 }),
    ];

    function mockOutlook() {
      const deleteFolder = vi.fn().mockResolvedValue(undefined);
      vi.mocked(resolveMcpEmailAccount).mockResolvedValue(outlookAccount);
      vi.mocked(createEmailProvider).mockResolvedValue({
        getFolders: vi.fn().mockResolvedValue(folderTree),
        deleteFolder,
      } as never);
      return { deleteFolder };
    }

    it("lists nested folders and marks only empty custom folders deletable", async () => {
      mockOutlook();

      const result = await listFoldersForMcp({ userId: "user_1", logger });

      expect(result.folders).toEqual([
        expect.objectContaining({ folderId: "inbox", canDelete: false }),
        expect.objectContaining({
          folderId: "projects",
          subfolders: 1,
          canDelete: false,
        }),
        expect.objectContaining({
          folderId: "old",
          path: "Projects ⦙ Old",
          canDelete: true,
        }),
        expect.objectContaining({
          folderId: "receipts",
          total: 3,
          canDelete: false,
        }),
      ]);
    });

    it.each([
      ["a system folder", "inbox", "system folder"],
      ["a folder that still holds mail", "receipts", "3 emails"],
      ["a folder with subfolders", "projects", "1 subfolder"],
      ["an unknown folder", "missing", "list_folders"],
    ])("refuses to delete %s", async (_case, folderId, message) => {
      const { deleteFolder } = mockOutlook();

      await expect(
        deleteFolderForMcp({ userId: "user_1", folderId, logger }),
      ).rejects.toThrow(message);
      expect(deleteFolder).not.toHaveBeenCalled();
    });

    it("deletes an empty custom folder", async () => {
      const { deleteFolder } = mockOutlook();

      const result = await deleteFolderForMcp({
        userId: "user_1",
        folderId: "old",
        logger,
      });

      expect(deleteFolder).toHaveBeenCalledWith("old");
      expect(result).toMatchObject({ path: "Projects ⦙ Old", deleted: true });
    });

    it("refuses Gmail accounts before touching the mailbox", async () => {
      await expect(
        deleteFolderForMcp({ userId: "user_1", folderId: "old", logger }),
      ).rejects.toThrow("Outlook");
      expect(createEmailProvider).not.toHaveBeenCalled();
    });
  });
});

function folder(overrides: Partial<OutlookFolder> = {}): OutlookFolder {
  return {
    id: "folder",
    displayName: "Folder",
    childFolders: [],
    childFolderCount: 0,
    totalItemCount: 0,
    unreadItemCount: 0,
    ...overrides,
  };
}
