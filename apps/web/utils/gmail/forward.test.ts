import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { forwardEmailHtml } from "./forward";
import type { ParsedMessage } from "@/utils/types";

describe("email forwarding", () => {
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

  it("formats forwarded email like Gmail", () => {
    const content = "a test forwarded email";
    const message: Pick<ParsedMessage, "headers" | "textHtml"> = {
      headers: {
        from: "From <from@demo.com>",
        date: testDate.toISOString(),
        subject: "great meeting!",
        to: "To <to@demo.com>",
        "message-id": "<123@example.com>",
      },
      textHtml:
        '<div style="font-family:Arial,sans-serif;font-size:14px">hey, was great to meet today. when can we get lunch?</div>',
    };

    const html = forwardEmailHtml({
      content,
      message: message as ParsedMessage,
    });

    expect(html).toBe(
      `<div dir="ltr">${content}<br><br>
<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">---------- Forwarded message ----------<br>
From: <strong class="gmail_sendername" dir="auto">From</strong> <span dir="auto">&lt;<a href="mailto:from@demo.com">from@demo.com</a>&gt;</span><br>
Date: Thu, 6 Feb 2025 at 22:35<br>
Subject: great meeting!<br>
To: To &lt;<a href="mailto:to@demo.com">to@demo.com</a>&gt;<br>
</div><br><br>
${message.textHtml}
</div></div>`.trim(),
    );
  });
});
