import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  isUpdateRuleInput,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
  type UpdateRuleInput,
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
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing-patch-semantics
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing-patch-semantics

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 240_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-rule-editing-patch-semantics",
});
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-patch-semantics",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const renamedRuleName = "Cat label";
const customRuleName = "Cat updates";
const conditionOnlyRuleName = "Vendor Alerts";
const staticConditionRuleName = "Vendor Billing";
const defaultRuleRows = buildDefaultSystemRuleRows(ruleUpdatedAt);
const patchRuleRows = [
  ...defaultRuleRows,
  {
    id: "cat-updates-rule-id",
    name: customRuleName,
    instructions: "Emails about cats.",
    updatedAt: ruleUpdatedAt,
    from: null,
    to: null,
    subject: null,
    conditionalOperator: LogicalOperator.AND,
    enabled: true,
    runOnThreads: true,
    systemType: null,
    actions: [
      {
        type: ActionType.LABEL,
        content: null,
        label: "cat-label",
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
      },
    ],
  },
  {
    id: "vendor-alerts-rule-id",
    name: conditionOnlyRuleName,
    instructions: "Important product and account alerts.",
    updatedAt: ruleUpdatedAt,
    from: "alerts@vendor.example",
    to: null,
    subject: null,
    conditionalOperator: LogicalOperator.AND,
    enabled: true,
    runOnThreads: true,
    systemType: null,
    actions: [
      {
        type: ActionType.LABEL,
        content: null,
        label: "Vendor Alerts",
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
      },
    ],
  },
  {
    id: "vendor-billing-rule-id",
    name: staticConditionRuleName,
    instructions: "Billing notices, invoices, and account payment updates.",
    updatedAt: ruleUpdatedAt,
    from: "billing@vendor.example",
    to: null,
    subject: "invoice",
    conditionalOperator: LogicalOperator.AND,
    enabled: true,
    runOnThreads: true,
    systemType: null,
    actions: [
      {
        type: ActionType.LABEL,
        content: null,
        label: "Vendor Billing",
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
      },
    ],
  },
];
const about = "My name is Test User, and I manage a company inbox.";

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSetRuleEnabled,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
  mockEnv,
} = await vi.hoisted(async () => {
  const { buildAssistantChatEvalEnv } = await import(
    "@/__tests__/eval/assistant-chat-eval-env"
  );

  return {
    mockCreateRule: vi.fn(),
    mockPartialUpdateRule: vi.fn(),
    mockUpdateRuleActions: vi.fn(),
    mockSetRuleEnabled: vi.fn(),
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
    mockEnv: buildAssistantChatEvalEnv(),
  };
});

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const { buildRuleModuleMutationMock } = await import(
    "@/__tests__/eval/assistant-chat-rule-eval-test-utils"
  );

  return buildRuleModuleMutationMock({
    importOriginal: () => importOriginal<typeof import("@/utils/rule/rule")>(),
    mockCreateRule,
    mockPartialUpdateRule,
    mockUpdateRuleActions,
    mockSetRuleEnabled,
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
  env: mockEnv,
}));

