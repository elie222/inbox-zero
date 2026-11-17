import { simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmUseCase } from "@/utils/llms/use-cases";
import { chatCompletionStream, toolCallAgentStream } from "./index";

const { mockGetModelForUseCase } = vi.hoisted(() => ({
  mockGetModelForUseCase: vi.fn(),
}));

vi.mock("@/utils/llms/use-cases", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/llms/use-cases")>()),
  getModelForUseCase: mockGetModelForUseCase,
}));

vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
  shouldForceNanoModel: vi.fn().mockResolvedValue({ shouldForce: false }),
}));

vi.mock("@/utils/usage", () => ({ saveAiUsage: vi.fn() }));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: vi.fn(() => undefined),
  isPosthogLlmEvalApproved: vi.fn(() => false),
}));

describe("toolCallAgentStream abort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not start further tool calls once the run is stopped", async () => {
    const controller = new AbortController();
    // The stop lands while the first tool call is running.
    const archive = vi.fn(async () => {
      controller.abort();
      return "archived";
    });
    mockGetModelForUseCase.mockReturnValue({
      provider: "openai",
      modelName: "test-model",
      model: createToolCallingModel(),
      fallbackModels: [],
      hasUserApiKey: true,
    });

    const result = await toolCallAgentStream({
      userAi: { aiProvider: null, aiModel: null, aiApiKey: null },
      userEmail: "user@test.com",
      emailAccountId: "email-account-id",
      useCase: LlmUseCase.AssistantChat,
      usageLabel: "test",
      promptHardening: { trust: "untrusted", level: "full" },
      messages: [{ role: "user", content: "Archive everything" }],
      tools: {
        archive: tool({ inputSchema: z.object({}), execute: archive }),
      },
      abortSignal: controller.signal,
    });

    const chunkTypes: string[] = [];
    for await (const chunk of result.toUIMessageStream()) {
      chunkTypes.push(chunk.type);
    }

    expect(chunkTypes).toContain("abort");
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("coalesces consecutive user messages before streaming to prevent Jinja role alternation errors (Issue #4648)", async () => {
    let capturedPrompt: unknown = null;
    const testModel = new MockLanguageModelV4({
      doStream: async (options) => {
        capturedPrompt = options.prompt;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "archive",
                input: "{}",
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
          }),
        };
      },
    });

    mockGetModelForUseCase.mockReturnValue({
      provider: "openai-compatible",
      modelName: "test-model",
      model: testModel,
      fallbackModels: [],
      hasUserApiKey: true,
    });

    const result = await toolCallAgentStream({
      userAi: { aiProvider: null, aiModel: null, aiApiKey: null },
      userEmail: "user@test.com",
      emailAccountId: "email-account-id",
      useCase: LlmUseCase.AssistantChat,
      usageLabel: "test",
      promptHardening: { trust: "trusted" },
      stopWhen: (options) => (options?.steps.length ?? 0) >= 1,
      tools: {
        archive: tool({ inputSchema: z.object({}), execute: async () => "ok" }),
      },
      messages: [
        { role: "system", content: "You are the assistant." },
        { role: "user", content: "[Automated context]" },
        { role: "user", content: "[Inbox snapshot]" },
        { role: "user", content: "The user is viewing this email..." },
        { role: "user", content: "reanalyse the tags on this email" },
      ],
    });

    const chunkTypes: string[] = [];
    for await (const chunk of result.toUIMessageStream()) {
      chunkTypes.push(chunk.type);
    }

    expect(chunkTypes).toContain("start-step");
    expect(capturedPrompt).toBeDefined();
    // Verify that consecutive user messages were merged into a single user message
    const promptMessages = capturedPrompt as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessages = promptMessages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(JSON.stringify(userMessages[0])).toContain("[Automated context]");
    expect(JSON.stringify(userMessages[0])).toContain(
      "reanalyse the tags on this email",
    );
  });

  it("coalesces consecutive user messages in chatCompletionStream", async () => {
    let capturedPrompt: unknown = null;
    const testModel = new MockLanguageModelV4({
      doStream: async (options) => {
        capturedPrompt = options.prompt;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "archive",
                input: "{}",
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
          }),
        };
      },
    });

    mockGetModelForUseCase.mockReturnValue({
      provider: "openai-compatible",
      modelName: "test-model",
      model: testModel,
      fallbackModels: [],
      hasUserApiKey: true,
    });

    const stream = await chatCompletionStream({
      userAi: { aiProvider: null, aiModel: null, aiApiKey: null },
      userEmail: "user@test.com",
      emailAccountId: "email-account-id",
      useCase: LlmUseCase.AssistantChat,
      usageLabel: "test",
      promptHardening: { trust: "trusted" },
      messages: [
        { role: "user", content: "Part 1" },
        { role: "user", content: "Part 2" },
      ],
    });

    for await (const _chunk of stream.textStream) {
      // consume to trigger language model call
    }

    expect(capturedPrompt).toBeDefined();
    const promptMessages = capturedPrompt as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessages = promptMessages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(JSON.stringify(userMessages[0])).toContain("Part 1\\n\\nPart 2");
  });
});

function createToolCallingModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "archive",
            input: "{}",
          },
          {
            type: "tool-call",
            toolCallId: "call-2",
            toolName: "archive",
            input: "{}",
          },
          {
            type: "finish",
            finishReason: { unified: "tool-calls", raw: undefined },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}
