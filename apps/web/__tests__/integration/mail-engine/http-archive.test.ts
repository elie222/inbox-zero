import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import {
  createBackendMailboxSource,
  createBackendOperationExecutor,
  type MailHttpRequestFn,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import { createNodeSqliteDriver } from "@inboxzero/mail-sqlite/node";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
} from "@/__tests__/integration/helpers";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));
vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

const harnessState = vi.hoisted(() => ({
  provider: null as EmailProvider | null,
  accountId: "email-account-1",
  email: "user@example.com",
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return {
    // The operations route's cancel handler, which these tests never call.
    withEmailAccount: () => async () => new Response(null, { status: 501 }),
    withEmailProvider: (
      scopeOrHandler: string | ((...args: never[]) => unknown),
      handler?: (...args: never[]) => unknown,
    ) => {
      const wrapped =
        typeof scopeOrHandler === "string" ? handler! : scopeOrHandler;
      return async (request: Request, context: unknown) => {
        const { withEmailProvider } = createWithEmailProviderTestMiddleware(
          harnessState.provider,
          {
            auth: {
              userId: "user-1",
              emailAccountId: harnessState.accountId,
              email: harnessState.email,
            },
          },
        );
        return withEmailProvider(wrapped as never)(request, context);
      };
    },
  };
});

import { GET as getCapabilities } from "@/app/api/mail/v1/accounts/[accountId]/capabilities/route";
import { POST as postScopes } from "@/app/api/mail/v1/accounts/[accountId]/scopes/route";
import { POST as postBootstrap } from "@/app/api/mail/v1/accounts/[accountId]/bootstrap/route";
import { POST as postEnumeration } from "@/app/api/mail/v1/accounts/[accountId]/enumeration/route";
import { POST as postChanges } from "@/app/api/mail/v1/accounts/[accountId]/changes/route";
import { POST as postHydration } from "@/app/api/mail/v1/accounts/[accountId]/hydration/route";
import { POST as postMembership } from "@/app/api/mail/v1/accounts/[accountId]/conversation-membership/route";
import {
  GET as getOperation,
  PUT as putOperation,
} from "@/app/api/mail/v1/accounts/[accountId]/operations/[commandId]/route";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const inboxQuery = (accountId: string) => ({
  accountIds: [accountId],
  predicate: { kind: "role" as const, role: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 25,
  after: null,
});
const unreadInboxQuery = (accountId: string) => ({
  ...inboxQuery(accountId),
  predicate: {
    kind: "all" as const,
    predicates: [
      { kind: "role" as const, role: "inbox" as const },
      { kind: "read" as const, value: false },
    ],
  },
});

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "mail engine HTTP-mediated archive slice",
  { timeout: 60_000 },
  () => {
    it("archives Gmail mail through /api/mail/v1 into real SQLite", async () => {
      const email = "engine-gmail-http@example.com";
      const accountId = "gmail-http-engine";
      const harness = await createGmailTestHarness({
        email,
        messages: [
          {
            id: "g-keep-http",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Keep me",
            body_text: "Stay",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now()}`,
          },
          {
            id: "g-archive-http",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Archive me",
            body_text: "Go",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now() - 1000}`,
          },
        ],
      });
      try {
        const result = await runHttpArchiveSlice({
          accountId,
          email,
          provider: harness.provider,
          archiveMessageId: "g-archive-http",
        });
        expect(result.beforeInbox).toBe(2);
        expect(result.beforeUnread).toBe(2);
        expect(result.afterInbox).toBe(1);
        expect(result.afterUnread).toBe(1);
        const archived = await harness.gmailClient.users.messages.get({
          userId: "me",
          id: "g-archive-http",
          format: "metadata",
        });
        expect(archived.data.labelIds ?? []).not.toContain("INBOX");
      } finally {
        await harness.emulator.close();
      }
    });

    it("archives Outlook mail through /api/mail/v1 into real SQLite", async () => {
      const email = "engine-outlook-http@example.com";
      const accountId = "outlook-http-engine";
      const harness = await createOutlookTestHarness({
        email,
        messages: [
          {
            microsoft_id: "o-keep-http",
            conversation_id: "c-keep-http",
            user_email: email,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: email }],
            subject: "Keep me",
            body_content: "Stay",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T12:00:00Z",
          },
          {
            microsoft_id: "o-archive-http",
            conversation_id: "c-archive-http",
            user_email: email,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: email }],
            subject: "Archive me",
            body_content: "Go",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T11:00:00Z",
          },
        ],
      });
      try {
        const listed = await harness.provider.getMessagesWithPagination({
          maxResults: 20,
        });
        const archiveMessage = listed.messages.find(
          (message) => message.subject === "Archive me",
        );
        expect(archiveMessage?.id).toBeTruthy();
        const result = await runHttpArchiveSlice({
          accountId,
          email,
          provider: harness.provider,
          archiveMessageId: archiveMessage!.id,
        });
        expect(result.beforeInbox).toBeGreaterThanOrEqual(1);
        expect(result.afterInbox).toBe(result.beforeInbox - 1);
        const archived = await harness.graphClient
          .api(`/me/messages/${archiveMessage!.id}`)
          .select("parentFolderId")
          .get();
        expect(String(archived.parentFolderId).toLowerCase()).not.toContain(
          "inbox",
        );
      } finally {
        harness.restoreFetch();
        await harness.emulator.close();
      }
    });
  },
);

