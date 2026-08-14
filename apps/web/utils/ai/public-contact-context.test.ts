import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { PublicContactContext } from "@/utils/ai/public-contact-context-schema";

const {
  generateTextMock,
  getModelForUseCaseMock,
  getStoredPublicContactContextMock,
  getWebSearchConfigMock,
  storePublicContactContextMock,
  storePublicContactContextNotFoundMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getModelForUseCaseMock: vi.fn(),
  getStoredPublicContactContextMock: vi.fn(),
  getWebSearchConfigMock: vi.fn(),
  storePublicContactContextMock: vi.fn(),
  storePublicContactContextNotFoundMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    EMAIL_ENCRYPT_SALT: "test-hmac-salt",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    del: vi.fn(),
    eval: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/utils/ai/public-contact-context-store", () => ({
  getStoredPublicContactContext: getStoredPublicContactContextMock,
  storePublicContactContext: storePublicContactContextMock,
  storePublicContactContextNotFound: storePublicContactContextNotFoundMock,
}));

vi.mock("@/utils/llms", () => ({
  createGenerateText: vi.fn(() => generateTextMock),
}));

vi.mock("@/utils/llms/use-cases", () => ({
  LlmUseCase: { MeetingWebSearch: "meeting-web-search" },
  getModelForUseCase: getModelForUseCaseMock,
}));

vi.mock("@/utils/ai/web-search", () => ({
  getWebSearchConfigForProvider: getWebSearchConfigMock,
}));

import { getPublicContactContext } from "@/utils/ai/public-contact-context";

describe("getPublicContactContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);
    getStoredPublicContactContextMock.mockResolvedValue({ status: "miss" });
    storePublicContactContextMock.mockResolvedValue(true);
    storePublicContactContextNotFoundMock.mockResolvedValue(true);
    getModelForUseCaseMock.mockReturnValue({
      provider: "openrouter",
      modelName: "openai/gpt-5.4-nano",
      model: { id: "model" },
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    });
    getWebSearchConfigMock.mockReturnValue({
      providerName: "OpenRouter",
      tools: { web_search: { type: "provider" } },
      providerOptions: { openrouter: { max_tool_calls: 1 } },
      toolChoice: "required",
    });
    generateTextMock.mockResolvedValue({ output: { context: getContext() } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not research or store personal email addresses", async () => {
    await expect(
      getPublicContactContext({
        email: "john@gmail.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "personal_email",
    });

    expect(getStoredPublicContactContextMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("returns a shared stored profile without exposing storage metadata", async () => {
    const context = getContext();
    getStoredPublicContactContextMock.mockResolvedValue({
      status: "found",
      context,
    });

    const result = await getPublicContactContext({
      email: "john@acme.com",
      name: "John Smith",
      emailAccount: getEmailAccount(),
    });

    expect(result).toEqual({ status: "found", context });
    expect(result).not.toHaveProperty("researchStartedAt");
    expect(result).not.toHaveProperty("userId");
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("researches only the public identity and stores the structured result", async () => {
    const context = getContext();

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({ status: "found", context });

    const request = generateTextMock.mock.calls[0]?.[0];
    expect(request.prompt).toContain("john@acme.com");
    expect(request.prompt).toContain("acme.com");
    expect(request.prompt).not.toContain("Confidential acquisition");
    expect(request.prompt).not.toContain("owner@inboxzero.com");
    expect(request.system).toContain("Do not include any email address");
    expect(request.providerOptions).toEqual({
      openrouter: { max_tool_calls: 1 },
    });
    expect(request.toolChoice).toBe("required");
    expect(storePublicContactContextMock).toHaveBeenCalledWith({
      email: "john@acme.com",
      context,
      researchStartedAt: expect.any(Date),
    });
  });

  it("records the research start time so slow workers cannot become current", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00.000Z"));
    generateTextMock.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-08-14T10:02:00.000Z"));
      return { output: { context: getContext() } };
    });

    await getPublicContactContext({
      email: "john@acme.com",
      name: "John Smith",
      emailAccount: getEmailAccount(),
    });

    expect(storePublicContactContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        researchStartedAt: new Date("2026-08-14T10:00:00.000Z"),
      }),
    );
  });

  it("does not return or store a generated profile containing an email", async () => {
    const context = getContext();
    generateTextMock.mockResolvedValue({
      output: {
        context: {
          ...context,
          company: {
            ...context.company!,
            description: "Reach John at private@example.com.",
          },
        },
      },
    });

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_found" });

    expect(storePublicContactContextMock).not.toHaveBeenCalled();
    expect(storePublicContactContextNotFoundMock).toHaveBeenCalledWith({
      email: "john@acme.com",
      researchStartedAt: expect.any(Date),
    });
  });

  it("does not invent a profile when public search has no confident match", async () => {
    generateTextMock.mockResolvedValue({ output: { context: null } });

    await expect(
      getPublicContactContext({
        email: "unknown@acme.com",
        name: "Unknown Person",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_found" });

    expect(storePublicContactContextNotFoundMock).toHaveBeenCalledWith({
      email: "unknown@acme.com",
      researchStartedAt: expect.any(Date),
    });
  });

  it("does not duplicate research while another request holds the lock", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "research_in_progress",
    });

    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("fails closed when the research lock is unavailable", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "cache_unavailable",
    });

    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("fails closed when durable storage is unavailable", async () => {
    getStoredPublicContactContextMock.mockResolvedValue({
      status: "unavailable",
    });

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "cache_unavailable",
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("does not attempt research when the selected model has no web search", async () => {
    getModelForUseCaseMock.mockReturnValue({
      provider: "anthropic",
      modelName: "claude-haiku",
      model: { id: "model" },
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    });
    getWebSearchConfigMock.mockReturnValue(null);

    await expect(
      getPublicContactContext({
        email: "john@acme.com",
        name: "John Smith",
        emailAccount: getEmailAccount(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "search_unavailable",
    });

    expect(generateTextMock).not.toHaveBeenCalled();
  });
});

function getEmailAccount(): EmailAccountWithAI {
  return {
    id: "account-1",
    userId: "user-1",
    email: "owner@inboxzero.com",
    about: "Confidential acquisition plans",
    multiRuleSelectionEnabled: false,
    sensitiveDataPolicy: null,
    timezone: "America/New_York",
    calendarBookingLink: null,
    user: {
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    },
    account: { provider: "google" },
  };
}

function getContext(
  overrides: Partial<PublicContactContext> = {},
): PublicContactContext {
  return {
    name: "John Smith",
    role: "Founder and CEO",
    company: {
      name: "Acme",
      domain: "acme.com",
      website: "https://acme.com",
      description: "Workflow software for growing teams.",
      industry: "Software",
      employeeCount: "Approximately 30 employees",
      funding: "$50M raised",
    },
    sources: [{ url: "https://acme.com/team" }],
    confidence: "high",
    ...overrides,
  };
}
