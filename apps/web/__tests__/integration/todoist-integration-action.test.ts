/**
 * Integration test: INTEGRATION action (Todoist add-tasks) via a local
 * Todoist MCP emulator (__tests__/emulators/todoist-mcp.ts).
 *
 * Covers the full write path: rule execution fires an INTEGRATION action,
 * which calls the todoist `add-tasks` MCP tool over real streamable HTTP.
 * Also covers tool sync (only the write tool is stored) and the
 * `find-projects` internal read used by the rule editor.
 *
 * Usage:
 *   pnpm test-integration todoist-integration-action
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import {
  createTodoistMcpEmulator,
  type TodoistMcpEmulator,
} from "@/__tests__/emulators/todoist-mcp";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { callMcpTool } from "@/utils/mcp/call-tool";
import { syncMcpTools } from "@/utils/mcp/sync-tools";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED = "true";
  process.env.MCP_SERVER_URL_OVERRIDES = JSON.stringify({
    todoist: "http://localhost:4310/mcp",
  });
});

const {
  mockExecutedRuleUpdate,
  mockMcpConnectionFindFirst,
  mockMcpToolDeleteMany,
  mockMcpToolCreateMany,
} = vi.hoisted(() => ({
  mockExecutedRuleUpdate: vi.fn(),
  mockMcpConnectionFindFirst: vi.fn(),
  mockMcpToolDeleteMany: vi.fn(),
  mockMcpToolCreateMany: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      update: (...args: unknown[]) => mockExecutedRuleUpdate(...args),
    },
    mcpConnection: {
      findFirst: (...args: unknown[]) => mockMcpConnectionFindFirst(...args),
    },
    mcpTool: {
      deleteMany: (...args: unknown[]) => mockMcpToolDeleteMany(...args),
      createMany: (...args: unknown[]) => mockMcpToolCreateMany(...args),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  updateExecutedActionWithDraftId: vi.fn().mockResolvedValue(undefined),
  handlePreviousDraftDeletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "todoist-test@example.com";
// Fixed port on purpose: t3-env snapshots process.env at module import, so
// MCP_SERVER_URL_OVERRIDES must be set in vi.hoisted — before a runtime
// -allocated port could be known.
const MCP_EMULATOR_PORT = 4310;
const TEST_ACCOUNT_ID = "test-account-id";

const CONNECTED_TODOIST = {
  id: "conn-todoist-1",
  accessToken: "emulator-token",
  refreshToken: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  isActive: true,
  integration: { id: "integration-todoist", name: "todoist" },
  tools: [],
};

const SEED_MESSAGES = [
  {
    id: "msg_todoist",
    user_email: TEST_EMAIL,
    from: "sender@example.com",
    to: TEST_EMAIL,
    subject: "Please review the contract",
    body_text: "Can you review the contract by tomorrow?",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "INTEGRATION action (Todoist)",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    let emulator: TodoistMcpEmulator;
    let threadId: string;

    beforeAll(async () => {
      emulator = await createTodoistMcpEmulator({ port: MCP_EMULATOR_PORT });
      harness = await createGmailTestHarness({
        email: TEST_EMAIL,
        messages: SEED_MESSAGES,
      });
      threadId = harness.threadIds.msg_todoist;
    });

    afterAll(async () => {
      await emulator?.close();
      await harness?.emulator.close();
    });

    beforeEach(() => {
      emulator.addedTasks.length = 0;
      mockExecutedRuleUpdate.mockReset().mockResolvedValue({});
      mockMcpConnectionFindFirst
        .mockReset()
        .mockResolvedValue(CONNECTED_TODOIST);
      mockMcpToolDeleteMany.mockReset().mockResolvedValue({});
      mockMcpToolCreateMany.mockReset().mockResolvedValue({});
    });

    test("creates a Todoist task through the emulator", async () => {
      await executeAct({
        client: harness.provider,
        executedRule: buildExecutedRule({
          content: "Review the contract",
          description: "Requested by sender@example.com",
          dueString: "tomorrow",
          projectId: "6X7rM8997g3RQmvh",
          projectName: "Work",
        }),
        message: buildMessage(threadId),
        emailAccount: {
          email: TEST_EMAIL,
          id: TEST_ACCOUNT_ID,
          userId: "test-user-id",
        },
        logger: createTestLogger(),
      });

      expect(emulator.addedTasks).toHaveLength(1);
      expect(emulator.addedTasks[0]).toMatchObject({
        content: "Review the contract",
        description: "Requested by sender@example.com",
        dueString: "tomorrow",
        projectId: "6X7rM8997g3RQmvh",
      });
      // projectName is display-only and must not be sent to Todoist
      expect(emulator.addedTasks[0]).not.toHaveProperty("projectName");

      expect(executedRuleStatuses()).not.toContain(ExecutedRuleStatus.ERROR);
    });

    test("fails without creating a task when Todoist is not connected", async () => {
      mockMcpConnectionFindFirst.mockResolvedValue(null);

      await executeAct({
        client: harness.provider,
        executedRule: buildExecutedRule({ content: "Review the contract" }),
        message: buildMessage(threadId),
        emailAccount: {
          email: TEST_EMAIL,
          id: TEST_ACCOUNT_ID,
          userId: "test-user-id",
        },
        logger: createTestLogger(),
      });

      expect(emulator.addedTasks).toHaveLength(0);
      expect(executedRuleStatuses()).toContain(ExecutedRuleStatus.ERROR);
    });

    test("tool sync stores only the write tool, flagged isWrite", async () => {
      await syncMcpTools("todoist", TEST_ACCOUNT_ID, createTestLogger());

      expect(mockMcpToolCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            name: "add-tasks",
            isWrite: true,
            isEnabled: true,
          }),
        ],
      });
    });

    test("find-projects returns projects for the rule editor", async () => {
      const content = await callMcpTool({
        emailAccountId: TEST_ACCOUNT_ID,
        integration: "todoist",
        toolName: "find-projects",
        args: {},
      });

      const text = Array.isArray(content)
        ? content.map((item) => (item as { text: string }).text).join("")
        : "";
      expect(JSON.parse(text).results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "inbox", name: "Inbox" }),
          expect.objectContaining({ name: "Work" }),
        ]),
      );
    });

    function executedRuleStatuses() {
      return mockExecutedRuleUpdate.mock.calls.map(
        (call) => (call[0] as { data?: { status?: string } })?.data?.status,
      );
    }
  },
);

function buildExecutedRule(integrationArgs: Record<string, string>) {
  return {
    id: "exec-todoist-1",
    createdAt: new Date("2026-03-25T12:00:00Z"),
    updatedAt: new Date(),
    messageId: "msg_todoist",
    threadId: "thread-todoist",
    automated: true,
    reason: "Matched rule",
    status: ExecutedRuleStatus.APPLYING,
    ruleId: "rule-todoist-1",
    emailAccountId: TEST_ACCOUNT_ID,
    draftContextMetadata: null,
    draftModelName: null,
    draftModelProvider: null,
    draftPipelineVersion: null,
    matchReasons: null,
    actionItems: [
      {
        id: "action-todoist-1",
        type: ActionType.INTEGRATION,
        integrationName: "todoist",
        integrationToolName: "add-tasks",
        integrationArgs,
        label: null,
        labelId: null,
        url: null,
        content: null,
        subject: null,
        to: null,
        cc: null,
        bcc: null,
        folderName: null,
        folderId: null,
        staticAttachments: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        executedRuleId: "exec-todoist-1",
      },
    ],
  };
}

function buildMessage(threadId: string) {
  return {
    id: "msg_todoist",
    threadId,
    headers: {
      from: "sender@example.com",
      to: TEST_EMAIL,
      subject: "Please review the contract",
      date: new Date(1_711_900_000_000).toISOString(),
      "message-id": "<msg_todoist@test>",
    },
    textPlain: "Can you review the contract by tomorrow?",
    textHtml: "",
    snippet: "Can you review the contract by tomorrow?",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: "1711900000000",
    historyId: "1",
    subject: "Please review the contract",
    date: new Date(1_711_900_000_000).toISOString(),
    inline: [],
    attachments: [],
    rawRecipients: [],
  };
}