async function runHttpArchiveSlice(input: {
  accountId: string;
  email: string;
  provider: EmailProvider;
  archiveMessageId: string;
}) {
  harnessState.provider = input.provider;
  harnessState.accountId = input.accountId;
  harnessState.email = input.email;
  const request = createRouteRequest(input.accountId);
  const store = await createSqliteMailStore(createNodeSqliteDriver());
  await store.ensureAccount({
    accountId: input.accountId,
    provider: input.provider.name === "microsoft" ? "microsoft" : "google",
    generation: "gen-1",
  });
  const engine = createMailEngine({
    store,
    source: createBackendMailboxSource({
      request,
      accountId: input.accountId,
    }),
    executor: createBackendOperationExecutor({
      request,
      accountId: input.accountId,
    }),
    runtime: createHostRuntime(),
  });
  const inbox = engine.observeMailbox(inboxQuery(input.accountId));
  const unread = engine.observeMailbox(unreadInboxQuery(input.accountId));
  await engine.requestSync([input.accountId]);
  await engine.runUntil(Date.now() + 8000);
  await waitForReady(inbox);
  await waitForReady(unread);
  const beforeInbox =
    inbox.getSnapshot().data?.counts.matchingConversations ?? 0;
  const beforeUnread =
    unread.getSnapshot().data?.counts.matchingConversations ?? 0;
  const admission = await engine.submitMetadata({
    accountId: input.accountId,
    commandId: `archive-${input.archiveMessageId}`,
    targets: [
      { accountId: input.accountId, messageId: input.archiveMessageId },
    ],
    change: { kind: "archive" },
  });
  expect(admission.status).toBe("queued");
  await engine.runUntil(Date.now() + 8000);
  await waitForReady(inbox);
  const inspection = await store.inspect();
  const archived = inspection.messages.find(
    (message) => message.messageId === input.archiveMessageId,
  );
  expect(archived?.effective.roles.includes("inbox")).toBe(false);
  await engine.close();
  return {
    beforeInbox,
    beforeUnread,
    afterInbox: inbox.getSnapshot().data?.counts.matchingConversations ?? 0,
    afterUnread: unread.getSnapshot().data?.counts.matchingConversations ?? 0,
  };
}

function createRouteRequest(accountId: string): MailHttpRequestFn {
  return async ({ method, path, body, signal }) => {
    const url = new URL(path, "http://localhost:3000");
    const request = new NextRequest(url, {
      method,
      signal,
      headers: {
        accept: "application/json",
        "X-Email-Account-ID": accountId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = await dispatchMailV1(request, accountId);
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}

async function dispatchMailV1(request: NextRequest, accountId: string) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts.slice(5).join("/");
  const context = {
    params: Promise.resolve({
      accountId,
      commandId: parts[6] ?? "",
    }),
  };
  if (request.method === "GET" && resource.startsWith("capabilities")) {
    return getCapabilities(request, context);
  }
  if (request.method === "POST" && resource === "scopes") {
    return postScopes(request, context);
  }
  if (request.method === "POST" && resource === "bootstrap") {
    return postBootstrap(request, context);
  }
  if (request.method === "POST" && resource === "enumeration") {
    return postEnumeration(request, context);
  }
  if (request.method === "POST" && resource === "changes") {
    return postChanges(request, context);
  }
  if (request.method === "POST" && resource === "hydration") {
    return postHydration(request, context);
  }
  if (request.method === "POST" && resource === "conversation-membership") {
    return postMembership(request, context);
  }
  if (resource.startsWith("operations/")) {
    if (request.method === "GET" || request.method === "POST") {
      return getOperation(request, context);
    }
    return putOperation(request, context);
  }
  return new Response(JSON.stringify({ error: { code: "not_found" } }), {
    status: 404,
  });
}

async function waitForReady(handle: { getSnapshot: () => { status: string } }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (handle.getSnapshot().status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
