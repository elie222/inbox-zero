import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastRuleActionsUpdate,
  hasActionType,
  hasLabelAction,
  summarizeRecordedToolCalls,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  buildDefaultSystemRuleRows,
  configureRuleEvalPrisma,
  configureRuleEvalProvider,
  configureRuleMutationMocks,
} from "@/__tests__/eval/assistant-chat-rule-eval-test-utils";
import type { getEmailAccount } from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing-action-preservation
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing-action-preservation

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 240_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-action-preservation",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(ruleUpdatedAt);
const about = "My name is Test User, and I manage a company inbox.";

const marketingWithDelayRuleRows = defaultRuleRows.map((rule) => {
  if (rule.name !== "Marketing") return rule;
  return {
    ...rule,
    actions: rule.actions.map((action) =>
      action.type === ActionType.ARCHIVE
        ? { ...action, delayInMinutes: 60 }
        : action,
    ),
  };
});

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockSaveLearnedPatterns: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockRedis: {
    set: vi.fn(),
    rpush: vi.fn(),
    hincrby: vi.fn(),
    expire: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),
    lrange: vi.fn().mockResolvedValue([]),
  },
  mockUnsubscribeSenderAndMark: vi.fn(),
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const { buildRuleModuleMutationMock } = await import(
    "@/__tests__/eval/assistant-chat-rule-eval-test-utils"
  );

  return buildRuleModuleMutationMock({
    importOriginal: () => importOriginal<typeof import("@/utils/rule/rule")>(),
    mockCreateRule,
    mockPartialUpdateRule,
    mockUpdateRuleActions,
  });
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: mockSaveLearnedPatterns,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

function setupMocks(ruleRows = defaultRuleRows) {
  configureRuleMutationMocks({
    mockCreateRule,
    mockPartialUpdateRule,
    mockUpdateRuleActions,
    mockSaveLearnedPatterns,
  });

  configureRuleEvalPrisma({
    about,
    ruleRows,
  });

  configureRuleEvalProvider({
    mockCreateEmailProvider,
    ruleRows,
  });
}

describe.runIf(shouldRunEval)(
  "Eval: assistant chat rule editing action preservation",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      setupMocks();
    });

    describeEvalMatrix(
      "assistant-chat rule editing action preservation",
      (model, emailAccount) => {
        test(
          "delayed archive on Newsletter preserves the label action",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "newsletters - archive them after a day",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const archive = updateCall?.actions.find(
              (a) => a.type === ActionType.ARCHIVE,
            );

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Newsletter" &&
              hasLabelAction(updateCall.actions, "Newsletter") &&
              hasActionType(updateCall.actions, ActionType.ARCHIVE) &&
              !!archive?.delayInMinutes &&
              archive.delayInMinutes >= 1440;

            evalReporter.record({
              testName: "delayed archive preserves newsletter label",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "adjusting archive delay on Marketing preserves label and archive",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "change my marketing rule to archive after 2 hours",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const archives =
              updateCall?.actions.filter(
                (a) => a.type === ActionType.ARCHIVE,
              ) ?? [];
            const labels =
              updateCall?.actions.filter((a) => a.type === ActionType.LABEL) ??
              [];
            const archiveDelay = archives[0]?.delayInMinutes ?? null;

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Marketing" &&
              labels.length === 1 &&
              hasLabelAction(updateCall.actions, "Marketing") &&
              archives.length === 1 &&
              !!archiveDelay &&
              archiveDelay >= 90 &&
              archiveDelay <= 150;

            evalReporter.record({
              testName: "adjust marketing delay preserves label and archive",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "removing one action on Marketing keeps the others",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "remove the archive from my marketing rule",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Marketing" &&
              hasLabelAction(updateCall.actions, "Marketing") &&
              !hasActionType(updateCall.actions, ActionType.ARCHIVE);

            evalReporter.record({
              testName: "remove archive keeps marketing label",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "archive-after-a-week phrasing still keeps newsletter label",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "can you make it so my newsletter emails get archived after a week? I still want them labeled",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const archive = updateCall?.actions.find(
              (a) => a.type === ActionType.ARCHIVE,
            );

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Newsletter" &&
              hasLabelAction(updateCall.actions, "Newsletter") &&
              hasActionType(updateCall.actions, ActionType.ARCHIVE) &&
              !!archive?.delayInMinutes &&
              archive.delayInMinutes >= 10_080;

            evalReporter.record({
              testName: "archive after a week keeps newsletter label",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );
      },
    );

    describeEvalMatrix(
      "assistant-chat rule editing action preservation (marketing with delay)",
      (model, emailAccount) => {
        beforeEach(() => {
          vi.clearAllMocks();
          setupMocks(marketingWithDelayRuleRows);
        });

        test(
          "changing only the delay on an existing archive preserves label and archive",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "actually make the marketing archive delay 1 day instead",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const archives =
              updateCall?.actions.filter(
                (a) => a.type === ActionType.ARCHIVE,
              ) ?? [];
            const archiveDelay = archives[0]?.delayInMinutes ?? null;

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Marketing" &&
              hasLabelAction(updateCall.actions, "Marketing") &&
              archives.length === 1 &&
              !!archiveDelay &&
              archiveDelay >= 1200 &&
              archiveDelay <= 1680;

            evalReporter.record({
              testName: "change delay preserves label and single archive",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "terse delay-only phrasing does not drop other actions",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "for the marketing rule just change the delay to 6 hours",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const archives =
              updateCall?.actions.filter(
                (a) => a.type === ActionType.ARCHIVE,
              ) ?? [];
            const archiveDelay = archives[0]?.delayInMinutes ?? null;

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Marketing" &&
              hasLabelAction(updateCall.actions, "Marketing") &&
              archives.length === 1 &&
              !!archiveDelay &&
              archiveDelay >= 300 &&
              archiveDelay <= 420;

            evalReporter.record({
              testName: "terse delay change keeps marketing label and archive",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );
      },
    );

    afterAll(() => {
      evalReporter.printReport();
    });
  },
);

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
    chatHasHistory: true,
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(
      toolCalls,
      (toolCall) => toolCall.toolName,
    ),
  };
}
