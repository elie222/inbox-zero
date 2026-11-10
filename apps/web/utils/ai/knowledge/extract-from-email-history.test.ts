import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmail,
  getEmailAccount,
} from "@/__tests__/helpers";
import { aiExtractFromEmailHistory } from "./extract-from-email-history";

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() => mockGenerateObject),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "test-model",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));

const logger = createTestLogger();

describe("aiExtractFromEmailHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no summary when the model finds no relevant history", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { hasHistoricalContext: false, summary: "Unrelated old topic." },
    });

    const result = await extract();

    expect(result).toBeNull();
  });

  it("returns the summary when the model finds relevant history", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { hasHistoricalContext: true, summary: "Delivery is Friday." },
    });

    const result = await extract();

    expect(result).toBe("Delivery is Friday.");
  });
});

function extract() {
  return aiExtractFromEmailHistory({
    currentThreadMessages: [getEmail({ content: "Current thread." })],
    historicalMessages: [getEmail({ content: "Earlier thread." })],
    emailAccount: getEmailAccount(),
    logger,
  });
}
