import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiGenerateMeetingBriefing } from "./generate-briefing";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";
import { createScopedLogger } from "@/utils/logger";

const mocks = vi.hoisted(() => ({
  createGenerateText: vi.fn(),
  research: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { PERPLEXITY_API_KEY: "test-key" } }));
vi.mock("@/utils/llms", () => ({
  createGenerateText: mocks.createGenerateText,
}));
vi.mock("@/utils/llms/use-cases", () => ({
  LlmUseCase: { MeetingBriefing: "briefing", MeetingWebSearch: "search" },
  getModelForUseCase: () => ({ provider: "test", fallbackModels: [] }),
}));
vi.mock("@/utils/ai/web-search", () => ({
  getWebSearchConfigForProvider: () => null,
}));
vi.mock("@/utils/ai/mcp/mcp-tools", () => ({
  createMcpToolsForAgent: async () => ({ tools: {}, cleanup: mocks.cleanup }),
}));
vi.mock("@/utils/redis/research-cache", () => ({
  getCachedResearch: mocks.getCached,
  setCachedResearch: mocks.setCached,
}));

const emailAccount = {
  id: "test-account",
  userId: "test-user",
  email: "owner@example.org",
  user: {},
  timezone: "UTC",
} as EmailAccountWithAI;
const briefingData = {
  event: {
    title: "Synthetic meeting",
    startTime: new Date("2026-01-01T12:00:00Z"),
  },
  externalGuests: [{ email: "guest@example.org" }],
  internalTeamMembers: [],
  emailThreads: [],
  pastMeetings: [],
} as unknown as MeetingBriefingData;
const query = {
  query: "Research Example Organization",
  email: "guest@example.org",
};
const briefing = { priorities: [], guests: [] };
let researchResult: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(null);
  mocks.setCached.mockResolvedValue(undefined);
  mocks.cleanup.mockResolvedValue(undefined);
  mocks.research.mockResolvedValue({ text: "Synthetic research" });
  mocks.createGenerateText.mockImplementation(({ label }) =>
    label === "Perplexity Search"
      ? mocks.research
      : async ({
          tools,
        }: {
          tools: Record<
            string,
            { execute: (input: unknown) => Promise<unknown> }
          >;
        }) => {
          researchResult = await tools.perplexitySearch.execute(query);
          await tools.finalizeBriefing.execute(briefing);
        },
  );
});

describe("meeting research integration", () => {
  it("uses the Agent API adapter with hardening and caches successful research", async () => {
    expect(await runBriefing()).toEqual(briefing);
    expect(researchResult).toBe("Synthetic research");
    expect(mocks.createGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Perplexity Search",
        modelOptions: expect.objectContaining({
          provider: "perplexity",
          modelName: "agent-fast",
          model: expect.objectContaining({
            modelId: "agent-fast",
            specificationVersion: "v4",
          }),
        }),
        promptHardening: { trust: "untrusted", level: "full" },
      }),
    );
    expect(mocks.setCached).toHaveBeenCalledWith(
      "test-user",
      "perplexity",
      "guest@example.org",
      undefined,
      "Synthetic research",
    );
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it("uses cached research without calling the provider", async () => {
    mocks.getCached.mockResolvedValue("Cached research");
    await runBriefing();
    expect(researchResult).toBe("Cached research");
    expect(mocks.research).not.toHaveBeenCalled();
    expect(mocks.setCached).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it.each([
    "error",
    "empty",
  ])("keeps the search fallback and avoids caching %s results", async (scenario) => {
    if (scenario === "error")
      mocks.research.mockRejectedValueOnce(new Error("Synthetic failure"));
    else mocks.research.mockResolvedValueOnce({ text: "   " });
    expect(await runBriefing()).toEqual(briefing);
    expect(researchResult).toBe("Search failed. Try another search tool.");
    expect(mocks.setCached).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});

async function runBriefing() {
  return aiGenerateMeetingBriefing({
    briefingData,
    emailAccount,
    logger: createScopedLogger("research-test"),
  });
}
