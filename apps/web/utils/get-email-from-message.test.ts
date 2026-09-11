import { describe, it, expect } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "./get-email-from-message";

function makeParsedMessage(
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    historyId: "history-1",
    date: "2024-01-01",
    subject: "Test",
    snippet: "",
    inline: [],
    headers: {
      from: "sender@test.com",
      to: "recipient@test.com",
      subject: "Test",
      date: "2024-01-01",
    },
    ...overrides,
  };
}

describe("getEmailForLLM", () => {
  it("strips zero-width characters from plain text", () => {
    const msg = makeParsedMessage({
      textPlain: "Hello\u200B \u200Cworld\u200D\u2060\uFEFF",
    });
    const result = getEmailForLLM(msg);
    expect(result.content).not.toMatch(/\u200B|\u200C|\u200D|\u2060|\uFEFF/);
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("world");
  });

  it("strips RTL/LTR override characters from plain text", () => {
    const msg = makeParsedMessage({
      textPlain: "Hello\u202Aworld\u202E",
    });
    const result = getEmailForLLM(msg);
    expect(result.content).not.toMatch(/[\u202A-\u202E]/);
    expect(result.content).toContain("Helloworld");
  });

  it("strips HTML comments from HTML content", () => {
    const msg = makeParsedMessage({
      textHtml: "<p>Visible</p><!-- hidden comment --><p>Also visible</p>",
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).toContain("Also visible");
    expect(result.content).not.toContain("hidden comment");
  });

  it("preserves URLs from descriptive HTML links when requested", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>Can you add your billing info <a href="https://example.com/billing">here</a>?</p>',
    });
    const result = getEmailForLLM(msg, { includeLinkUrls: true });

    expect(result.content).toContain("billing info here");
    expect(result.content).toContain("https://example.com/billing");
  });

  it("preserves image alt text without image source URLs when requested", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>See below.</p><img src="https://tracker.example.com/pixel.png" alt="Billing form screenshot" />',
    });
    const result = getEmailForLLM(msg, { includeImageAltText: true });

    expect(result.content).toContain("[image: Billing form screenshot]");
    expect(result.content).not.toContain("https://tracker.example.com");
  });

  it("uses a placeholder for images without alt text when image alt text is requested", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>See below.</p><img src="https://tracker.example.com/pixel.png" />',
    });
    const result = getEmailForLLM(msg, { includeImageAltText: true });

    expect(result.content).toContain("See below.");
    expect(result.content).toContain("[image]");
    expect(result.content).not.toContain("https://tracker.example.com");
  });

  it("strips display:none elements from HTML content", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>Visible</p><span style="display:none">secret instruction</span><p>End</p>',
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).toContain("End");
    expect(result.content).not.toContain("secret instruction");
  });

  it("strips hidden elements with single-quoted styles from HTML content", () => {
    const msg = makeParsedMessage({
      textHtml:
        "<p>Visible</p><span style='display:none'>hidden one</span><div style='visibility:hidden'>hidden two</div><span style='font-size:0px'>hidden three</span><p>End</p>",
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).toContain("End");
    expect(result.content).not.toContain("hidden one");
    expect(result.content).not.toContain("hidden two");
    expect(result.content).not.toContain("hidden three");
  });

  it("strips hidden elements with !important and zero-unit styles", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>Visible</p><span style="display:none !important">hidden one</span><div style="visibility:hidden !important">hidden two</div><span style="font-size:0rem">hidden three</span><p>End</p>',
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).toContain("End");
    expect(result.content).not.toContain("hidden one");
    expect(result.content).not.toContain("hidden two");
    expect(result.content).not.toContain("hidden three");
  });

  it("strips visibility:hidden elements from HTML content", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>Visible</p><div style="visibility:hidden">hidden text</div><p>End</p>',
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).not.toContain("hidden text");
  });

  it("strips font-size:0 elements from HTML content", () => {
    const msg = makeParsedMessage({
      textHtml:
        '<p>Visible</p><span style="font-size:0px">invisible</span><p>End</p>',
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Visible");
    expect(result.content).not.toContain("invisible");
  });

  it("passes through clean emails unchanged", () => {
    const msg = makeParsedMessage({
      textPlain: "Normal email content here",
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toContain("Normal email content here");
  });

  it("strips hidden characters from snippet fallback content", () => {
    const msg = makeParsedMessage({
      snippet: "Hello\u200B world\u2060",
      textPlain: undefined,
      textHtml: undefined,
    });
    const result = getEmailForLLM(msg);
    expect(result.content).toBe("Hello world");
  });
});
