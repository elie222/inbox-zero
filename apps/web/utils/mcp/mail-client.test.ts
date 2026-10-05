import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import {
  browseMailForMcp,
  readMailForMcp,
  saveMailDraftForMcp,
  sendMailForMcp,
} from "./mail-client";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");
vi.mock("@/utils/mcp/account-selection");
vi.mock("@/utils/email/durable-email-send");
const account = {
  id: "account",
  email: "owner@example.com",
  name: null,
  provider: "google",
};
const logger = createTestLogger();
const editor = {
  emailAccountId: account.id,
  to: "recipient@example.com",
  subject: "Hello",
  body: "<script>untrusted</script>\nHello",
};
let testTime = Date.now();

describe("MCP mail client tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    testTime += 61_000;
    vi.setSystemTime(testTime);
    vi.mocked(resolveMcpEmailAccount).mockResolvedValue(account);
  });
  afterEach(() => vi.useRealTimers());
  it("never creates a provider when account ownership fails", async () => {
    vi.mocked(resolveMcpEmailAccount).mockRejectedValue(
      new Error("Account not found"),
    );
    await expect(
      browseMailForMcp(
        "user",
        { emailAccountId: "other-account", folder: "inbox" },
        logger,
      ),
    ).rejects.toThrow("Account not found");
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
  it("rejects an invalid recipient rather than silently dropping it", async () => {
    await expect(
      saveMailDraftForMcp(
        "user",
        { ...editor, to: "valid@example.com, invalid" },
        logger,
      ),
    ).rejects.toThrow("valid recipient");
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
  it("keeps provider pagination and list results body-free", async () => {
    const mail = getMockMessage({
      id: "message",
      threadId: "thread",
      textPlain: "private body",
    });
    const getThreadsWithQuery = vi.fn().mockResolvedValue({
      threads: [{ id: "thread", messages: [mail] }],
      nextPageToken: "next",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels: vi.fn().mockResolvedValue([]),
      getFolderCounts: vi.fn().mockResolvedValue([]),
      getThreadsWithQuery,
    } as never);
    const result = await browseMailForMcp(
      "user",
      { emailAccountId: account.id, folder: "sent", pageToken: "previous" },
      logger,
    );
    expect(result.nextPageToken).toBe("next");
    expect(result.threads[0].messages[0].body).toBe("");
    expect(getThreadsWithQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { type: "sent" },
        pageToken: "previous",
      }),
    );
  });
  it("searches the mailbox instead of returning the unfiltered folder", async () => {
    const mail = getMockMessage({ id: "match", threadId: "matching-thread" });
    const searchThreads = vi.fn().mockResolvedValue({
      threads: [{ id: "matching-thread", messages: [mail] }],
      nextPageToken: "next-search-page",
    });
    const getThreadsWithQuery = vi.fn().mockResolvedValue({ threads: [] });
    vi.mocked(createEmailProvider).mockResolvedValue({
      searchThreads,
      getThreadsWithQuery,
      getLabels: vi.fn().mockResolvedValue([]),
      getFolderCounts: vi.fn().mockResolvedValue([]),
    } as never);
    const result = await browseMailForMcp(
      "user",
      {
        emailAccountId: account.id,
        folder: "draft",
        query: 'subject:"test draft"',
        pageToken: "search-page",
      },
      logger,
    );
    expect(result.threads.map((thread) => thread.id)).toEqual([
      "matching-thread",
    ]);
    expect(result.nextPageToken).toBe("next-search-page");
    expect(searchThreads).toHaveBeenCalledWith({
      query: 'subject:"test draft"',
      pageToken: "search-page",
      maxResults: 25,
      messageFormat: "metadata",
    });
    expect(getThreadsWithQuery).not.toHaveBeenCalled();
  });
  it("returns provider labels and custom folders without duplicating system views", async () => {
    const getThreadsWithQuery = vi.fn().mockResolvedValue({ threads: [] });
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadsWithQuery,
      getLabels: vi.fn().mockResolvedValue([
        { id: "INBOX", name: "Inbox", type: "system" },
        { id: "clients", name: "Clients", type: "user" },
      ]),
      getFolderCounts: vi.fn().mockResolvedValue([
        { id: "INBOX", name: "Inbox", unread: 4, total: 8 },
        { id: "clients", name: "Clients", unread: 2, total: 5 },
        { id: "project-folder", name: "Projects", unread: 1, total: 3 },
      ]),
    } as never);
    const result = await browseMailForMcp(
      "user",
      { emailAccountId: account.id, folder: "clients" },
      logger,
    );
    expect(result.navigation.items).toEqual([
      { id: "clients", name: "Clients", kind: "label", unread: 2, total: 5 },
      {
        id: "project-folder",
        name: "Projects",
        kind: "folder",
        unread: 1,
        total: 3,
      },
    ]);
    expect(getThreadsWithQuery).toHaveBeenCalledWith(
      expect.objectContaining({ query: { labelId: "clients" } }),
    );
  });
  it("scopes custom Outlook folders without widening to the entire mailbox", async () => {
    const getThreadsWithQuery = vi.fn().mockResolvedValue({ threads: [] });
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadsWithQuery,
      getLabels: vi.fn().mockResolvedValue([]),
      getFolderCounts: vi
        .fn()
        .mockResolvedValue([
          { id: "projects", name: "Projects", total: 3, unread: 1 },
        ]),
    } as never);
    await browseMailForMcp(
      "user",
      { emailAccountId: account.id, folder: "projects", pageToken: "next" },
      logger,
    );
    expect(getThreadsWithQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { folderId: "projects" },
        pageToken: "next",
      }),
    );
    await expect(
      browseMailForMcp(
        "user",
        { emailAccountId: account.id, folder: "unknown-folder" },
        logger,
      ),
    ).rejects.toThrow("Folder is no longer available");
    expect(getThreadsWithQuery).toHaveBeenCalledTimes(1);
  });
  it("shares fresh navigation across concurrent page loads but rechecks ownership", async () => {
    const getLabels = vi.fn().mockResolvedValue([]);
    const getFolderCounts = vi.fn().mockResolvedValue([]);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadsWithQuery: vi.fn().mockResolvedValue({ threads: [] }),
      getLabels,
      getFolderCounts,
    } as never);
    const args = { emailAccountId: account.id, folder: "inbox" };
    await Promise.all([
      browseMailForMcp("user", args, logger),
      browseMailForMcp("user", { ...args, pageToken: "next" }, logger),
    ]);
    expect(getLabels).toHaveBeenCalledTimes(1);
    expect(getFolderCounts).toHaveBeenCalledTimes(1);
    expect(resolveMcpEmailAccount).toHaveBeenCalledTimes(2);
    testTime += 61_000;
    vi.setSystemTime(testTime);
    await browseMailForMcp("user", args, logger);
    expect(getLabels).toHaveBeenCalledTimes(2);
  });
  it("keeps mail available when sidebar metadata fails", async () => {
    const mail = getMockMessage({ id: "message", threadId: "thread" });
    const getLabels = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporarily unavailable"))
      .mockResolvedValue([]);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadsWithQuery: vi
        .fn()
        .mockResolvedValue({ threads: [{ id: "thread", messages: [mail] }] }),
      getLabels,
      getFolderCounts: vi.fn().mockResolvedValue([]),
    } as never);
    const result = await browseMailForMcp(
      "user",
      { emailAccountId: account.id, folder: "inbox" },
      logger,
    );
    expect(result.threads[0].id).toBe("thread");
    expect(result.navigation.unavailable).toBe(true);
    const recovered = await browseMailForMcp(
      "user",
      { emailAccountId: account.id, folder: "inbox" },
      logger,
    );
    expect(recovered.navigation.unavailable).toBe(false);
    expect(getLabels).toHaveBeenCalledTimes(2);
  });
  it("isolates navigation between users and refreshes it after a draft changes counts", async () => {
    const getLabels = vi.fn().mockResolvedValue([]);
    const getFolderCounts = vi.fn().mockResolvedValue([]);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadsWithQuery: vi.fn().mockResolvedValue({ threads: [] }),
      getLabels,
      getFolderCounts,
      createDraft: vi.fn().mockResolvedValue({ id: "new-draft" }),
    } as never);
    const args = { emailAccountId: account.id, folder: "inbox" };
    await browseMailForMcp("user", args, logger);
    await browseMailForMcp("other-user", args, logger);
    expect(getLabels).toHaveBeenCalledTimes(2);
    await saveMailDraftForMcp("user", editor, logger);
    await browseMailForMcp("user", args, logger);
    expect(getLabels).toHaveBeenCalledTimes(3);
  });
  it("resolves provider draft IDs instead of treating message IDs as drafts", async () => {
    const mail = getMockMessage({
      id: "message",
      threadId: "thread",
      labelIds: ["DRAFT"],
    });
    const getThread = vi
      .fn()
      .mockImplementation(async (_threadId, options) => ({
        id: "thread",
        messages: options?.includeDrafts ? [mail] : [],
      }));
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThread,
      getThreadMessages: vi.fn().mockResolvedValue([]),
      getDraftReferenceForMessage: vi
        .fn()
        .mockResolvedValue({ id: "provider-draft" }),
    } as never);
    const result = await readMailForMcp(
      "user",
      { emailAccountId: account.id, threadId: "thread" },
      logger,
    );
    expect(result.messages[0].draftId).toBe("provider-draft");
  });
  it("updates an existing draft without creating another, and escapes plain-text markup", async () => {
    const updateDraft = vi.fn();
    const createDraft = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      getDraft: vi.fn().mockResolvedValue({ id: "draft" }),
      updateDraft,
      createDraft,
    } as never);
    await saveMailDraftForMcp("user", { ...editor, draftId: "draft" }, logger);
    expect(createDraft).not.toHaveBeenCalled();
    expect(updateDraft.mock.calls[0][1].messageHtml).not.toContain("<script>");
  });
  it("derives reply headers from the authenticated mailbox and preserves the retry ID", async () => {
    const mail = getMockMessage({ id: "source", threadId: "thread" });
    const reply = {
      ...mail,
      headers: { ...mail.headers, "message-id": "<source@example.com>" },
    };
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn().mockResolvedValue(reply),
    } as never);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "already_applied",
      result: {},
    });
    const mutationId = "12345678-1234-4234-8234-123456789012";
    const result = await sendMailForMcp(
      "user",
      { ...editor, replyToMessageId: "source", mutationId, queuedAt: 123 },
      logger,
    );
    expect(result.status).toBe("already_applied");
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: account.id,
        input: expect.objectContaining({
          mutationId,
          threadId: "thread",
          email: expect.objectContaining({
            replyToEmail: expect.objectContaining({
              headerMessageId: "<source@example.com>",
              messageId: "source",
            }),
          }),
        }),
      }),
    );
  });
});
