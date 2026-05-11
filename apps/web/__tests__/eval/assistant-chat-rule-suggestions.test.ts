import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  runAssistantEpisode,
  type AssistantChatEpisodeTurn,
} from "@/__tests__/eval/assistant-chat-episode-utils";
import {
  captureAssistantChatTrace,
  summarizeRecordedToolCalls,
  type AssistantChatTrace,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  buildRuleFixtureRow,
  toRuleRows,
  type DemoInboxRuleRow,
} from "@/__tests__/fixtures/inboxes/adapters";
import {
  saasFounderRuleSuggestionFixture,
  type AssistantRuleSuggestionFixture,
} from "@/__tests__/eval/assistant-rule-suggestion-fixtures";
import {
  configurePrismaForAssistantRuleSuggestionState,
  createAssistantRuleSuggestionState,
  createRuleInAssistantState,
  partialUpdateRuleInAssistantState,
  updateRuleActionsInAssistantState,
} from "@/__tests__/eval/assistant-rule-suggestion-state";
import type { DemoInboxFixture } from "@/__tests__/fixtures/inboxes/types";
import { ActionType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-rule-suggestions.test.ts

const shouldRunEval = shouldRunEvalTests();
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-rule-suggestions");
const TIMEOUT = 120_000;

const hoisted = vi.hoisted(() => ({
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
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
  mockArchiveThreadWithLabel: vi.fn(),
  mockMarkReadThread: vi.fn(),
  mockBulkArchiveFromSenders: vi.fn(),
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();

  return {
    ...actual,
    createRule: hoisted.mockCreateRule,
    partialUpdateRule: hoisted.mockPartialUpdateRule,
    updateRuleActions: hoisted.mockUpdateRuleActions,
  };
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: hoisted.mockSaveLearnedPatterns,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: hoisted.mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: hoisted.mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: hoisted.mockRedis,
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: hoisted.mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED: true,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

type Scenario = {
  name: string;
  expected: string;
  fixture: DemoInboxFixture;
  account: AssistantRuleSuggestionFixture["account"];
  inboxStats: { total: number; unread: number };
  messages: ModelMessage[];
  rules?: DemoInboxRuleRow[];
  expectRuleWrite?: boolean;
  expectQuestion?: boolean;
  maxFinalWords?: number;
};

type EpisodeScenario = {
  name: string;
  expected: string;
  fixture: DemoInboxFixture;
  account: AssistantRuleSuggestionFixture["account"];
  inboxStats: { total: number; unread: number };
  turns: AssistantChatEpisodeTurn[];
};

const saasRules = toRuleRows({
  rules: saasFounderRuleSuggestionFixture.rules,
});

const oneOffEventRules = toRuleRows({
  rules: [
    {
      name: "Legal",
      instructions:
        "Legal, contract, licensing, procurement, or agreement review threads.",
      actions: [labelAction("Legal")],
      runOnThreads: true,
    },
  ],
});

const scenarios: Scenario[] = [
  {
    name: "open-ended rule ideas from a mixed inbox sample",
    expected:
      "The assistant should inspect existing rules and enough inbox evidence to find recurring patterns, avoid duplicate suggestions, propose user-specific rule ideas that improve inbox efficiency, and ask focused questions about important vs low-priority items when priority is unclear.",
    fixture: saasFounderRuleSuggestionFixture.inbox,
    account: saasFounderRuleSuggestionFixture.account,
    inboxStats: { total: 1840, unread: 73 },
    messages: [
      {
        role: "user",
        content:
          "Give me some ideas of rules I could add. Look at my inbox and interview me if you need to.",
      },
    ],
    rules: saasRules,
  },
  {
    name: "avoid duplicate default rules and find custom opportunities",
    expected:
      "The assistant should check what this user already has handled, then focus on user-specific candidates like customer escalations, security/compliance, and auditor requests.",
    fixture: saasFounderRuleSuggestionFixture.inbox,
    account: saasFounderRuleSuggestionFixture.account,
    inboxStats: { total: 2310, unread: 118 },
    messages: [
      {
        role: "user",
        content:
          "I already have the basic rules. What new rules would actually make my inbox cleaner?",
      },
    ],
    rules: [
      ...saasRules,
      buildRuleFixtureRow({
        name: "Recruiting",
        instructions:
          "Recruiting coordinators, interview scheduling, candidate feedback, and offer logistics.",
        actions: [labelAction("Recruiting")],
        runOnThreads: true,
      }),
    ],
  },
  {
    name: "interview request avoids one-off event rules",
    expected:
      "The assistant should inspect rules and inbox evidence, keep the answer compact, ask a focused calibration question, and avoid turning one-off event logistics into a bootcamp or Calendar/FYI rule.",
    fixture: oneOffEventRuleSuggestionFixture(),
    account: {
      email: "founder@example.com",
      timezone: "America/Los_Angeles",
      about:
        "I run a software company and want help separating urgent customer and legal work from low-priority outreach.",
    },
    inboxStats: { total: 106, unread: 40 },
    messages: [
      {
        role: "user",
        content:
          "Suggest rules I should add. Look at my inbox and ask me about my flow if that would help.",
      },
    ],
    rules: oneOffEventRules,
    expectQuestion: true,
    maxFinalWords: 220,
  },
  {
    name: "calibrated follow-up creates a low-priority updates rule",
    expected:
      "After the user explicitly confirms priority and action, the assistant may create a Product Updates rule that labels and archives vendor product digests while excluding security and billing alerts.",
    fixture: saasFounderRuleSuggestionFixture.inbox,
    account: saasFounderRuleSuggestionFixture.account,
    inboxStats: { total: 1840, unread: 73 },
    messages: [
      {
        role: "user",
        content:
          "Give me ideas for rules that would reduce low-priority noise.",
      },
      {
        role: "assistant",
        content:
          "One likely candidate is product update digests from SaaS vendors, but I want to confirm whether those are low priority for you before automating.",
      },
      {
        role: "user",
        content:
          "Yes, product update digests from SaaS vendors are low priority. Create a rule that labels them Product Updates and archives them. Do not include security alerts or billing emails.",
      },
    ],
    rules: saasRules,
    expectRuleWrite: true,
  },
];

const episodeScenarios: EpisodeScenario[] = [
  {
    name: "multi-turn rule discovery calibrates before creating a rule",
    expected:
      "The assistant should first inspect rules and the inbox, then create a Product Updates rule only after the user confirms that category and exclusions.",
    fixture: saasFounderRuleSuggestionFixture.inbox,
    account: saasFounderRuleSuggestionFixture.account,
    inboxStats: { total: 1840, unread: 73 },
    turns: [
      {
        userMessage:
          "Give me a few rule ideas that would reduce low-priority noise.",
      },
      {
        userMessage:
          "Yes, product update digests are low priority. Create that rule, label them Product Updates, archive them, and exclude security or billing alerts.",
      },
    ],
  },
];

describe.runIf(shouldRunEval)("Eval: assistant chat rule suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.mockCreateRule.mockResolvedValue({ id: "created-rule-id" });
    hoisted.mockPartialUpdateRule.mockResolvedValue({ id: "updated-rule-id" });
    hoisted.mockUpdateRuleActions.mockResolvedValue({ id: "updated-rule-id" });
    hoisted.mockSaveLearnedPatterns.mockResolvedValue({ success: true });
  });

  describeEvalMatrix(
    "assistant-chat rule suggestions",
    (model, emailAccount) => {
      test.each(scenarios)(
        "$name",
        async (scenario) => {
          const state = configureScenario(scenario);

          const startedAt = Date.now();
          const evalEmailAccount = {
            ...emailAccount,
            userId: "",
          };

          let trace: AssistantChatTrace;

          try {
            trace = await captureNormalizedTrace({
              emailAccount: evalEmailAccount,
              inboxStats: scenario.inboxStats,
              messages: scenario.messages,
            });
          } catch (error) {
            evalReporter.record({
              testName: scenario.name,
              model: model.label,
              pass: false,
              durationMs: Date.now() - startedAt,
              expected: scenario.expected,
              actual: formatErrorForReport(error),
            });
            throw error;
          }

          const analysis = analyzeTrace(trace);
          const expectRuleWrite =
            scenario.expectRuleWrite ?? scenario.name.includes("creates");
          const pass = expectRuleWrite
            ? analysis.usedCreateRule &&
              hasExpectedCreatedRule(scenario, state.createdRules)
            : analysis.usedRulesTool &&
              analysis.usedSearchTool &&
              analysis.noRuleWrite &&
              analysis.mentionsEvidence &&
              analysis.mentionsPriority &&
              (!scenario.expectQuestion || analysis.asksQuestion) &&
              (!scenario.maxFinalWords ||
                analysis.wordCount <= scenario.maxFinalWords);

          evalReporter.record({
            testName: scenario.name,
            model: model.label,
            pass,
            durationMs: Date.now() - startedAt,
            expected: scenario.expected,
            actual: formatTraceForReport(trace, analysis, state),
          });

          expect(trace.finalText.trim().length).toBeGreaterThan(0);
          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(episodeScenarios)(
        "$name",
        async (scenario) => {
          const state = configureScenario({
            ...scenario,
            messages: [],
            account: scenario.account,
            rules: saasRules,
            expectRuleWrite: true,
          });

          const startedAt = Date.now();
          const evalEmailAccount = {
            ...emailAccount,
            userId: "",
          };

          try {
            const episode = await runAssistantEpisode({
              emailAccount: evalEmailAccount,
              logger,
              turns: scenario.turns.map((turn) => ({
                ...turn,
                inboxStats: turn.inboxStats ?? scenario.inboxStats,
              })),
              defaultInboxStats: scenario.inboxStats,
            });
            const toolCalls = episode.traces.flatMap(
              (trace) => trace.toolCalls,
            );
            const firstTurnAnalysis = analyzeTrace(episode.traces[0]);
            const finalAnalysis = analyzeAssistantOutput({
              finalText: episode.finalText,
              toolCalls,
            });
            const pass =
              firstTurnAnalysis.usedRulesTool &&
              firstTurnAnalysis.usedSearchTool &&
              firstTurnAnalysis.noRuleWrite &&
              finalAnalysis.usedCreateRule &&
              state.createdRules.some((rule) =>
                rule.name.toLowerCase().includes("product"),
              );

            evalReporter.record({
              testName: scenario.name,
              model: model.label,
              pass,
              durationMs: Date.now() - startedAt,
              expected: scenario.expected,
              actual: formatEpisodeForReport({
                episode,
                analysis: finalAnalysis,
                state,
              }),
            });

            expect(episode.finalText.trim().length).toBeGreaterThan(0);
            expect(pass).toBe(true);
          } catch (error) {
            evalReporter.record({
              testName: scenario.name,
              model: model.label,
              pass: false,
              durationMs: Date.now() - startedAt,
              expected: scenario.expected,
              actual: formatErrorForReport(error),
            });
            throw error;
          }
        },
        TIMEOUT,
      );
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

async function captureNormalizedTrace({
  emailAccount,
  inboxStats,
  messages,
}: {
  emailAccount: Parameters<typeof captureAssistantChatTrace>[0]["emailAccount"];
  inboxStats: { total: number; unread: number };
  messages: ModelMessage[];
}) {
  const trace = await captureAssistantChatTrace({
    emailAccount,
    inboxStats,
    logger,
    messages,
  });

  return {
    ...trace,
    finalText: await Promise.resolve(trace.finalText),
  };
}

function configureScenario(scenario: Scenario) {
  const state = createAssistantRuleSuggestionState({
    fixture: scenario.fixture,
    account: scenario.account,
    rules: scenario.rules ?? toRuleRows({}),
  });

  configurePrismaForAssistantRuleSuggestionState({ prisma, state });

  hoisted.mockCreateEmailProvider.mockResolvedValue(state.provider);
  hoisted.mockCreateRule.mockImplementation((args) =>
    createRuleInAssistantState(state, args),
  );
  hoisted.mockPartialUpdateRule.mockImplementation((args) =>
    partialUpdateRuleInAssistantState(state, args),
  );
  hoisted.mockUpdateRuleActions.mockImplementation((args) =>
    updateRuleActionsInAssistantState(state, args),
  );

  return state;
}

function labelAction(label: string) {
  return {
    type: ActionType.LABEL,
    label,
  };
}

function oneOffEventRuleSuggestionFixture(): DemoInboxFixture {
  return {
    id: "oneOffEventRuleSuggestion",
    name: "One-Off Event Rule Suggestion Inbox",
    description:
      "A founder inbox with one-off event logistics mixed with recurring support, legal, and outreach patterns.",
    mailbox: {
      email: "founder@example.com",
      displayName: "Founder",
      timezone: "America/Los_Angeles",
    },
    labels: [
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "UNREAD", name: "UNREAD", type: "system" },
      { id: "SENT", name: "SENT", type: "system" },
      { id: "Label_To Reply", name: "To Reply", type: "user" },
      { id: "Label_FYI", name: "FYI", type: "user" },
      { id: "Label_Legal", name: "Legal", type: "user" },
      { id: "Label_Support", name: "Support", type: "user" },
      { id: "Label_Customer", name: "Customer", type: "user" },
      { id: "Label_Partnership", name: "Partnership", type: "user" },
    ],
    threads: [
      fixtureThread("one-off-event-thread", [
        fixtureMessage({
          id: "one-off-event-message",
          from: fixturePerson(
            "Cloud Marketplace",
            "events@cloudvendor.example",
          ),
          to: [fixturePerson("Founder", "founder@example.com")],
          subject: "Cloud marketplace bootcamp prerequisites",
          bodyText:
            "Sharing the prep checklist for the upcoming bootcamp. This is for a single workshop session.",
          unread: true,
          labels: ["INBOX"],
          date: "2026-04-22T16:00:00.000Z",
        }),
      ]),
      fixtureThread("support-handoff-1", [
        fixtureMessage({
          id: "support-handoff-message-1",
          from: fixturePerson("Support Inbox", "notifications@support.example"),
          to: [fixturePerson("Founder", "founder@example.com")],
          subject: "Customer asks for Gmail rate limit update",
          bodyText:
            "The customer asked: Any update on the Gmail rate limiting issue?",
          unread: true,
          labels: ["INBOX", "To Reply"],
          date: "2026-04-22T15:00:00.000Z",
        }),
      ]),
      fixtureThread("support-handoff-2", [
        fixtureMessage({
          id: "support-handoff-message-2",
          from: fixturePerson("Support Inbox", "notifications@support.example"),
          to: [fixturePerson("Founder", "founder@example.com")],
          subject: "Customer waiting on setup answer",
          bodyText:
            "Customer says: Can you confirm whether workspace setup is complete?",
          unread: true,
          labels: ["INBOX", "To Reply"],
          date: "2026-04-21T11:30:00.000Z",
        }),
      ]),
      fixtureThread("link-swap-1", [
        fixtureMessage({
          id: "link-swap-message-1",
          from: fixturePerson("Outreach Sender", "sender@example.net"),
          to: [fixturePerson("Founder", "founder@example.com")],
          subject: "Link Partnership proposal",
          bodyText:
            "Following up about swapping links between our resources pages.",
          unread: true,
          labels: ["INBOX"],
          date: "2026-04-21T09:00:00.000Z",
        }),
      ]),
      fixtureThread("link-swap-2", [
        fixtureMessage({
          id: "link-swap-message-2",
          from: fixturePerson("Outreach Sender", "sender@example.net"),
          to: [fixturePerson("Founder", "founder@example.com")],
          subject: "Swap Links follow-up",
          bodyText:
            "Checking again whether you are open to a link partnership.",
          unread: true,
          labels: ["INBOX"],
          date: "2026-04-20T09:00:00.000Z",
        }),
      ]),
    ],
  };
}

function fixtureThread(
  id: string,
  messages: DemoInboxFixture["threads"][number]["messages"],
) {
  return { id, messages };
}

function fixtureMessage(
  message: DemoInboxFixture["threads"][number]["messages"][number],
) {
  return message;
}

function fixturePerson(name: string, email: string) {
  return { name, email };
}

function analyzeTrace(trace: AssistantChatTrace) {
  return analyzeAssistantOutput({
    finalText: trace.finalText,
    toolCalls: trace.toolCalls,
  });
}

function hasExpectedCreatedRule(
  scenario: Scenario,
  createdRules: DemoInboxRuleRow[],
) {
  if (!scenario.expectRuleWrite && !scenario.name.includes("creates")) {
    return createdRules.length === 0;
  }

  if (!scenario.name.toLowerCase().includes("product")) {
    return createdRules.length > 0;
  }

  return createdRules.some((rule) => {
    const lowerName = rule.name.toLowerCase();
    const lowerInstructions = (rule.instructions ?? "").toLowerCase();
    const hasProductLabel = rule.actions.some(
      (action) =>
        action.type === ActionType.LABEL &&
        action.label?.toLowerCase() === "product updates",
    );
    const hasArchive = rule.actions.some(
      (action) => action.type === ActionType.ARCHIVE,
    );

    return (
      lowerName.includes("product") &&
      lowerInstructions.includes("security") &&
      lowerInstructions.includes("billing") &&
      hasProductLabel &&
      hasArchive
    );
  });
}

function analyzeAssistantOutput({
  finalText,
  toolCalls,
}: {
  finalText: string;
  toolCalls: RecordedToolCall[];
}) {
  const lowerText = finalText.toLowerCase();
  const usedRulesTool = hasTool(toolCalls, "getUserRulesAndSettings");
  const usedSearchTool = hasTool(toolCalls, "searchInbox");
  const usedCreateRule = hasTool(toolCalls, "createRule");
  const writeToolNames = new Set([
    "createRule",
    "updateRuleConditions",
    "updateRuleActions",
    "updateLearnedPatterns",
    "updatePersonalInstructions",
    "updateAssistantSettings",
    "manageInbox",
  ]);

  return {
    usedRulesTool,
    usedSearchTool,
    usedCreateRule,
    noRuleWrite: !toolCalls.some((toolCall) =>
      writeToolNames.has(toolCall.toolName),
    ),
    asksQuestion: finalText.includes("?"),
    mentionsEvidence: [
      "sample",
      "found",
      "saw",
      "inbox",
      "existing",
      "already",
      "rule",
    ].some((term) => lowerText.includes(term)),
    mentionsPriority: ["priority", "urgent", "high", "low", "important"].some(
      (term) => lowerText.includes(term),
    ),
    wordCount: finalText.trim().split(/\s+/).filter(Boolean).length,
  };
}

function hasTool(toolCalls: RecordedToolCall[], toolName: string) {
  return toolCalls.some((toolCall) => toolCall.toolName === toolName);
}

function formatTraceForReport(
  trace: AssistantChatTrace,
  analysis: ReturnType<typeof analyzeTrace>,
  state: ReturnType<typeof createAssistantRuleSuggestionState>,
) {
  return JSON.stringify({
    analysis,
    fixtureId: state.fixture.id,
    searchQueries: state.searchQueries,
    createdRules: summarizeRules(state.createdRules),
    toolCalls: summarizeRecordedToolCalls(trace.toolCalls, summarizeToolCall),
    rawToolCalls: trace.toolCalls,
    finalText: trace.finalText,
    debugArtifactPath: trace.debugArtifactPath,
  });
}

function formatEpisodeForReport({
  episode,
  analysis,
  state,
}: {
  episode: Awaited<ReturnType<typeof runAssistantEpisode>>;
  analysis: ReturnType<typeof analyzeAssistantOutput>;
  state: ReturnType<typeof createAssistantRuleSuggestionState>;
}) {
  const toolCalls = episode.traces.flatMap((trace) => trace.toolCalls);

  return JSON.stringify({
    analysis,
    fixtureId: state.fixture.id,
    searchQueries: state.searchQueries,
    createdRules: summarizeRules(state.createdRules),
    finalRules: summarizeRules(state.rules),
    transcript: episode.transcript,
    toolCalls: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
    rawToolCalls: toolCalls,
    finalText: episode.finalText,
    debugArtifactPaths: episode.traces.map((trace) => trace.debugArtifactPath),
  });
}

function summarizeRules(rules: DemoInboxRuleRow[]) {
  return rules.map((rule) => ({
    name: rule.name,
    instructions: rule.instructions,
    from: rule.from,
    to: rule.to,
    subject: rule.subject,
    actions: rule.actions.map((action) => ({
      type: action.type,
      label: action.label,
      folderName: action.folderName,
    })),
  }));
}

function formatErrorForReport(error: unknown) {
  if (error instanceof Error) {
    return JSON.stringify({
      errorName: error.name,
      message: error.message,
    });
  }

  return JSON.stringify({ message: String(error) });
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (toolCall.toolName === "searchInbox") {
    const input = toolCall.input as { query?: string; limit?: number };
    return `searchInbox(query=${input.query ?? ""}, limit=${input.limit ?? "default"})`;
  }

  if (toolCall.toolName === "createRule") {
    const input = toolCall.input as {
      name?: string;
      condition?: {
        aiInstructions?: string | null;
        static?: {
          from?: string | null;
          to?: string | null;
          subject?: string | null;
        };
      };
      actions?: Array<{
        type?: string;
        fields?: {
          label?: string | null;
          folderName?: string | null;
        } | null;
      }>;
    };
    const actions = input.actions
      ?.map((action) =>
        [
          action.type,
          action.fields?.label ? `label=${action.fields.label}` : null,
          action.fields?.folderName
            ? `folder=${action.fields.folderName}`
            : null,
        ]
          .filter(Boolean)
          .join(":"),
      )
      .join(",");
    const condition =
      input.condition?.aiInstructions ||
      input.condition?.static?.from ||
      input.condition?.static?.subject ||
      "";

    return `createRule(name=${input.name ?? ""}, condition=${truncate(condition, 120)}, actions=${actions ?? ""})`;
  }

  return toolCall.toolName;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
