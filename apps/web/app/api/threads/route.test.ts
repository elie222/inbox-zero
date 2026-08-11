import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockGetThreadsWithQuery } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGetThreadsWithQuery: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-id" },
          emailProvider: { getThreadsWithQuery: mockGetThreadsWithQuery },
          logger: { error: vi.fn() },
        }),
      ),
}));

import { GET } from "./route";

function getMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-1",
    threadId: "thread-1",
    snippet: "snippet",
    subject: "Subject",
    date: "2024-01-01T00:00:00Z",
    internalDate: "1704067200000",
    labelIds: ["INBOX", "UNREAD"],
    headers: { from: "sender@example.com", date: "2024-01-01T00:00:00Z" },
    textHtml: "<p>body</p>",
    textPlain: "body",
    attachments: [{ attachmentId: "attachment-1" }],
    inline: [],
    historyId: "1",
    ...overrides,
  };
}

function getExecutedRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "executed-rule-1",
    messageId: "message-1",
    threadId: "thread-1",
    rule: { id: "rule-1", name: "Newsletter" },
    actionItems: [],
    status: "APPLIED",
    reason: "It's a newsletter",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GET /api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockGetThreadsWithQuery.mockResolvedValue({ threads: [] });
  });

  it("passes multiple label IDs to the email provider", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads?labelId=Label_123&labelIds=Label_123%2CINBOX&limit=100",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockGetThreadsWithQuery).toHaveBeenCalledWith({
      query: expect.objectContaining({
        labelId: "Label_123",
        labelIds: ["Label_123", "INBOX"],
        limit: 100,
      }),
      maxResults: 100,
      pageToken: undefined,
      messageFormat: "full",
    });
  });

  it("trims comma-separated and repeated label IDs", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads?labelIds=Label_123%2C%20INBOX&labelIds=%20STARRED%20&labelIds=%20",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockGetThreadsWithQuery).toHaveBeenCalledWith({
      query: expect.objectContaining({
        labelIds: ["Label_123", "INBOX", "STARRED"],
      }),
      maxResults: 50,
      pageToken: undefined,
      messageFormat: "full",
    });
  });

  describe("list view", () => {
    beforeEach(() => {
      mockGetThreadsWithQuery.mockResolvedValue({
        threads: [
          {
            id: "thread-1",
            snippet: "thread snippet",
            messages: [getMessage()],
          },
        ],
        nextPageToken: "next",
      });
      mockFindMany.mockResolvedValue([getExecutedRule()]);
    });

    it("returns message bodies and attachments by default", async () => {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads"),
      );
      const body = await response.json();

      expect(body.threads[0].messages[0]).toMatchObject({
        textHtml: "<p>body</p>",
        textPlain: "body",
        attachments: [{ attachmentId: "attachment-1" }],
      });
    });

    it("omits message bodies and attachments for view=list", async () => {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads?view=list"),
      );
      const body = await response.json();

      const [message] = body.threads[0].messages;
      expect(message).toEqual({
        id: "message-1",
        threadId: "thread-1",
        snippet: "snippet",
        subject: "Subject",
        date: "2024-01-01T00:00:00Z",
        internalDate: "1704067200000",
        labelIds: ["INBOX", "UNREAD"],
        headers: { from: "sender@example.com", date: "2024-01-01T00:00:00Z" },
      });
      expect(body.threads[0]).toMatchObject({
        id: "thread-1",
        snippet: "thread snippet",
      });
      expect(body.threads[0].plan.rule.name).toBe("Newsletter");
      expect(body.nextPageToken).toBe("next");
      expect(mockGetThreadsWithQuery).toHaveBeenCalledWith(
        expect.objectContaining({ messageFormat: "metadata" }),
      );
    });

    it("falls back to the full payload for an unknown view", async () => {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads?view=nonsense"),
      );
      const body = await response.json();

      expect(body.threads[0].messages[0].textHtml).toBe("<p>body</p>");
    });
  });

  describe("rule attribution", () => {
    it("returns every rule that fired on the thread", async () => {
      mockGetThreadsWithQuery.mockResolvedValue({
        threads: [{ id: "thread-1", snippet: "", messages: [getMessage()] }],
      });
      mockFindMany.mockResolvedValue([
        getExecutedRule({
          id: "executed-rule-2",
          messageId: "message-2",
          rule: { id: "rule-2", name: "Label as work" },
          reason: "Work related",
          createdAt: new Date("2024-01-02T00:00:00Z"),
        }),
        getExecutedRule(),
      ]);

      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads"),
      );
      const body = await response.json();

      expect(body.threads[0].plans).toHaveLength(2);
      expect(
        body.threads[0].plans.map((plan: { id: string }) => plan.id),
      ).toEqual(["executed-rule-2", "executed-rule-1"]);
      expect(body.threads[0].plans[0]).toMatchObject({
        rule: { id: "rule-2" },
        reason: "Work related",
        status: "APPLIED",
        actionItems: [],
      });
      // `plan` stays the single most recent execution for existing consumers
      expect(body.threads[0].plan.id).toBe("executed-rule-2");
    });

    it("keeps only the most recent execution of each rule", async () => {
      mockGetThreadsWithQuery.mockResolvedValue({
        threads: [{ id: "thread-1", snippet: "", messages: [getMessage()] }],
      });
      // Newest first, matching the route's `orderBy`
      mockFindMany.mockResolvedValue([
        getExecutedRule({
          id: "executed-rule-newest",
          messageId: "message-2",
          reason: "Latest reason",
          createdAt: new Date("2024-01-03T00:00:00Z"),
        }),
        getExecutedRule({ id: "executed-rule-oldest" }),
      ]);

      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads"),
      );
      const body = await response.json();

      expect(body.threads[0].plans).toHaveLength(1);
      expect(body.threads[0].plans[0]).toMatchObject({
        id: "executed-rule-newest",
        reason: "Latest reason",
      });
      expect(body.threads[0].plans[0].createdAt).toBeUndefined();
    });

    it("scopes executed rules to their own thread", async () => {
      mockGetThreadsWithQuery.mockResolvedValue({
        threads: [
          { id: "thread-1", snippet: "", messages: [getMessage()] },
          { id: "thread-2", snippet: "", messages: [getMessage()] },
        ],
      });
      mockFindMany.mockResolvedValue([
        getExecutedRule({ id: "executed-rule-2", threadId: "thread-2" }),
        getExecutedRule(),
      ]);

      const response = await GET(
        new NextRequest("http://localhost:3000/api/threads"),
      );
      const body = await response.json();

      expect(
        body.threads[0].plans.map((plan: { id: string }) => plan.id),
      ).toEqual(["executed-rule-1"]);
      expect(
        body.threads[1].plans.map((plan: { id: string }) => plan.id),
      ).toEqual(["executed-rule-2"]);
    });

    it("asks the database for the most recent executions first", async () => {
      await GET(new NextRequest("http://localhost:3000/api/threads"));

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      );
    });
  });
});
