import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendMailboxSource } from "@inboxzero/mail-core/protocol/backend-adapter";
import { createScopedLogger } from "@/utils/logger";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const getMailboxSyncPage = vi.fn();

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
            getMailboxSyncPage,
          },
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

describe("POST /changes/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one adapter-readable result per folder", async () => {
    getMailboxSyncPage.mockImplementation(
      async ({ folderId }: { folderId: string }) => {
        if (folderId === "archive") {
          throw Object.assign(new Error("rate limited"), {
            name: "ProviderRateLimitModeError",
            provider: "microsoft",
          });
        }
        return {
          cursor: `${folderId}-next`,
          reset: false,
          upsertedMessages: [],
          deletedMessageIds: [],
          removedMessageIds: [],
          hasMore: false,
        };
      },
    );

    const results = await routeBackedSource().readChangesBatch({
      session: { accountId: "acc-1", generation: "g1" },
      reads: ["inbox", "archive"].map((streamId, index) => ({
        requestId: `r${index}`,
        position: { streamId, generation: "g1", checkpoint: "cursor" },
      })),
      pageSize: 20,
      signal: new AbortController().signal,
    });

    expect(results).toMatchObject([
      {
        status: "page",
        page: { requestId: "r0", to: { checkpoint: "inbox-next" } },
      },
      { status: "paused", reason: "throttled" },
    ]);
  });
});

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
