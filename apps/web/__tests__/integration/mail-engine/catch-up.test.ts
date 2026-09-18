import { describe, expect, it, vi } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import { createNodeSqliteDriver } from "@inboxzero/mail-sqlite/node";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
} from "@/__tests__/integration/helpers";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";
import { createEmailProviderOperationExecutor } from "@/utils/mail-api/operations";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));
vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailSendOperation: { findUnique: vi.fn(), create: vi.fn() },
    snoozedThread: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/utils/snooze/scheduler", () => ({
  prepareSnoozedThread: vi.fn(),
  activatePreparedSnoozedThread: vi.fn(),
  cancelSnoozedThreadByClientMutationId: vi.fn(),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const inboxQuery = (accountId: string) => ({
  accountIds: [accountId],
  predicate: { kind: "role" as const, role: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 25,
  after: null,
});

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "mail engine dual-provider catch-up",
  { timeout: 60_000 },
  () => {
    it("rebuilds Gmail local state after an external archive and new mail", async () => {
      const email = "engine-gmail-catchup@example.com";
      const harness = await createGmailTestHarness({
        email,
        messages: [
          {
            id: "g-keep-catch",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Keep me",
            body_text: "Stay",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now()}`,
          },
          {
            id: "g-external-archive",
            user_email: email,
            from: "ada@example.com",
            to: email,
            subject: "Leave inbox elsewhere",
            body_text: "Go",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: `${Date.now() - 1000}`,
          },
        ],
      });
      try {
        const store = await createSqliteMailStore(createNodeSqliteDriver());
        const engine = await startEngine({
          accountId: "gmail-catchup",
          provider: harness.provider,
          store,
        });
        const before = await store.readMailboxView(inboxQuery("gmail-catchup"));
        expect(before.view.counts.matchingConversations).toBe(2);
        await harness.gmailClient.users.messages.modify({
          userId: "me",
          id: "g-external-archive",
          requestBody: { removeLabelIds: ["INBOX"] },
        });
        await engine.runUntil(Date.now() + 8000);
        const after = await store.readMailboxView(inboxQuery("gmail-catchup"));
        const inspection = await store.inspect();
        const archived = inspection.messages.find(
          (message) => message.messageId === "g-external-archive",
        );
        expect(archived?.effective.roles.includes("inbox")).toBe(false);
        expect(after.view.counts.matchingConversations).toBe(1);
        await engine.close();
      } finally {
        await harness.emulator.close();
      }
    });

    it("applies Outlook folder moves discovered on delta catch-up", async () => {
      const email = "engine-outlook-catchup@example.com";
      const harness = await createOutlookTestHarness({
        email,
        messages: [
          {
            microsoft_id: "o-keep-catch",
            conversation_id: "c-keep-catch",
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
            microsoft_id: "o-moved-catch",
            conversation_id: "c-moved-catch",
            user_email: email,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: email }],
            subject: "Move me",
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
        const moved = listed.messages.find(
          (message) => message.subject === "Move me",
        );
        expect(moved?.id).toBeTruthy();
        const store = await createSqliteMailStore(createNodeSqliteDriver());
        const engine = await startEngine({
          accountId: "outlook-catchup",
          provider: harness.provider,
          store,
        });
        const before = await store.readMailboxView(
          inboxQuery("outlook-catchup"),
        );
        expect(before.view.counts.matchingConversations).toBeGreaterThanOrEqual(
          2,
        );
        await harness.provider.archiveMessages([moved!.id]);
        await engine.runUntil(Date.now() + 8000);
        const inspection = await store.inspect();
        const local = inspection.messages.find(
          (message) => message.messageId === moved!.id,
        );
        expect(local?.effective.roles.includes("inbox")).toBe(false);
        const archived = await harness.graphClient
          .api(`/me/messages/${moved!.id}`)
          .select("parentFolderId")
          .get();
        expect(String(archived.parentFolderId).toLowerCase()).not.toContain(
          "inbox",
        );
        await engine.close();
      } finally {
        harness.restoreFetch();
        await harness.emulator.close();
      }
    });
  },
);

async function startEngine(input: {
  accountId: string;
  provider: EmailProvider;
  store: Awaited<ReturnType<typeof createSqliteMailStore>>;
}) {
  await input.store.ensureAccount({
    accountId: input.accountId,
    provider: input.provider.name === "microsoft" ? "microsoft" : "google",
    generation: "gen-1",
  });
  const engine = createMailEngine({
    store: input.store,
    source: createEmailProviderMailboxSource({
      provider: input.provider,
      accountId: input.accountId,
    }),
    executor: createEmailProviderOperationExecutor({
      provider: input.provider,
      accountId: input.accountId,
    }),
    runtime: createHostRuntime(),
  });
  await engine.requestSync([input.accountId]);
  await engine.runUntil(Date.now() + 8000);
  return engine;
}
