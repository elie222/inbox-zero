import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { aiCheckUnsubscribePageState } from "./unsubscribe-page";

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

describe("aiCheckUnsubscribePageState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the model's confirmation for an acknowledgment page", async () => {
    mockGenerateObject.mockResolvedValue({ object: { state: "confirmed" } });

    const result = await aiCheckUnsubscribePageState({
      pageText: "You have been removed from this list.",
      emailAccount: getEmailAccount(),
    });

    expect(result).toBe("confirmed");
    expect(mockCreateGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Unsubscribe page state",
        promptHardening: { trust: "untrusted", level: "compact" },
      }),
    );
  });

  it("returns the model's answer for a page still awaiting a confirmation", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { state: "not_confirmed" },
    });

    const result = await aiCheckUnsubscribePageState({
      pageText: "Press confirm to stop receiving these emails.",
      emailAccount: getEmailAccount(),
    });

    expect(result).toBe("not_confirmed");
  });

  it("does not confirm when the model call fails", async () => {
    mockGenerateObject.mockRejectedValue(new Error("no model configured"));

    const result = await aiCheckUnsubscribePageState({
      pageText: "You have been removed from this list.",
      emailAccount: getEmailAccount(),
    });

    expect(result).toBe("not_confirmed");
  });

  it("does not call the model for a page with no text", async () => {
    const result = await aiCheckUnsubscribePageState({
      pageText: "   \n  ",
      emailAccount: getEmailAccount(),
    });

    expect(result).toBe("not_confirmed");
    expect(mockCreateGenerateObject).not.toHaveBeenCalled();
  });

  it("truncates a long page before sending it to the model", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { state: "not_confirmed" },
    });

    await aiCheckUnsubscribePageState({
      pageText: `${"a".repeat(10_000)}SHOULD_NOT_APPEAR`,
      emailAccount: getEmailAccount(),
    });

    const call = mockGenerateObject.mock.calls[0]?.[0] as { prompt: string };

    expect(call.prompt).toContain("a".repeat(10_000));
    expect(call.prompt).not.toContain("SHOULD_NOT_APPEAR");
  });
});
