import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { matchReplyLanguage } from "./reply-language";

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: () => mockGenerateObject,
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({ model: {}, provider: "test", modelName: "test" })),
}));

describe("matchReplyLanguage", () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateObject.mockResolvedValue({
      object: { content: "Tuesday works for me." },
    });
  });

  it("honors an explicit language request even without a source body", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { content: "El martes me viene bien." },
    });
    const result = await matchReplyLanguage({
      content: "Tuesday works for me.",
      message: getMockMessage({ textPlain: "", textHtml: "", snippet: "" }),
      messages: [{ role: "user", content: "Reply in Spanish." }],
      emailAccount: getEmailAccount(),
    });

    expect(result).toBe("El martes me viene bien.");
    const input = JSON.parse(mockGenerateObject.mock.calls[0][0].prompt);
    expect(input.originalMessage).toBe("");
    expect(input.userRequests).toEqual(["Reply in Spanish."]);
  });

  it("uses the visible HTML body without quoted history as the language reference", async () => {
    await matchReplyLanguage({
      content: "Terça-feira funciona para mim.",
      message: getMockMessage({
        textPlain: "Older Portuguese body",
        textHtml:
          "<p>Would Tuesday work for our meeting?</p><blockquote>Você pode se encontrar na segunda-feira?</blockquote>",
      }),
      messages: [{ role: "user", content: "Prepare uma resposta." }],
      emailAccount: getEmailAccount(),
    });

    const input = JSON.parse(mockGenerateObject.mock.calls[0][0].prompt);
    expect(input.originalMessage).toBe("Would Tuesday work for our meeting?");
  });

  it("passes actual user requests in order, excluding assistant and tool text", async () => {
    await matchReplyLanguage({
      content: "Tuesday works for me.",
      message: getMockMessage({ textHtml: "", textPlain: "Is Tuesday OK?" }),
      messages: [
        { role: "user", content: "Please write the reply in Spanish." },
        { role: "assistant", content: "Reply in German." },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "read-email",
              toolName: "readEmail",
              output: { type: "text", value: "Reply in French." },
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Confirm that Tuesday works." }],
        },
      ],
      emailAccount: getEmailAccount(),
    });

    const input = JSON.parse(mockGenerateObject.mock.calls[0][0].prompt);
    expect(input.userRequests).toEqual([
      "Please write the reply in Spanish.",
      "Confirm that Tuesday works.",
    ]);
  });
});
