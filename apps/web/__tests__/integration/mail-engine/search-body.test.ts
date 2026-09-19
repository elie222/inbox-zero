import { NextRequest } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { POST as postBootstrap } from "@/app/api/mail/v1/accounts/[accountId]/bootstrap/route";
import { POST as postEnumeration } from "@/app/api/mail/v1/accounts/[accountId]/enumeration/route";
import { POST as postChanges } from "@/app/api/mail/v1/accounts/[accountId]/changes/route";
import { POST as postHydration } from "@/app/api/mail/v1/accounts/[accountId]/hydration/route";
import { POST as postMembership } from "@/app/api/mail/v1/accounts/[accountId]/conversation-membership/route";
import { POST as postSearch } from "@/app/api/mail/v1/accounts/[accountId]/search/route";
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

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "mail engine HTTP search, body, read, and reopen",
  { timeout: 60_000 },
  () => {
    it("loads Gmail bodies, searches, marks read, and reopens SQLite", async () => {
      const email = "engine-gmail-search@example.com";
      const accountId = "gmail-search-engine";
      const harness = await createGmailTestHarness({
        email,
        messages: [
          {
            id: "g-search-keep",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Keep me",
            body_text: "Stay in inbox",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now()}`,
          },
          {
            id: "g-search-hit",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Need a zebra invoice",
            body_text: "zebra-token-gmail",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now() - 1000}`,
          },
        ],
      });
      try {
        const result = await runSearchBodySlice({
          accountId,
          email,
          provider: harness.provider,
          searchToken: "zebra-token-gmail",
          readMessageId: "g-search-hit",
        });
        expect(result.beforeUnread).toBeGreaterThanOrEqual(1);
        expect(result.afterUnread).toBe(result.beforeUnread - 1);
        expect(result.searchHits).toBeGreaterThanOrEqual(1);
        expect(result.bodyText).toContain("zebra-token-gmail");
        expect(result.reopenedInbox).toBeGreaterThanOrEqual(1);
        const read = await harness.gmailClient.users.messages.get({
          userId: "me",
          id: "g-search-hit",
          format: "metadata",
        });
        expect(read.data.labelIds ?? []).not.toContain("UNREAD");
      } finally {
        await harness.emulator.close();
      }
    });

    it("loads Outlook bodies, searches, marks read, and reopens SQLite", async () => {
      const email = "engine-outlook-search@example.com";
      const accountId = "outlook-search-engine";
      const harness = await createOutlookTestHarness({
        email,
        messages: [
          {
            microsoft_id: "o-search-keep",
            conversation_id: "c-search-keep",
            user_email: email,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: email }],
            subject: "Keep me",
            body_content: "Stay in inbox",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-18T12:00:00Z",
          },
          {
            microsoft_id: "o-search-hit",
            conversation_id: "c-search-hit",
            user_email: email,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: email }],
            subject: "Need a zebra invoice",
            body_content: "zebra-token-outlook",
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
        const target = listed.messages.find(
          (message) => message.subject === "Need a zebra invoice",
        );
        expect(target?.id).toBeTruthy();
        const result = await runSearchBodySlice({
          accountId,
          email,
          provider: harness.provider,
          searchToken: "zebra-token-outlook",
          readMessageId: target!.id,
        });
        expect(result.searchHits).toBeGreaterThanOrEqual(1);
        expect(result.bodyText).toContain("zebra-token-outlook");
        expect(result.afterUnread).toBe(result.beforeUnread - 1);
        expect(result.reopenedInbox).toBeGreaterThanOrEqual(1);
        const read = await harness.graphClient
          .api(`/me/messages/${target!.id}`)
          .select("isRead")
          .get();
        expect(read.isRead).toBe(true);
      } finally {
        harness.restoreFetch();
        await harness.emulator.close();
      }
    });
  },
);

async function runSearchBodySlice(input: {
  accountId: string;
  email: string;
  provider: EmailProvider;
  searchToken: string;
  readMessageId: string;
}) {
  harnessState.provider = input.provider;
  harnessState.accountId = input.accountId;
  harnessState.email = input.email;
  const directory = await mkdtemp(join(tmpdir(), "mail-engine-search-"));
  const path = join(directory, "mailbox.sqlite");
  const request = createRouteRequest(input.accountId);
  const store = await createSqliteMailStore(createNodeSqliteDriver(path));
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
  await engine.requestSync([input.accountId]);
  await engine.runUntil(Date.now() + 8000);
  await waitForReady(inbox);
  const unreadBefore =
    inbox.getSnapshot().data?.counts.unreadConversations ?? 0;
  await engine.ensureMessageContent({
    accountId: input.accountId,
    messageId: input.readMessageId,
  });
  const search = engine.observeMailbox({
    accountIds: [input.accountId],
    predicate: {
      kind: "text",
      field: "body",
      value: input.searchToken,
      match: "phrase",
    },
    order: "newest_first",
    pageSize: 25,
    after: null,
  });
  await engine.runUntil(Date.now() + 8000);
  await waitForReady(search);
  const inspection = await store.inspect();
  const local = inspection.messages.find(
    (message) => message.messageId === input.readMessageId,
  );
  const conversationId = local?.conversationId ?? input.readMessageId;
  const conversation = engine.observeConversation(
    { accountId: input.accountId, conversationId },
    { after: null, pageSize: 20 },
  );
  await waitForReady(conversation);
  const content = conversation
    .getSnapshot()
    .data?.messages.find(
      (message) => message.key.messageId === input.readMessageId,
    )?.content;
  const bodyText =
    content && content.status === "available"
      ? (content.text ?? content.html ?? "")
      : "";
  const admission = await engine.submitMetadata({
    accountId: input.accountId,
    commandId: `read-${input.readMessageId}`,
    targets: [{ accountId: input.accountId, messageId: input.readMessageId }],
    change: { kind: "set_read", read: true },
  });
  expect(admission.status).toBe("queued");
  await engine.runUntil(Date.now() + 8000);
  const diagnostics = await engine.getDiagnostics(input.accountId);
  expect(
    diagnostics.commands.some(
      (command) =>
        command.changeKind === "set_read" &&
        command.messageIds.includes(input.readMessageId),
    ),
  ).toBe(true);
  const afterUnread = inbox.getSnapshot().data?.counts.unreadConversations ?? 0;
  const searchHits =
    search.getSnapshot().data?.counts.matchingConversations ?? 0;
  await engine.close();
  const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
  const reopenedView = await reopened.readMailboxView(
    inboxQuery(input.accountId),
  );
  const reopenedInbox = reopenedView.view.counts.matchingConversations;
  await reopened.close();
  await rm(directory, { recursive: true, force: true });
  return {
    beforeUnread: unreadBefore,
    afterUnread,
    searchHits,
    bodyText,
    reopenedInbox,
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
  if (request.method === "POST" && resource === "search") {
    return postSearch(request, context);
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
