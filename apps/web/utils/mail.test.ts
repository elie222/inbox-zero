import { describe, it, expect, vi } from "vitest";
import {
  getEmailClient,
  emailToContent,
  convertEmailHtmlToText,
  parseReply,
} from "./mail";

vi.mock("server-only", () => ({}));

describe("emailToContent", () => {
  describe("content source fallback", () => {
    it("uses textHtml when available", () => {
      const email = {
        textHtml: "<p>Hello World</p>",
        textPlain: "Plain text",
        snippet: "Snippet",
      };
      const result = emailToContent(email);
      expect(result).toContain("Hello World");
    });

    it("falls back to textPlain when textHtml is empty", () => {
      const email = {
        textHtml: "",
        textPlain: "Plain text content",
        snippet: "Snippet",
      };
      const result = emailToContent(email);
      expect(result).toBe("Plain text content");
    });

    it("falls back to snippet when both textHtml and textPlain are empty", () => {
      const email = {
        textHtml: "",
        textPlain: "",
        snippet: "Email snippet here",
      };
      const result = emailToContent(email);
      expect(result).toBe("Email snippet here");
    });

    it("returns empty string when all content sources are empty", () => {
      const email = {
        textHtml: "",
        textPlain: "",
        snippet: "",
      };
      const result = emailToContent(email);
      expect(result).toBe("");
    });
  });

  describe("maxLength option", () => {
    it("truncates content and adds ellipsis", () => {
      const email = {
        textPlain: "This is a very long email content that should be truncated",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { maxLength: 20 });
      // truncate() adds "..." so result is maxLength + 3
      expect(result).toBe("This is a very long ...");
      expect(result.length).toBe(23);
    });

    it("does not truncate when maxLength is 0", () => {
      const longContent = "A".repeat(5000);
      const email = {
        textPlain: longContent,
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { maxLength: 0 });
      expect(result).toBe(longContent);
    });

    it("uses default maxLength of 2000 and adds ellipsis for long content", () => {
      const longContent = "A".repeat(3000);
      const email = {
        textPlain: longContent,
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email);
      // truncate adds "..." so 2000 + 3 = 2003
      expect(result.length).toBe(2003);
      expect(result.endsWith("...")).toBe(true);
    });
  });

  describe("removeForwarded option", () => {
    it("removes Gmail-style forwarded content", () => {
      const email = {
        textPlain:
          "My response here\n\n---------- Forwarded message ----------\nFrom: someone@example.com\nSubject: Original",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { removeForwarded: true });
      expect(result).toBe("My response here");
      expect(result).not.toContain("Forwarded message");
    });

    it("removes iOS-style forwarded content", () => {
      const email = {
        textPlain:
          "Here is my reply\n\nBegin forwarded message:\n\nFrom: other@test.com",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { removeForwarded: true });
      expect(result).toBe("Here is my reply");
    });

    it("removes Outlook-style forwarded content", () => {
      const email = {
        textPlain: "My comments\n\nOriginal Message\nFrom: sender@example.com",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { removeForwarded: true });
      expect(result).toBe("My comments");
    });

    it("preserves content when no forward marker found", () => {
      const email = {
        textPlain: "Regular email content without forwards",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email, { removeForwarded: true });
      expect(result).toBe("Regular email content without forwards");
    });
  });

  describe("whitespace handling", () => {
    it("removes excessive whitespace", () => {
      const email = {
        textPlain: "Hello    World\n\n\n\nTest",
        textHtml: undefined,
        snippet: "",
      };
      const result = emailToContent(email);
      expect(result).not.toContain("    ");
      expect(result).not.toContain("\n\n\n\n");
    });
  });
});

describe("convertEmailHtmlToText", () => {
  it("converts basic HTML to text", () => {
    const result = convertEmailHtmlToText({
      htmlText: "<p>Hello <strong>World</strong></p>",
    });
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("preserves link URLs when includeLinks is true", () => {
    const result = convertEmailHtmlToText({
      htmlText: '<a href="https://example.com">Click here</a>',
      includeLinks: true,
    });
    expect(result).toContain("Click here");
    expect(result).toContain("https://example.com");
  });

  it("removes link URLs when includeLinks is false", () => {
    const result = convertEmailHtmlToText({
      htmlText: '<a href="https://example.com">Click here</a>',
      includeLinks: false,
    });
    expect(result).toContain("Click here");
    expect(result).not.toContain("https://example.com");
  });

  it("removes images", () => {
    const result = convertEmailHtmlToText({
      htmlText: '<p>Text<img src="image.png" alt="photo"/>More text</p>',
    });
    expect(result).toContain("Text");
    expect(result).toContain("More text");
    expect(result).not.toContain("image.png");
  });

  it("handles complex HTML structure", () => {
    const result = convertEmailHtmlToText({
      htmlText: `
        <html>
          <body>
            <h1>Title</h1>
            <p>Paragraph one</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `,
    });
    // html-to-text uppercases h1 tags
    expect(result).toContain("TITLE");
    expect(result).toContain("Paragraph one");
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
  });

  it("hides link URL if same as text when includeLinks is true", () => {
    const result = convertEmailHtmlToText({
      htmlText: '<a href="https://example.com">https://example.com</a>',
      includeLinks: true,
    });
    // Should not duplicate the URL
    const urlCount = (result.match(/https:\/\/example\.com/g) || []).length;
    expect(urlCount).toBe(1);
  });
});

describe("parseReply", () => {
  it("extracts visible text from email reply", () => {
    const plainText = `New message here

On Jan 1, 2024, someone@example.com wrote:
> Old quoted content
> More quoted stuff`;

    const result = parseReply(plainText);
    expect(result).toContain("New message here");
    expect(result).not.toContain("Old quoted content");
    expect(result).not.toContain("More quoted stuff");
  });

  it("handles plain text without quotes", () => {
    const plainText = "Simple message without any quotes";
    const result = parseReply(plainText);
    expect(result).toBe("Simple message without any quotes");
  });
});

describe("getEmailClient", () => {
  it("identifies Gmail", () => {
    expect(getEmailClient("<abc123@mail.gmail.com>")).toBe("gmail");
  });

  it("identifies Superhuman", () => {
    expect(getEmailClient("<msg@we.are.superhuman.com>")).toBe("superhuman");
  });

  it("identifies Shortwave", () => {
    expect(getEmailClient("<email@mail.shortwave.com>")).toBe("shortwave");
  });

  it("extracts domain for generic email clients", () => {
    expect(getEmailClient("<message@company.com>")).toBe("company.com");
  });

  it("handles message IDs with multiple @ symbols", () => {
    expect(getEmailClient("<test@something@domain.com>")).toBe("something");
  });

  it("extracts domain from Outlook-style message IDs", () => {
    expect(getEmailClient("<BLUPR01MB1234@outlook.com>")).toBe("outlook.com");
  });
});
