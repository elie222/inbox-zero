/**
 * Integration test: rule execution via @inbox-zero/emulate
 *
 * Tests the executeAct function — the core of rule execution that applies
 * labels, archives, marks read, and creates drafts against the Gmail API.
 * AI matching is bypassed; we feed pre-built action items directly and
 * verify that Gmail state changes persist.
 *
 * Usage:
 *   pnpm test-integration rule-execution
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));

// Mock Prisma — executeAct updates executedRule status
const mockExecutedRuleUpdate = vi.fn().mockResolvedValue({});
const mockActionUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      update: (...args: unknown[]) => mockExecutedRuleUpdate(...args),
    },
    action: {
      updateMany: (...args: unknown[]) => mockActionUpdateMany(...args),
    },
  },
}));

// Mock next/server — label action uses after() for lazy updates
vi.mock("next/server", () => ({
  after: vi.fn((fn: () => void) => fn()),
}));

// Mock Tinybird — archiveThread publishes analytics
vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

// Mock draft management — updateExecutedActionWithDraftId is called if draft actions exist
vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  updateExecutedActionWithDraftId: vi.fn().mockResolvedValue(undefined),
  handlePreviousDraftDeletion: vi.fn().mockResolvedValue(undefined),
}));

// Mock error deduplication
vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));

// Mock encryption — imported transitively via auth
vi.mock("@/utils/encryption", () => ({
  encrypt: vi.fn((s: string) => s),
  decrypt: vi.fn((s: string) => s),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "rules-test@example.com";
const TEST_PORT = 4106;

const SEED_MESSAGES = [
  {
    id: "msg_to_label",
    user_email: TEST_EMAIL,
    from: "ceo@company.com",
    to: TEST_EMAIL,
    subject: "Quarterly review",
    body_text: "Please review the Q1 numbers.",
    body_html: "<p>Please review the Q1 numbers.</p>",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
  {
    id: "msg_to_archive",
    user_email: TEST_EMAIL,
    from: "newsletter@updates.com",
    to: TEST_EMAIL,
    subject: "Weekly digest",
    body_text: "Here is your weekly digest.",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900060000",
  },
  {
    id: "msg_to_draft",
    user_email: TEST_EMAIL,
    from: "partner@partner.io",
    to: TEST_EMAIL,
    subject: "Meeting follow-up",
    body_text: "Thanks for the meeting yesterday.",
    body_html: "<p>Thanks for the meeting yesterday.</p>",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900120000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Rule execution (executeAct)",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    let gmailClient: GmailTestHarness["gmailClient"];
    let provider: GmailTestHarness["provider"];
    let threadIds: GmailTestHarness["threadIds"];

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        port: TEST_PORT,
        email: TEST_EMAIL,
        messages: SEED_MESSAGES,
      });
      ({ gmailClient, provider, threadIds } = harness);
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    function buildExecutedRule(
      messageId: string,
      actionItems: Array<{
        id: string;
        type: ActionType;
        label?: string | null;
        labelId?: string | null;
        content?: string | null;
        subject?: string | null;
        to?: string | null;
        cc?: string | null;
        bcc?: string | null;
      }>,
    ) {
      return {
        id: `exec-${messageId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId,
        threadId: threadIds[messageId],
        automated: true,
        reason: "test",
        status: ExecutedRuleStatus.APPLYING,
        ruleId: "test-rule-1",
        emailAccountId: "test-account-id",
        // Fields required by Prisma type
        draftContextMetadata: null,
        draftModelName: null,
        draftModelProvider: null,
        draftPipelineVersion: null,
        matchReasons: null,
        actionItems: actionItems.map((item) => ({
          ...item,
          label: item.label ?? null,
          labelId: item.labelId ?? null,
          content: item.content ?? null,
          subject: item.subject ?? null,
          to: item.to ?? null,
          cc: item.cc ?? null,
          bcc: item.bcc ?? null,
          url: null,
          folderName: null,
          folderId: null,
          staticAttachments: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          executedRuleId: `exec-${messageId}`,
        })),
      };
    }

    function buildParsedMessage(seed: (typeof SEED_MESSAGES)[number]) {
      return {
        id: seed.id,
        threadId: threadIds[seed.id],
        headers: {
          from: seed.from,
          to: seed.to,
          subject: seed.subject,
          date: new Date(Number(seed.internal_date)).toISOString(),
          "message-id": `<${seed.id}@test>`,
        },
        textPlain: seed.body_text,
        textHtml: seed.body_html || "",
        snippet: seed.body_text.slice(0, 50),
        labelIds: seed.label_ids,
        internalDate: seed.internal_date,
        historyId: "1",
        subject: seed.subject,
        date: new Date(Number(seed.internal_date)).toISOString(),
        inline: [],
        attachments: [],
        rawRecipients: [],
      };
    }

    test("LABEL action: creates label and applies it to message", async () => {
      mockExecutedRuleUpdate.mockClear();

      const executedRule = buildExecutedRule("msg_to_label", [
        { id: "action-1", type: ActionType.LABEL, label: "CEO/Important" },
      ]);

      const message = buildParsedMessage(SEED_MESSAGES[0]);

      await executeAct({
        client: provider,
        executedRule,
        message,
        userEmail: TEST_EMAIL,
        userId: "test-user-id",
        emailAccountId: "test-account-id",
        logger: createTestLogger(),
      });

      // Verify Prisma was called to mark rule as APPLIED
      expect(mockExecutedRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: executedRule.id },
          data: { status: ExecutedRuleStatus.APPLIED },
        }),
      );

      // Verify label was created in Gmail
      const labels = await gmailClient.users.labels.list({ userId: "me" });
      const ceoLabel = labels.data.labels?.find(
        (l) => l.name === "CEO/Important",
      );
      expect(ceoLabel).toBeDefined();

      // Verify label was applied to the message
      const msg = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_to_label",
      });
      expect(msg.data.labelIds).toContain(ceoLabel!.id);
    });

    test("ARCHIVE action: removes INBOX label from thread", async () => {
      mockExecutedRuleUpdate.mockClear();

      const executedRule = buildExecutedRule("msg_to_archive", [
        { id: "action-2", type: ActionType.ARCHIVE },
      ]);

      const message = buildParsedMessage(SEED_MESSAGES[1]);

      // Verify starts in INBOX
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_to_archive",
      });
      expect(before.data.labelIds).toContain("INBOX");

      await executeAct({
        client: provider,
        executedRule,
        message,
        userEmail: TEST_EMAIL,
        userId: "test-user-id",
        emailAccountId: "test-account-id",
        logger: createTestLogger(),
      });

      // Verify INBOX removed
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_to_archive",
      });
      expect(after.data.labelIds).not.toContain("INBOX");

      // Verify status updated to APPLIED
      expect(mockExecutedRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ExecutedRuleStatus.APPLIED },
        }),
      );
    });

    test("MARK_READ action: removes UNREAD label", async () => {
      mockExecutedRuleUpdate.mockClear();

      const executedRule = buildExecutedRule("msg_to_label", [
        { id: "action-3", type: ActionType.MARK_READ },
      ]);

      const message = buildParsedMessage(SEED_MESSAGES[0]);

      await executeAct({
        client: provider,
        executedRule,
        message,
        userEmail: TEST_EMAIL,
        userId: "test-user-id",
        emailAccountId: "test-account-id",
        logger: createTestLogger(),
      });

      // Verify UNREAD removed (mark as read)
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_to_label",
      });
      expect(after.data.labelIds).not.toContain("UNREAD");
    });

    test("LABEL + ARCHIVE combined: labels then archives", async () => {
      mockExecutedRuleUpdate.mockClear();

      // msg_to_draft hasn't been touched yet — has INBOX + UNREAD
      const executedRule = buildExecutedRule("msg_to_draft", [
        { id: "action-4", type: ActionType.LABEL, label: "Processed" },
        { id: "action-5", type: ActionType.ARCHIVE },
      ]);

      const message = buildParsedMessage(SEED_MESSAGES[2]);

      await executeAct({
        client: provider,
        executedRule,
        message,
        userEmail: TEST_EMAIL,
        userId: "test-user-id",
        emailAccountId: "test-account-id",
        logger: createTestLogger(),
      });

      // Verify label created and applied
      const labels = await gmailClient.users.labels.list({ userId: "me" });
      const processedLabel = labels.data.labels?.find(
        (l) => l.name === "Processed",
      );
      expect(processedLabel).toBeDefined();

      const msg = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_to_draft",
      });

      // Label was applied
      expect(msg.data.labelIds).toContain(processedLabel!.id);
      // INBOX was removed (archived)
      expect(msg.data.labelIds).not.toContain("INBOX");

      // Single APPLIED status update
      expect(mockExecutedRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ExecutedRuleStatus.APPLIED },
        }),
      );
    });

    // Note: DRAFT_EMAIL action is tested separately in draft-creation.test.ts
    // The executeAct path for drafts has complex transitive dependencies
    // (MailComposer, handlePreviousDraftDeletion, etc.) that are better
    // tested in isolation.
  },
);
