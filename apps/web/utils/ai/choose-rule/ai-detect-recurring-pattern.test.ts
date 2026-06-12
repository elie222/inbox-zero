import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmail,
  getEmailAccount,
  createTestLogger,
} from "@/__tests__/helpers";
import { aiDetectRecurringPattern } from "./ai-detect-recurring-pattern";

const { createGenerateObjectMock, generateObjectMock, getModelForUseCaseMock } =
  vi.hoisted(() => ({
    createGenerateObjectMock: vi.fn(),
    generateObjectMock: vi.fn(),
    getModelForUseCaseMock: vi.fn(),
  }));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: createGenerateObjectMock,
}));

vi.mock("@/utils/llms/use-cases", async () => {
  const actual = await vi.importActual<typeof import("@/utils/llms/use-cases")>(
    "@/utils/llms/use-cases",
  );

  return {
    ...actual,
    getModelForUseCase: getModelForUseCaseMock,
  };
});

describe("aiDetectRecurringPattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerateObjectMock.mockReturnValue(generateObjectMock);
    generateObjectMock.mockResolvedValue({
      object: {
        matchedRule: null,
        explanation: "No recurring pattern.",
      },
    });
    getModelForUseCaseMock.mockReturnValue({ model: "test-model" });
  });

  it("limits sender history included in the prompt", async () => {
    const emails = Array.from({ length: 25 }, (_, index) =>
      getEmail({
        id: `email-${index}`,
        from: "updates@example.com",
        subject: `Sample ${index}`,
        content: `Unique body ${index}`,
      }),
    );

    await aiDetectRecurringPattern({
      emails,
      emailAccount: getEmailAccount(),
      rules: [{ name: "Updates", instructions: "Messages with updates" }],
      logger: createTestLogger(),
    });

    const prompt = generateObjectMock.mock.calls[0][0].prompt;

    expect(prompt.match(/<email>/g)).toHaveLength(10);
    expect(prompt).not.toContain("Unique body 14");
    expect(prompt).toContain("Unique body 15");
    expect(prompt).toContain("Unique body 24");
  });
});
