import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createReplyContent } from "@/utils/gmail/reply";
import type { ParsedMessage } from "@/utils/types";

describe("email formatting", () => {
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

  it("formats reply email like Gmail", () => {
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

    const { html } = createReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    // Email addresses in quotedHeader are now escaped for security
    expect(html).toBe(
      `<div dir="ltr">This is my reply</div>
<br>
<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">On Thu, 6 Feb 2025 at 21:23, John Doe &lt;john@example.com&gt; wrote:<br></div>
  <blockquote class="gmail_quote" 
    style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    <div>Original message content</div>
  </blockquote>
</div>`.trim(),
    );
  });

  it("formats reply email correctly for RTL content", () => {
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

    const { html } = createReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    // Email addresses in quotedHeader are now escaped for security
    // Hebrew text is HTML-encoded by he.encode()
    expect(html).toBe(
      `<div dir="rtl">&#x5E9;&#x5DC;&#x5D5;&#x5DD;, &#x5DE;&#x5D4; &#x5E9;&#x5DC;&#x5D5;&#x5DE;&#x5DA;?</div>
<br>
<div class="gmail_quote gmail_quote_container">
  <div dir="rtl" class="gmail_attr">On Thu, 6 Feb 2025 at 21:23, David Cohen &lt;david@example.com&gt; wrote:<br></div>
  <blockquote class="gmail_quote" 
    style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    <div>תוכן ההודעה המקורית</div>
  </blockquote>
</div>`.trim(),
    );
  });

  it("handles CRLF line endings correctly", () => {
    const textContent = "Line one\r\nLine two\r\nLine three";
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

    const { html } = createReplyContent({
      textContent,
      message,
    });

    // Should convert CRLF to <br> without leftover \r characters
    expect(html).toContain("Line one<br>Line two<br>Line three");
    expect(html).not.toContain("\r");
  });

  it("preserves paragraph spacing with multiple newlines", () => {
    const textContent =
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
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

    const { html } = createReplyContent({
      textContent,
      message,
    });

    // Should preserve double newlines as <br><br> for paragraph spacing
    expect(html).toContain(
      "First paragraph.<br><br>Second paragraph.<br><br>Third paragraph.",
    );
  });
});