describe.runIf(shouldRunEval)(
  "Eval: assistant chat rule editing patch semantics",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configureRuleMutationMocks({
        mockCreateRule,
        mockPartialUpdateRule,
        mockUpdateRuleActions,
        mockSetRuleEnabled,
        mockSaveLearnedPatterns,
      });

      configureRuleEvalPrisma({
        about,
        ruleRows: patchRuleRows,
      });

      configureRuleEvalProvider({
        mockCreateEmailProvider,
        ruleRows: patchRuleRows,
      });
    });

    describeEvalMatrix(
      "assistant-chat rule editing patch semantics",
      (model, emailAccount) => {
        test(
          "renames an existing rule without creating or deleting rules",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `Rename my "${customRuleName}" rule to "${renamedRuleName}".`,
                },
              ],
            });

            const updateRuleCall = getLastUpdateRuleCall(toolCalls)?.input;
            const updateRuleIndex = getLastToolCallIndex(
              toolCalls,
              "updateRule",
            );

            const pass =
              !!updateRuleCall &&
              updateRuleCall.ruleName === customRuleName &&
              updateRuleCall.updates?.name === renamedRuleName &&
              !("condition" in updateRuleCall.updates) &&
              !("actions" in updateRuleCall.updates) &&
              hasRuleReadBeforeUpdate(toolCalls, updateRuleIndex) &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "rename existing rule with patch update",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "action-only update preserves existing conditions and name",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "Change my Notification rule so those emails are marked read too.",
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === "Notification" &&
              !!patchCall.updates?.actions &&
              !("name" in patchCall.updates) &&
              !("condition" in patchCall.updates) &&
              patchHasActionType(patchCall, ActionType.MARK_READ) &&
              patchHasLabelAction(patchCall, "Notification");

            evalReporter.record({
              testName: "action patch preserves non-action fields",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "condition-only update preserves existing actions and name",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "If I am CC'd on an email, it should not be marked To Reply.",
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === "To Reply" &&
              !!patchCall.updates?.condition &&
              !("name" in patchCall.updates) &&
              !("actions" in patchCall.updates) &&
              getPatchConditionInstructions(patchCall)
                .toLowerCase()
                .includes("cc");

            evalReporter.record({
              testName: "condition patch preserves non-condition fields",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "clears one static condition without clearing instructions or actions",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    'Remove the sender restriction from my "Vendor Alerts" rule, but keep its instructions and actions.',
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === conditionOnlyRuleName &&
              !!patchCall.updates?.condition &&
              !("name" in patchCall.updates) &&
              !("actions" in patchCall.updates) &&
              getPatchConditionStaticFrom(patchCall) === null &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "explicit condition clear preserves other fields",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "clears one static field without clearing sibling static fields",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `For my "${staticConditionRuleName}" rule, remove the subject restriction but keep the sender restriction.`,
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === staticConditionRuleName &&
              !!patchCall.updates?.condition &&
              !("name" in patchCall.updates) &&
              !("actions" in patchCall.updates) &&
              getPatchConditionStaticSubject(patchCall) === null &&
              preservesStaticSender(patchCall, "billing@vendor.example") &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "clear one static field preserves sibling fields",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "does not repeat a rule update after confirmed current rule output",
          async () => {
            const ruleRows = cloneRuleRows(patchRuleRows);
            configureRuleEvalPrisma({
              about,
              ruleRows,
            });
            configureRuleEvalProvider({
              mockCreateEmailProvider,
              ruleRows,
            });
            mockPartialUpdateRule.mockImplementation(
              async ({ ruleId, data }) => {
                const rule = ruleRows.find(
                  (candidate) => candidate.id === ruleId,
                );
                if (rule) {
                  Object.assign(rule, data, {
                    updatedAt: new Date("2026-03-13T00:01:00.000Z"),
                  });
                }

                return { id: ruleId };
              },
            );

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `Update my "${staticConditionRuleName}" rule so it only catches billing emails that need finance review.`,
                },
              ],
            });

            const updateCalls = getSuccessfulUpdateRuleCalls(
              toolCalls,
              staticConditionRuleName,
            );
            const updateCall = updateCalls[0];
            const pass =
              updateCalls.length === 1 &&
              !!updateCall?.input.updates.condition &&
              getPatchConditionInstructions(updateCall.input)
                .toLowerCase()
                .includes("finance") &&
              outputHasCurrentRule(updateCall.output) &&
              !hasSuccessfulRuleUpdateAfter(toolCalls, {
                ruleName: staticConditionRuleName,
                startIndex: updateCall.index,
              }) &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "confirmed rule update does not repeat",
              model: model.label,
              pass,
              actual: summarizeRuleMutationCalls(toolCalls) || actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "renames and updates actions in one patch without touching conditions",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `Rename "${customRuleName}" to "${renamedRuleName}" and also mark matching emails as read.`,
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === customRuleName &&
              patchCall.updates?.name === renamedRuleName &&
              !!patchCall.updates.actions &&
              !("condition" in patchCall.updates) &&
              patchHasActionType(patchCall, ActionType.MARK_READ) &&
              patchHasLabelAction(patchCall, "cat-label") &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "combined name and action patch",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "replaces a label action instead of adding a second label",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `Change the "${customRuleName}" rule to use the Notification label instead of cat-label. Do not keep the old cat-label action.`,
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls)?.input;
            const pass =
              !!patchCall &&
              patchCall.ruleName === customRuleName &&
              !!patchCall.updates.actions &&
              !("name" in patchCall.updates) &&
              !("condition" in patchCall.updates) &&
              patchHasLabelAction(patchCall, "Notification") &&
              !patchHasLabelAction(patchCall, "cat-label") &&
              countLabelActions(patchCall) === 1 &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "replace label action without adding duplicate",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "updates conditions and actions together without renaming",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "Change my Notification rule to only catch system alerts and mark those emails read too.",
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls);
            const pass =
              !!patchCall &&
              patchCall.input.ruleName === "Notification" &&
              !("name" in patchCall.input.updates) &&
              !!patchCall.input.updates.condition &&
              !!patchCall.input.updates.actions &&
              getPatchConditionInstructions(patchCall.input)
                .toLowerCase()
                .includes("system alert") &&
              patchHasActionType(patchCall.input, ActionType.MARK_READ) &&
              patchHasLabelAction(patchCall.input, "Notification") &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "combined condition and action patch",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "pauses a rule through the unified update patch",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "Pause my Marketing rule for now.",
                },
              ],
            });

            const patchCall = getLastUpdateRuleCall(toolCalls);
            const pass =
              !!patchCall &&
              patchCall.input.ruleName === "Marketing" &&
              isStatusOnlyEnabledUpdateInput(patchCall.input, false) &&
              isSuccessfulStatusOnlyUpdateOutput(patchCall.output, false) &&
              countSuccessfulRuleUpdates(toolCalls) === 1 &&
              hasNoCreateDeleteOrLegacyRuleMutations(toolCalls);

            evalReporter.record({
              testName: "pause uses enabled patch",
              model: model.label,
              pass,
              actual: summarizeRuleMutationCalls(toolCalls) || actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "deletes a rule through the confirmation-gated delete tool",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: `Delete my "${customRuleName}" rule.`,
                },
              ],
            });

            const deleteCall = getLastDeleteRuleCall(toolCalls);
            const deleteCallIndex = deleteCall?.index ?? -1;
            const pass =
              !!deleteCall &&
              isSuccessfulOutput(deleteCall.output) &&
              deleteCall.input.ruleName === customRuleName &&
              !hasSuccessfulRuleUpdateAfter(toolCalls, {
                ruleName: customRuleName,
                startIndex: deleteCallIndex,
              }) &&
              hasRuleReadBeforeUpdate(toolCalls, deleteCallIndex);

            evalReporter.record({
              testName: "delete uses delete rule tool",
              model: model.label,
              pass,
              actual: summarizeRuleMutationCalls(toolCalls) || actual,
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
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(
      toolCalls,
      (toolCall) => toolCall.toolName,
    ),
  };
}

