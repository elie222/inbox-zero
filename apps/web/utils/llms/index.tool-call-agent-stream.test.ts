import { simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmUseCase } from "@/utils/llms/use-cases";
import { toolCallAgentStream } from "./index";

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
