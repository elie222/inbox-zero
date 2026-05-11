/**
 * Integration test: webhook → processHistoryItem → action execution
 *
 * Tests the inbound email processing pipeline against a local Gmail emulator.
 * Prisma and AI are mocked; Gmail API calls go through the real emulator.
 *
 * Usage:
 *   pnpm test-integration webhook-flow
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import {
  ActionType,
  ExecutedRuleStatus,
  DraftReplyConfidence,
} from "@/generated/prisma/enums";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";

const mockExecutedRuleFindFirst = vi.fn().mockResolvedValue(null);
const mockExecutedRuleUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findFirst: (...args: unknown[]) => mockExecutedRuleFindFirst(...args),
      update: (...args: unknown[]) => mockExecutedRuleUpdate(...args),
    },
    newsletter: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    action: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// Mock runRules to intercept rule matching and call executeAct directly.
// This lets us control WHICH rules match while testing real Gmail API execution.
let capturedRunRulesCall: {
  message: unknown;
  provider: unknown;
} | null = null;
let runRulesActions: Array<{
  type: ActionType;
  label?: string;
  labelId?: string;
}> = [];

vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(async ({ message, provider, logger }: any) => {
    capturedRunRulesCall = { message, provider };

    if (runRulesActions.length === 0) return [];

    const executedRule = {
      id: "exec-flow-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      messageId: message.id,
      threadId: message.threadId,
      automated: true,
      reason: "Integration test rule match",
      status: ExecutedRuleStatus.APPLYING,
      ruleId: "rule-flow-1",
      emailAccountId: "test-account-id",
      draftContextMetadata: null,
      draftModelName: null,
      draftModelProvider: null,
      draftPipelineVersion: null,
      matchReasons: null,
      actionItems: runRulesActions.map((action, i) => ({
        id: `action-flow-${i}`,
        type: action.type,
        label: action.label ?? null,
        labelId: action.labelId ?? null,
        content: null,
        subject: null,
        to: null,
        cc: null,
        bcc: null,
        url: null,
        folderName: null,
        folderId: null,
        staticAttachments: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        executedRuleId: "exec-flow-1",
      })),
    };

    await executeAct({
      client: provider,
      executedRule,
      message,
      emailAccount: {
        email: "webhook-flow@example.com",
        id: "test-account-id",
        userId: "test-user-id",
      },
      logger,
    });

    return [
      {
        rule: { id: "rule-flow-1", name: "Test Rule" },
        actionItems: executedRule.actionItems,
        reason: "Integration test",
        status: ExecutedRuleStatus.APPLIED,
        createdAt: new Date(),
      },
    ];
  }),
}));

vi.mock("@/utils/encryption", () => ({
  encrypt: vi.fn((s: string) => s),
  decrypt: vi.fn((s: string) => s),
}));

vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  updateExecutedActionWithDraftId: vi.fn().mockResolvedValue(undefined),
  handlePreviousDraftDeletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));

vi.mock("@/utils/reply-tracker/draft-tracking", () => ({
  cleanupThreadAIDrafts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/follow-up/labels", () => ({
  clearFollowUpLabel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeSender: vi.fn(),
}));

vi.mock("@/utils/reply-tracker/handle-outbound", () => ({
  handleOutboundMessage: vi.fn().mockResolvedValue(undefined),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "webhook-flow@example.com";
const TEST_PORT = 4109;

const SEED_MESSAGES = [
  {
    id: "msg_inbound",
    user_email: TEST_EMAIL,
    from: "customer@external.com",
    to: TEST_EMAIL,
    subject: "Support request #1234",
    body_text: "I need help with my account.",
    body_html: "<p>I need help with my account.</p>",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
  {
    id: "msg_outbound",
    user_email: TEST_EMAIL,
    from: TEST_EMAIL,
    to: "colleague@external.com",
    subject: "Meeting notes",
    body_text: "Here are the notes from today.",
    label_ids: ["SENT"],
    internal_date: "1711900060000",
  },
  {
    id: "msg_second_inbound",
    user_email: TEST_EMAIL,
    from: "newsletter@updates.com",
    to: TEST_EMAIL,
    subject: "Weekly digest",
    body_text: "Here is your weekly update.",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900120000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Webhook → processHistoryItem → action execution",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;

    const logger = createTestLogger();

    const testEmailAccount = {
      ...getEmailAccount({ email: TEST_EMAIL }),
      autoCategorizeSenders: false,
      filingEnabled: false,
      filingPrompt: null,
      filingConfirmationSendEmail: false,
      draftReplyConfidence: DraftReplyConfidence.ALL_EMAILS,
    };

    function callProcessHistoryItem(
      messageId: string,
      overrides?: Partial<Parameters<typeof processHistoryItem>[1]>,
    ) {
      return processHistoryItem(
        { messageId, threadId: harness.threadIds[messageId] },
        {
          provider: harness.provider,
          rules: [],
          hasAutomationRules: true,
          hasAiAccess: true,
          emailAccount: testEmailAccount,
          logger,
          ...overrides,
        },
      );
    }

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        port: TEST_PORT,
        email: TEST_EMAIL,
        messages: SEED_MESSAGES,
      });
    });

    beforeEach(async () => {
      capturedRunRulesCall = null;
      runRulesActions = [];
      mockExecutedRuleFindFirst.mockReset().mockResolvedValue(null);
      mockExecutedRuleUpdate.mockReset().mockResolvedValue({});

      // Clear handleOutboundMessage call history so toHaveBeenCalled is accurate
      const { handleOutboundMessage } = await import(
        "@/utils/reply-tracker/handle-outbound"
      );
      vi.mocked(handleOutboundMessage).mockClear();
    });

    afterAll(async () => {
      await harness?.emulator?.close();
    });

    test("inbound message: fetches from emulator, runs rules, applies LABEL + ARCHIVE", async () => {
      runRulesActions = [
        { type: ActionType.LABEL, label: "Support" },
        { type: ActionType.ARCHIVE },
      ];

      const before = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbound",
      });
      expect(before.data.labelIds).toContain("INBOX");
      expect(before.data.labelIds).toContain("UNREAD");

      await callProcessHistoryItem("msg_inbound");

      // Verify runRules received the parsed message from the emulator
      expect(capturedRunRulesCall).not.toBeNull();
      const capturedMessage = capturedRunRulesCall!.message as any;
      expect(capturedMessage.id).toBe("msg_inbound");
      expect(capturedMessage.headers.from).toContain("customer@external.com");
      expect(capturedMessage.headers.subject).toBe("Support request #1234");

      const after = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbound",
      });
      expect(after.data.labelIds).not.toContain("INBOX");

      const labels = await harness.gmailClient.users.labels.list({
        userId: "me",
      });
      const supportLabel = labels.data.labels?.find(
        (l) => l.name === "Support",
      );
      expect(supportLabel).toBeDefined();
      expect(after.data.labelIds).toContain(supportLabel!.id);
    });

    test("outbound message: routes to handleOutboundMessage, no rules run", async () => {
      const { handleOutboundMessage } = await import(
        "@/utils/reply-tracker/handle-outbound"
      );

      await callProcessHistoryItem("msg_outbound");

      expect(capturedRunRulesCall).toBeNull();
      expect(handleOutboundMessage).toHaveBeenCalled();
    });

    test("duplicate prevention: second call for same message is skipped", async () => {
      runRulesActions = [{ type: ActionType.MARK_READ }];

      // Simulate rule already executed for this message
      mockExecutedRuleFindFirst.mockResolvedValueOnce({ id: "existing-exec" });

      await callProcessHistoryItem("msg_second_inbound");

      expect(capturedRunRulesCall).toBeNull();

      const msg = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(msg.data.labelIds).toContain("UNREAD");
    });

    test("no AI access: message fetched but no rules run", async () => {
      runRulesActions = [{ type: ActionType.LABEL, label: "ShouldNotApply" }];

      await callProcessHistoryItem("msg_second_inbound", {
        hasAiAccess: false,
      });

      expect(capturedRunRulesCall).toBeNull();

      const labels = await harness.gmailClient.users.labels.list({
        userId: "me",
      });
      const badLabel = labels.data.labels?.find(
        (l) => l.name === "ShouldNotApply",
      );
      expect(badLabel).toBeUndefined();
    });

    test("MARK_READ action: processes and marks message as read", async () => {
      runRulesActions = [{ type: ActionType.MARK_READ }];

      const before = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(before.data.labelIds).toContain("UNREAD");

      await callProcessHistoryItem("msg_second_inbound");

      const after = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(after.data.labelIds).not.toContain("UNREAD");
    });
  },
);