function getLastUpdateRuleCall(toolCalls: RecordedToolCall[]) {
  return getLastToolCall(toolCalls, "updateRule", isUpdateRuleInput);
}

function getLastDeleteRuleCall(toolCalls: RecordedToolCall[]) {
  return getLastToolCall(toolCalls, "deleteRule", isDeleteRuleInput);
}

function getLastToolCall<TInput>(
  toolCalls: RecordedToolCall[],
  toolName: string,
  matches: (input: unknown) => input is TInput,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== toolName) continue;
    if (!matches(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
      output: toolCall.output,
    };
  }

  return null;
}

function isDeleteRuleInput(input: unknown): input is { ruleName: string } {
  if (!input || typeof input !== "object") return false;

  const value = input as { ruleName?: unknown };
  return typeof value.ruleName === "string";
}

function patchHasActionType(input: UpdateRuleInput, actionType: ActionType) {
  return input.updates.actions?.some((action) => action.type === actionType);
}

function isStatusOnlyEnabledUpdateInput(
  input: UpdateRuleInput,
  enabled: boolean,
) {
  return (
    input.updates.enabled === enabled &&
    input.updates.name === undefined &&
    input.updates.condition === undefined &&
    input.updates.actions === undefined
  );
}

function hasSuccessfulRuleUpdateAfter(
  toolCalls: RecordedToolCall[],
  {
    ruleName,
    startIndex,
  }: {
    ruleName: string;
    startIndex: number;
  },
) {
  return toolCalls
    .slice(startIndex + 1)
    .some(
      (toolCall) =>
        toolCall.toolName === "updateRule" &&
        isUpdateRuleInput(toolCall.input) &&
        toolCall.input.ruleName === ruleName &&
        isSuccessfulOutput(toolCall.output),
    );
}

