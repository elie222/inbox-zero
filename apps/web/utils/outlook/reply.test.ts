import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createOutlookReplyContent } from "@/utils/outlook/reply";
import type { ParsedMessage } from "@/utils/types";

describe("Outlook email formatting", () => {
  // Set a specific timezone offset for consistent testing
  const testDate = new Date("2025-02-06T22:35:00.000Z");

  // Thanks to the LLM for helping mock this
  beforeEach(() => {
    // Mock the date to a fixed UTC timestamp
    vi.useFakeTimers();
    vi.setSystemTime(testDate);

    // Mock all date methods to use UTC values
    vi.spyOn(Date.prototype, "getHours").mockImplementation(function (
      this: Date,
    ) {
      return this.getUTCHours();
    });

    vi.spyOn(Date.prototype, "getMinutes").mockImplementation(function (
      this: Date,
    ) {
      return this.getUTCMinutes();
    });

    vi.spyOn(Date.prototype, "getDate").mockImplementation(function (
      this: Date,
    ) {
      return this.getUTCDate();
    });

    // Mock individual toLocaleString calls used by formatEmailDate
    const mockToLocaleString = vi.spyOn(Date.prototype, "toLocaleString");
    mockToLocaleString.mockImplementation(function (
      this: Date,
      _locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (options?.weekday === "short") return "Thu";
      if (options?.month === "short") return "Feb";
      if (options?.year === "numeric") return "2025";
      if (options?.day === "numeric") return "6";
      return ""; // Default case
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("formats reply email with Outlook-style formatting and Aptos font", () => {
    const textContent = "This is my reply";
    const message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml"> = {
      headers: {
        date: "Thu, 6 Feb 2025 23:23:47 +0200",
        from: "John Doe <john@example.com>",
        subject: "Test Email",
        to: "jane@example.com",
        "message-id": "<123@example.com>",
      },
      textPlain: "Original message content",
      textHtml: "<div>Original message content</div>",
    };

    const { html } = createOutlookReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    // Verify Aptos font is present
    expect(html).toContain(
      "font-family: Aptos, Calibri, Arial, Helvetica, sans-serif",
    );
    expect(html).toContain("font-size: 11pt");
    expect(html).toContain("color: rgb(0, 0, 0)");

    // Verify content is present
    expect(html).toContain("This is my reply");
    expect(html).toContain(
      "On Thu, 6 Feb 2025 at 21:23, John Doe <john@example.com> wrote:",
    );
    expect(html).toContain("<div>Original message content</div>");

    // Verify it does NOT use Gmail-specific classes
    expect(html).not.toContain("gmail_quote");
    expect(html).not.toContain("gmail_attr");
  });

  it("formats reply email correctly for RTL content with Outlook styling", () => {
    const textContent = "שלום, מה שלומך?"; // "Hello, how are you?" in Hebrew
    const message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml"> = {
      headers: {
        date: "Thu, 6 Feb 2025 23:23:47 +0200",
        from: "David Cohen <david@example.com>",
        subject: "Test Email",
        to: "sarah@example.com",
        "message-id": "<123@example.com>",
      },
      textPlain: "תוכן ההודעה המקורית", // "Original message content" in Hebrew
      textHtml: "<div>תוכן ההודעה המקורית</div>",
    };

    const { html } = createOutlookReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    // Verify RTL direction is set
    expect(html).toContain('dir="rtl"');

    // Verify Aptos font is still present
    expect(html).toContain(
      "font-family: Aptos, Calibri, Arial, Helvetica, sans-serif",
    );

    // Verify Hebrew content
    expect(html).toContain("שלום, מה שלומך?");
    expect(html).toContain("<div>תוכן ההודעה המקורית</div>");
  });

  it("generates proper plain text format", () => {
    const textContent = "This is my reply";
    const message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml"> = {
      headers: {
        date: "Thu, 6 Feb 2025 23:23:47 +0200",
        from: "John Doe <john@example.com>",
        subject: "Test Email",
        to: "jane@example.com",
        "message-id": "<123@example.com>",
      },
      textPlain: "Original message content",
      textHtml: "<div>Original message content</div>",
    };

    const { text } = createOutlookReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    expect(text).toBe(
      `This is my reply

On Thu, 6 Feb 2025 at 21:23, John Doe <john@example.com> wrote:

> Original message content`,
    );
  });
});
