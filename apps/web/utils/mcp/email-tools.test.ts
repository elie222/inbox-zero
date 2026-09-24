import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { createTestLogger } from "@/__tests__/helpers";
import type { ParsedMessage } from "@/utils/types";
import {
  createDraftForMcp,
  readThreadForMcp,
  searchInboxForMcp,
} from "./email-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");
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
});
