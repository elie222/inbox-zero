import { describe, it, expect, vi, beforeAll } from "vitest";
import { calculateSimilarity } from "./similarity-score";

vi.mock("server-only", () => ({}));

describe("calculateSimilarity - basic tests", () => {
  it("should return 0.0 if either text is null or undefined", () => {
    expect(calculateSimilarity(null, "text2")).toBe(0.0);
    expect(calculateSimilarity("text1", undefined)).toBe(0.0);
    expect(calculateSimilarity(null, null)).toBe(0.0);
  });

  it("should return 1.0 for identical texts", () => {
    const score = calculateSimilarity("Hello world", "Hello world");
    expect(score).toBe(1.0);
  });

  it("should be case-insensitive", () => {
    const score = calculateSimilarity("Hello World", "hello world");
    expect(score).toBe(1.0);
  });

  it("should return 0.0 for completely different texts", () => {
    const score = calculateSimilarity("abc", "xyz");
    expect(score).toBe(0.0);
  });

  it("should handle whitespace normalization", () => {
    const score = calculateSimilarity("  Hello world  ", "Hello world");
    expect(score).toBe(1.0);
  });

  it("should return partial score for similar texts", () => {
    const score = calculateSimilarity(
      "This is the first sentence.",
      "This is the second sentence.",
    );
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it("should handle special characters", () => {
    const score = calculateSimilarity(
      "Text with $pecial chars!",
      "text with $pecial chars!",
    );
    expect(score).toBe(1.0);
  });

  it("should return 0.0 if first text is empty after normalization", () => {
    const score = calculateSimilarity("", "text2");
    expect(score).toBe(0.0);
  });

  it("should return 0.0 if second text is empty after normalization", () => {
    const score = calculateSimilarity("text1", "");
    expect(score).toBe(0.0);
  });

  it("should return 1.0 if both normalized texts are empty", () => {
    // Both whitespace-only strings should normalize to empty and match
    const score = calculateSimilarity("   ", "   ");
    expect(score).toBe(1.0);
  });

  it("should handle a realistic email with minor changes", () => {
    const original = `Hi Team,

Just a quick reminder about the meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Thanks,
Bob`;

    const modified = `Hi Team,

Just a quick reminder about the all-hands meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Best,
Bob`;

    const score = calculateSimilarity(original, modified);

    // Should be very similar but not identical
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1.0);
  });

  it("should detect small word changes", () => {
    const score = calculateSimilarity(
      "I will review this tomorrow",
      "I will review this today",
    );
    // Should be similar but not identical
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(1.0);
  });
});

/**
 * Integration tests that use the real implementation with ParsedMessage objects.
 * These test the actual Outlook HTML handling fix.
 */
describe("calculateSimilarity - integration tests with ParsedMessage", () => {
  // Import real implementation without mocks
  let realCalculateSimilarity: typeof calculateSimilarity;

  beforeAll(async () => {
    // Clear the module cache and re-import without mocks
    vi.resetModules();
    vi.doUnmock("@/utils/mail");
    const module = await import("./similarity-score");
    realCalculateSimilarity = module.calculateSimilarity;
  });

  const createParsedMessage = (
    textPlain: string,
    bodyContentType?: "html" | "text",
  ) => ({
    id: "msg-123",
    threadId: "thread-456",
    textPlain,
    textHtml: undefined,
    subject: "Test Subject",
    date: new Date().toISOString(),
    snippet: "snippet",
    historyId: "12345",
    internalDate: "1234567890",
    headers: {
      from: "test@example.com",
      to: "recipient@example.com",
      subject: "Test",
      date: "Mon, 1 Jan 2024 12:00:00 +0000",
    },
    labelIds: [] as string[],
    inline: [] as never[],
    bodyContentType,
  });

  describe("Outlook HTML content handling", () => {
    it("should return 1.0 when comparing stored plain text with Outlook HTML response", () => {
      const storedContent = "Hello, this is a test draft";
      const outlookMessage = createParsedMessage(
        '<html><body><div dir="ltr">Hello, this is a test draft</div></body></html>',
        "html",
      );

      const score = realCalculateSimilarity(storedContent, outlookMessage);
      expect(score).toBe(1.0);
    });

    it("should return 1.0 when comparing stored content with signature to Outlook HTML", () => {
      const storedContent =
        'Hello, this is a test draft\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.';
      const outlookMessage = createParsedMessage(
        '<html><body><div dir="ltr">Hello, this is a test draft<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div></body></html>',
        "html",
      );

      const score = realCalculateSimilarity(storedContent, outlookMessage);
      expect(score).toBe(1.0);
    });

    it("should return 1.0 for Outlook response with quoted content", () => {
      const storedContent = "Thanks for the update!";
      const outlookMessage = createParsedMessage(
        `<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">Thanks for the update!</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 11 Nov 2025 at 2:18, John wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex; border-left:1px solid rgb(204,204,204); padding-left:1ex"><div dir="ltr">Previous message</div></blockquote></div></body></html>`,
        "html",
      );

      const score = realCalculateSimilarity(storedContent, outlookMessage);
      expect(score).toBe(1.0);
    });
  });

  describe("Gmail content handling (with ParsedMessage)", () => {
    it("should return 1.0 when comparing stored content with Gmail response with quotes", () => {
      const storedContent = "Thanks for reaching out! I'll get back to you.";
      const gmailMessage = createParsedMessage(
        `Thanks for reaching out! I'll get back to you.

On Mon, Jan 1, 2024 at 10:00 AM Sender <sender@example.com> wrote:
> Original message content here`,
      );

      const score = realCalculateSimilarity(storedContent, gmailMessage);
      expect(score).toBe(1.0);
    });

    it("should return 1.0 for identical content with different newline styles", () => {
      const storedContent = "Line 1\nLine 2\nLine 3";
      const gmailMessage = createParsedMessage("Line 1\r\nLine 2\r\nLine 3");

      const score = realCalculateSimilarity(storedContent, gmailMessage);
      expect(score).toBe(1.0);
    });
  });

  describe("Sent email tracking scenarios", () => {
    it("should return 1.0 when user sends AI draft unmodified", () => {
      const originalDraft = `Hi there,

Thanks for your email. I'll review this and get back to you shortly.

Best regards`;

      const sentMessage = createParsedMessage(
        `Hi there,

Thanks for your email. I'll review this and get back to you shortly.

Best regards

On Mon, Jan 1, 2024 at 9:00 AM <someone@example.com> wrote:
> Their original question`,
      );

      const score = realCalculateSimilarity(originalDraft, sentMessage);
      expect(score).toBe(1.0);
    });
  });

  describe("Backwards compatibility with plain strings", () => {
    it("should handle plain string as second argument for backwards compatibility", () => {
      const storedContent = "Hello world";
      const plainString = "Hello world";

      const score = realCalculateSimilarity(storedContent, plainString);
      expect(score).toBe(1.0);
    });

    it("should still strip quotes when using plain string", () => {
      const storedContent = "My reply";
      const plainString = `My reply

On Mon, Jan 1, 2024 wrote:
> Quote content`;

      const score = realCalculateSimilarity(storedContent, plainString);
      expect(score).toBe(1.0);
    });
  });
});
