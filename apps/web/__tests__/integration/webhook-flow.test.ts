/**
 * Integration test: webhook → processHistoryItem → action execution
 *
 * Tests the inbound email processing pipeline against a local Gmail emulator:
 * 1. Google sends webhook notification (simulated)
 * 2. processHistoryItem fetches the message via Gmail API
 * 3. Rules are matched (mocked AI) → actions are determined
 * 4. executeAct applies labels/archives via real Gmail API
 * 5. State changes verified in the emulator
 *
 * This is the fast-tier version: Prisma and AI are mocked, Gmail is real.
 * A slow-tier version with real Postgres + Redis would test the full pipeline.
 *
 * Usage:
 *   pnpm test-integration webhook-flow
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import {
  ActionType,
  ExecutedRuleStatus,
  DraftReplyConfidence,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { getEmailAccount } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn((fn: () => void) => fn()),
}));

// Mock Prisma
const mockExecutedRuleFindFirst = vi.fn().mockResolvedValue(null);
const mockExecutedRuleCreate = vi.fn();
const mockExecutedRuleUpdate = vi.fn().mockResolvedValue({});
const mockNewsletterFindFirst = vi.fn().mockResolvedValue(null);
const mockNewsletterFindUnique = vi.fn().mockResolvedValue(null);

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findFirst: (...args: unknown[]) => mockExecutedRuleFindFirst(...args),
      create: (...args: unknown[]) => mockExecutedRuleCreate(...args),
      update: (...args: unknown[]) => mockExecutedRuleUpdate(...args),
    },
    newsletter: {
      findFirst: (...args: unknown[]) => mockNewsletterFindFirst(...args),
      findUnique: (...args: unknown[]) => mockNewsletterFindUnique(...args),
    },
    action: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// Mock runRules to intercept the rule matching and call executeAct directly
// This lets us control WHICH rules match while still testing the real
// Gmail API action execution path.
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

    // Build an executedRule and call executeAct directly with real provider
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
      userEmail: "webhook-flow@example.com",
      userId: "test-user-id",
      emailAccountId: "test-account-id",
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

// Other mocks
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
    let emulator: Emulator;
    let gmailClient: ReturnType<typeof gmail>;
    let provider: GmailProvider;
    let threadIds: Record<string, string>;

    const logger = createScopedLogger("test");

    function getTestEmailAccount() {
      return {
        ...getEmailAccount({ email: TEST_EMAIL }),
        autoCategorizeSenders: false,
        filingEnabled: false,
        filingPrompt: null,
        filingConfirmationSendEmail: false,
        draftReplyConfidence: DraftReplyConfidence.ALL_EMAILS,
      };
    }

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "google",
        port: TEST_PORT,
        seed: {
          google: {
            users: [{ email: TEST_EMAIL, name: "Webhook Flow Test" }],
            oauth_clients: [
              {
                client_id: "test-client.apps.googleusercontent.com",
                client_secret: "test-secret",
                redirect_uris: ["http://localhost:3000/callback"],
              },
            ],
            messages: SEED_MESSAGES,
          },
        },
      });

      const oauth2Client = new auth.OAuth2(
        "test-client.apps.googleusercontent.com",
        "test-secret",
      );
      oauth2Client.setCredentials({ access_token: "emulator-token" });

      gmailClient = gmail({
        version: "v1",
        auth: oauth2Client,
        rootUrl: emulator.url,
      });

      provider = new GmailProvider(gmailClient, logger, "test-account-id");

      // Resolve thread IDs
      threadIds = {};
      for (const seed of SEED_MESSAGES) {
        const msg = await gmailClient.users.messages.get({
          userId: "me",
          id: seed.id,
        });
        threadIds[seed.id] = msg.data.threadId!;
      }
    });

    afterAll(async () => {
      await emulator?.close();
    });

    test("inbound message: fetches from emulator, runs rules, applies LABEL + ARCHIVE", async () => {
      capturedRunRulesCall = null;
      runRulesActions = [
        { type: ActionType.LABEL, label: "Support" },
        { type: ActionType.ARCHIVE },
      ];

      // Verify message starts in INBOX with UNREAD
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbound",
      });
      expect(before.data.labelIds).toContain("INBOX");
      expect(before.data.labelIds).toContain("UNREAD");

      // Simulate the webhook handler calling processHistoryItem
      await processHistoryItem(
        { messageId: "msg_inbound", threadId: threadIds.msg_inbound },
        {
          provider,
          rules: [], // Rules are handled by the mocked runRules
          hasAutomationRules: true,
          hasAiAccess: true,
          emailAccount: getTestEmailAccount(),
          logger,
        },
      );

      // Verify runRules was called with the parsed message from emulator
      expect(capturedRunRulesCall).not.toBeNull();
      const capturedMessage = capturedRunRulesCall!.message as any;
      expect(capturedMessage.id).toBe("msg_inbound");
      expect(capturedMessage.headers.from).toContain("customer@external.com");
      expect(capturedMessage.headers.subject).toBe("Support request #1234");

      // Verify actions were applied to the emulator
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbound",
      });

      // INBOX removed (archived)
      expect(after.data.labelIds).not.toContain("INBOX");

      // "Support" label created and applied
      const labels = await gmailClient.users.labels.list({ userId: "me" });
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

      capturedRunRulesCall = null;
      runRulesActions = [];

      await processHistoryItem(
        { messageId: "msg_outbound", threadId: threadIds.msg_outbound },
        {
          provider,
          rules: [],
          hasAutomationRules: true,
          hasAiAccess: true,
          emailAccount: getTestEmailAccount(),
          logger,
        },
      );

      // Outbound messages don't trigger runRules
      expect(capturedRunRulesCall).toBeNull();

      // But handleOutboundMessage is called for reply tracking
      expect(handleOutboundMessage).toHaveBeenCalled();
    });

    test("duplicate prevention: second call for same message is skipped", async () => {
      capturedRunRulesCall = null;
      runRulesActions = [{ type: ActionType.MARK_READ }];

      // Simulate that the rule was already executed for this message
      mockExecutedRuleFindFirst.mockResolvedValueOnce({ id: "existing-exec" });

      await processHistoryItem(
        {
          messageId: "msg_second_inbound",
          threadId: threadIds.msg_second_inbound,
        },
        {
          provider,
          rules: [],
          hasAutomationRules: true,
          hasAiAccess: true,
          emailAccount: getTestEmailAccount(),
          logger,
        },
      );

      // runRules should NOT have been called (duplicate skipped)
      expect(capturedRunRulesCall).toBeNull();

      // Message should still have UNREAD (no MARK_READ applied)
      const msg = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(msg.data.labelIds).toContain("UNREAD");
    });

    test("no AI access: message fetched but no rules run", async () => {
      // Reset the executedRule mock to allow processing
      mockExecutedRuleFindFirst.mockResolvedValue(null);
      capturedRunRulesCall = null;
      runRulesActions = [{ type: ActionType.LABEL, label: "ShouldNotApply" }];

      await processHistoryItem(
        {
          messageId: "msg_second_inbound",
          threadId: threadIds.msg_second_inbound,
        },
        {
          provider,
          rules: [],
          hasAutomationRules: true,
          hasAiAccess: false, // No AI access
          emailAccount: getTestEmailAccount(),
          logger,
        },
      );

      // runRules not called when no AI access
      expect(capturedRunRulesCall).toBeNull();

      // No label should have been created
      const labels = await gmailClient.users.labels.list({ userId: "me" });
      const badLabel = labels.data.labels?.find(
        (l) => l.name === "ShouldNotApply",
      );
      expect(badLabel).toBeUndefined();
    });

    test("MARK_READ action: processes and marks message as read", async () => {
      capturedRunRulesCall = null;
      runRulesActions = [{ type: ActionType.MARK_READ }];

      // Verify starts UNREAD
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(before.data.labelIds).toContain("UNREAD");

      await processHistoryItem(
        {
          messageId: "msg_second_inbound",
          threadId: threadIds.msg_second_inbound,
        },
        {
          provider,
          rules: [],
          hasAutomationRules: true,
          hasAiAccess: true,
          emailAccount: getTestEmailAccount(),
          logger,
        },
      );

      // UNREAD should be removed
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_second_inbound",
      });
      expect(after.data.labelIds).not.toContain("UNREAD");
    });
  },
);
