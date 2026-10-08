import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
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

const logger = createTestLogger();

describe("matchReplyLanguage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateObject.mockResolvedValue({
      object: { content: "Tuesday works for me." },
    });
  });

  it("returns the original draft after 15 seconds even if generation ignores cancellation", async () => {
    vi.useFakeTimers();
    mockGenerateObject.mockImplementation(() => new Promise(() => {}));
    const result = matchReplyLanguage({
      content: "Tuesday works for me.",
      message: getMockMessage({ textPlain: "Is Tuesday OK?", textHtml: "" }),
      messages: [{ role: "user", content: "Draft a reply." }],
      emailAccount: getEmailAccount(),
      logger,
    });
    let settled = false;
    const observedResult = result.then((content) => {
      settled = true;
      return content;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(observedResult).resolves.toBe("Tuesday works for me.");
    expect(mockGenerateObject.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips generation without a source body or recent user text", async () => {
    const result = await matchReplyLanguage({
      content: "Tuesday works for me.",
      message: getMockMessage({ textPlain: "", textHtml: "", snippet: "" }),
      messages: [{ role: "user", content: [{ type: "text", text: "  " }] }],
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result).toBe("Tuesday works for me.");
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("excludes old language requests outside the three most recent user messages", async () => {
    await matchReplyLanguage({
      content: "Tuesday works for me.",
      message: getMockMessage({ textPlain: "Is Tuesday OK?", textHtml: "" }),
      messages: [
        { role: "user", content: "Write the previous reply in French." },
        { role: "user", content: "That reply is finished." },
        { role: "assistant", content: "Done." },
        { role: "user", content: "Read the next email." },
        { role: "assistant", content: "Tuesday?" },
        { role: "user", content: "Confirm Tuesday." },
      ],
      emailAccount: getEmailAccount(),
      logger,
    });

    const input = JSON.parse(mockGenerateObject.mock.calls[0][0].prompt);
    expect(input.userRequests).toEqual([
      "That reply is finished.",
      "Read the next email.",
      "Confirm Tuesday.",
    ]);
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
      logger,
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
      logger,
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
      logger,
    });

    const input = JSON.parse(mockGenerateObject.mock.calls[0][0].prompt);
    expect(input.userRequests).toEqual([
      "Please write the reply in Spanish.",
      "Confirm that Tuesday works.",
    ]);
  });
});