function getSuccessfulUpdateRuleCalls(
  toolCalls: RecordedToolCall[],
  ruleName: string,
) {
  return toolCalls.flatMap((toolCall, index) => {
    if (toolCall.toolName !== "updateRule") return [];
    if (!isUpdateRuleInput(toolCall.input)) return [];
    if (toolCall.input.ruleName !== ruleName) return [];
    if (!isSuccessfulOutput(toolCall.output)) return [];

    return [
      {
        index,
        input: toolCall.input,
        output: toolCall.output,
      },
    ];
  });
}

function isSuccessfulStatusOnlyUpdateOutput(
  output: unknown,
  enabled: boolean,
): output is { success: true; updatedEnabled: boolean } {
  if (!isSuccessfulOutput(output)) return false;

  const value = output as {
    originalName?: unknown;
    updatedActions?: unknown;
    updatedConditions?: unknown;
    updatedEnabled?: unknown;
    updatedName?: unknown;
  };

  return (
    value.updatedEnabled === enabled &&
    value.updatedName === value.originalName &&
    value.updatedConditions === undefined &&
    value.updatedActions === undefined
  );
}

function countSuccessfulRuleUpdates(toolCalls: RecordedToolCall[]) {
  return toolCalls.filter(
    (toolCall) =>
      toolCall.toolName === "updateRule" &&
      isUpdateRuleInput(toolCall.input) &&
      isSuccessfulOutput(toolCall.output),
  ).length;
}

function isSuccessfulOutput(output: unknown): output is { success: true } {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { success?: unknown }).success === true
  );
}

function outputHasCurrentRule(output: unknown) {
  return (
    isSuccessfulOutput(output) &&
    typeof (output as { currentRule?: unknown }).currentRule === "object" &&
    (output as { currentRule?: unknown }).currentRule !== null
  );
}

function patchHasLabelAction(input: UpdateRuleInput, label: string) {
  return input.updates.actions?.some(
    (action) =>
      action.type === ActionType.LABEL && action.fields?.label === label,
  );
}

function getPatchConditionInstructions(input: UpdateRuleInput) {
  return input.updates.condition?.aiInstructions ?? "";
}

function getPatchConditionStaticFrom(input: UpdateRuleInput) {
  return input.updates.condition?.static?.from;
}

function getPatchConditionStaticSubject(input: UpdateRuleInput) {
  return input.updates.condition?.static?.subject;
}

function preservesStaticSender(input: UpdateRuleInput, expectedSender: string) {
  const from = input.updates.condition?.static?.from;
  return from === undefined || from === expectedSender;
}

function countLabelActions(input: UpdateRuleInput) {
  return (
    input.updates.actions?.filter((action) => action.type === ActionType.LABEL)
      .length ?? 0
  );
}

function hasNoCreateDeleteOrLegacyRuleMutations(toolCalls: RecordedToolCall[]) {
  return !toolCalls.some((toolCall) =>
    [
      "createRule",
      "deleteRule",
      "updateRuleActions",
      "updateRuleConditions",
      "updateLearnedPatterns",
    ].includes(toolCall.toolName),
  );
}

function summarizeRuleMutationCalls(toolCalls: RecordedToolCall[]) {
  return toolCalls
    .filter((toolCall) =>
      ["createRule", "updateRule", "deleteRule"].includes(toolCall.toolName),
    )
    .map(
      (toolCall) =>
        `${toolCall.toolName} ${JSON.stringify(toolCall.input)} -> ${summarizeToolOutput(toolCall.output)}`,
    )
    .join(" | ");
}

function summarizeToolOutput(output: unknown) {
  if (isSuccessfulOutput(output)) return "success";
  if (typeof output === "object" && output !== null && "error" in output) {
    return `error: ${String((output as { error?: unknown }).error)}`;
  }

  return "no output";
}

function getLastToolCallIndex(toolCalls: RecordedToolCall[], toolName: string) {
  return toolCalls.findLastIndex((toolCall) => toolCall.toolName === toolName);
}

function hasRuleReadBeforeUpdate(
  toolCalls: RecordedToolCall[],
  updateCallIndex: number,
) {
  if (updateCallIndex < 0) return false;

  return (
    getLastToolCallIndex(
      toolCalls.slice(0, updateCallIndex),
      "getUserRulesAndSettings",
    ) >= 0
  );
}

function cloneRuleRows<T extends { updatedAt: Date; actions: unknown[] }>(
  rules: T[],
) {
  return rules.map((rule) => ({
    ...rule,
    updatedAt: new Date(rule.updatedAt),
    actions: rule.actions.map((action) => ({ ...action })),
  }));
}
