import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendMailboxSource } from "@inboxzero/mail-core/protocol/backend-adapter";
import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/identities";
import { createScopedLogger } from "@/utils/logger";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const getThread = vi.fn();

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
          emailProvider: { name: "google", getThread },
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

describe("POST /conversation-membership/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one adapter-readable result per conversation", async () => {
    getThread.mockImplementation(async (conversationId: string) => {
      if (conversationId === "c2") {
        throw Object.assign(new Error("not found"), { status: 404 });
      }
      return {
        historyId: "h1",
        messages: [
          {
            id: `m-${conversationId}`,
            threadId: conversationId,
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: conversationId,
          },
        ],
      };
    });

    const results = await routeBackedSource().readConversationMembershipBatch(
      batchInput(["c1", "c2"]),
    );

    expect(results).toMatchObject([
      {
        status: "ok",
        value: {
          status: "page",
          page: { keys: [{ accountId: "acc-1", messageId: "m-c1" }] },
        },
      },
      { status: "ok", value: { status: "not_found" } },
    ]);
  });

  it("passes a provider throttle through for every read it stopped", async () => {
    getThread.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        name: "ProviderRateLimitModeError",
        provider: "google",
      }),
    );

    const results = await routeBackedSource().readConversationMembershipBatch(
      batchInput(["c1", "c2"]),
    );

    expect(results).toMatchObject([
      { status: "paused", reason: "throttled" },
      { status: "paused", reason: "throttled" },
    ]);
  });

  it("rejects a read for another account", async () => {
    const response = await post({
      ...requestBody(["c1"]),
      reads: [
        {
          conversation: { accountId: "acc-2", conversationId: "c1" },
          resolutionId: "res-c1",
          page: null,
        },
      ],
    });

    expect(response.status).toBe(403);
    expect(getThread).not.toHaveBeenCalled();
  });

  it("rejects an unsupported protocol version", async () => {
    const response = await post({
      ...requestBody(["c1"]),
      protocolVersion: MAIL_PROTOCOL_VERSION + 1,
    });

    expect(response.status).toBe(409);
  });

  it("rejects an invalid payload", async () => {
    const response = await post({ ...requestBody(["c1"]), reads: [] });

    expect(response.status).toBe(400);
  });
});

function batchInput(conversationIds: string[]) {
  return {
    session: { accountId: "acc-1", generation: "g1" },
    requestId: "r1",
    signal: new AbortController().signal,
    pageSize: 100,
    reads: conversationIds.map((conversationId) => ({
      conversation: { accountId: "acc-1", conversationId },
      resolutionId: `res-${conversationId}`,
      page: null,
    })),
  };
}

function requestBody(conversationIds: string[]) {
  const { signal: _signal, ...body } = batchInput(conversationIds);
  return { ...body, protocolVersion: MAIL_PROTOCOL_VERSION };
}

function post(body: unknown, accountId = "acc-1") {
  return POST(
    new NextRequest(
      `http://localhost/api/mail/v1/accounts/${accountId}/conversation-membership/batch`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      },
    ),
    { params: Promise.resolve({ accountId }) } as never,
  );
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
      return { status: response.status, json: await response.json() };
    },
  });
}
