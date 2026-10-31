import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendMailboxSource } from "@inboxzero/mail-core/protocol/backend-adapter";
import { createScopedLogger } from "@/utils/logger";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const getMessagesWithPagination = vi.fn();

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: { params: Promise<{ accountId: string }> },
      ) => Promise<Response>,
    ) =>
    (
      request: NextRequest,
      context: { params: Promise<{ accountId: string }> },
    ) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "acc-1", userId: "user-1" },
          emailProvider: {
            name: "microsoft",
            localMailSyncStrategy: "folder-delta",
            getMessagesWithPagination,
          },
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

describe("POST /enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an adapter-readable throttled envelope for source pauses", async () => {
    getMessagesWithPagination.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        name: "ProviderRateLimitModeError",
        provider: "microsoft",
      }),
    );
    const result = await routeBackedSource().enumerate(enumerationInput());
    expect(result).toEqual({
      status: "paused",
      reason: "throttled",
      retryAfterMs: 15_000,
    });
  });

  it("returns an adapter-readable blocked auth envelope for auth failures", async () => {
    getMessagesWithPagination.mockRejectedValue(new Error("401 unauthorized"));
    const result = await routeBackedSource().enumerate(enumerationInput());
    expect(result).toEqual({ status: "blocked_auth" });
  });

  it("syncs the rest of the page when one message cannot be represented", async () => {
    getMessagesWithPagination.mockResolvedValue({
      messages: [
        testMessage("x".repeat(300)),
        { ...testMessage("m-ok"), subject: "x".repeat(20_000) },
      ],
      nextPageToken: "next",
    });
    const result = await routeBackedSource().enumerate(enumerationInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.changes).toEqual([
      expect.objectContaining({
        key: { accountId: "acc-1", messageId: "m-ok" },
      }),
    ]);
    expect(result.value.bodies.map((body) => body.key.messageId)).toEqual([
      "m-ok",
    ]);
  });
});

function testMessage(id: string) {
  return {
    id,
    threadId: "t-1",
    historyId: "1",
    date: "2026-01-01T00:00:00.000Z",
    subject: "Hello",
    snippet: "Hi",
    labelIds: ["INBOX"],
    headers: { from: "ada@example.com", to: "", date: "" },
    textPlain: "Hi",
  };
}

function routeBackedSource() {
  return createBackendMailboxSource({
    accountId: "acc-1",
    async request(input) {
      const response = await POST(
        new NextRequest(`http://localhost${input.path}`, {
          method: input.method,
          body: input.body ? JSON.stringify(input.body) : undefined,
          headers: { "content-type": "application/json" },
          signal: input.signal,
        }),
        { params: Promise.resolve({ accountId: "acc-1" }) } as never,
      );
      return {
        status: response.status,
        json: await response.json(),
      };
    },
  });
}

function enumerationInput() {
  return {
    session: { accountId: "acc-1", generation: "g1" },
    requestId: "r-enumeration",
    bootstrapId: "mailbox",
    page: JSON.stringify({ scopeId: "primary" }),
    pageSize: 10,
    signal: new AbortController().signal,
  };
}
