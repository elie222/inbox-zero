import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { aiTranslateEmails } from "./translate-email";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("@/utils/llms", () => ({
  createGenerateObject: mockCreateGenerateObject,
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

describe("aiTranslateEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array without calling the LLM when texts is empty", async () => {
    const result = await aiTranslateEmails({
      texts: [],
      targetLanguage: "en",
      emailAccount: getEmailAccount(),
    });

    expect(result).toEqual([]);
    expect(mockCreateGenerateObject).not.toHaveBeenCalled();
  });

  it("returns empty strings without calling the LLM when every text is blank", async () => {
    const result = await aiTranslateEmails({
      texts: ["", "   ", "\n"],
      targetLanguage: "es",
      emailAccount: getEmailAccount(),
    });

    expect(result).toEqual(["", "", ""]);
    expect(mockCreateGenerateObject).not.toHaveBeenCalled();
  });

  it("returns translations in the same order as the inputs", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        translations: ["Hello", "World"],
      },
    });

    const result = await aiTranslateEmails({
      texts: ["Hola", "Mundo"],
      targetLanguage: "en",
      emailAccount: getEmailAccount(),
    });

    expect(result).toEqual(["Hello", "World"]);
    expect(mockCreateGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Translate email",
        promptHardening: { trust: "untrusted", level: "compact" },
      }),
    );
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Target language (BCP 47): en"),
      }),
    );
  });

  it("throws when the model returns the wrong number of translations", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        translations: ["only one"],
      },
    });

    await expect(
      aiTranslateEmails({
        texts: ["uno", "dos"],
        targetLanguage: "en",
        emailAccount: getEmailAccount(),
      }),
    ).rejects.toThrow("Expected 2 translations, received 1");
  });

  it("hard-slices long texts without appending an ellipsis", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        translations: ["ok"],
      },
    });

    const longText = `${"a".repeat(30_000)}SHOULD_NOT_APPEAR`;

    await aiTranslateEmails({
      texts: [longText],
      targetLanguage: "en",
      emailAccount: getEmailAccount(),
    });

    const call = mockGenerateObject.mock.calls[0]?.[0] as { prompt: string };

    expect(call.prompt).toContain("a".repeat(30_000));
    expect(call.prompt).not.toContain("SHOULD_NOT_APPEAR");
    expect(call.prompt).not.toContain(`${"a".repeat(30_000)}...`);
  });

  it("pins the output schema length to the number of input texts", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        translations: ["one", "two", "three"],
      },
    });

    await aiTranslateEmails({
      texts: ["a", "b", "c"],
      targetLanguage: "en",
      emailAccount: getEmailAccount(),
    });

    const call = mockGenerateObject.mock.calls[0]?.[0] as {
      schema: {
        safeParse: (value: unknown) => { success: boolean };
      };
    };

    expect(
      call.schema.safeParse({ translations: ["one", "two", "three"] }).success,
    ).toBe(true);
    expect(
      call.schema.safeParse({ translations: ["one", "two"] }).success,
    ).toBe(false);
  });
});
