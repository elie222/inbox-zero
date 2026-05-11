import { describe, it, expect } from "vitest";
import {
  getEmailClient,
  emailToContent,
  convertEmailHtmlToText,
  parseReply,
} from "./mail";

describe("emailToContent", () => {
  describe("content source fallback", () => {
    it.each([
      {
        name: "textHtml when available",
        email: {
          textHtml: "<p>Hello World</p>",
          textPlain: "Plain text",
          snippet: "Snippet",
        },
        expected: "Hello World",
      },
      {
        name: "textPlain when textHtml is empty",
        email: {
          textHtml: "",
          textPlain: "Plain text content",
          snippet: "Snippet",
        },
        expected: "Plain text content",
      },
      {
        name: "snippet when textHtml and textPlain are empty",
        email: {
          textHtml: "",
          textPlain: "",
          snippet: "Email snippet here",
        },
        expected: "Email snippet here",
      },
      {
        name: "empty string when all content sources are empty",
        email: {
          textHtml: "",
          textPlain: "",
          snippet: "",
        },
        expected: "",
      },
    ])("uses $name", ({ email, expected }) => {
      expect(emailToContent(email)).toBe(expected);
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
    it.each([
      {
        name: "Gmail-style forwarded content",
        textPlain:
          "My response here\n\n---------- Forwarded message ----------\nFrom: someone@example.com\nSubject: Original",
        expected: "My response here",
      },
      {
        name: "iOS-style forwarded content",
        textPlain:
          "Here is my reply\n\nBegin forwarded message:\n\nFrom: other@test.com",
        expected: "Here is my reply",
      },
      {
        name: "Outlook-style forwarded content",
        textPlain: "My comments\n\nOriginal Message\nFrom: sender@example.com",
        expected: "My comments",
      },
      {
        name: "content with no forward marker",
        textPlain: "Regular email content without forwards",
        expected: "Regular email content without forwards",
      },
    ])("handles $name", ({ textPlain, expected }) => {
      expect(
        emailToContent(createPlainTextEmail(textPlain), {
          removeForwarded: true,
        }),
      ).toBe(expected);
    });

    it("does not treat inline From and Subject text as a forwarded message", () => {
      const textPlain =
        "Please update the From: field and Subject: line before sending.";

      expect(
        emailToContent(createPlainTextEmail(textPlain), {
          removeForwarded: true,
        }),
      ).toBe(textPlain);
    });
  });

  describe("whitespace handling", () => {
    it("removes excessive whitespace", () => {
      const result = emailToContent(
        createPlainTextEmail("Hello    World\n\n\n\nTest"),
      );

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
  it.each([
    ["Gmail", "<abc123@mail.gmail.com>", "gmail"],
    ["Superhuman", "<msg@we.are.superhuman.com>", "superhuman"],
    ["Shortwave", "<email@mail.shortwave.com>", "shortwave"],
    ["generic email client", "<message@company.com>", "company.com"],
    [
      "message IDs with multiple @ symbols",
      "<test@something@domain.com>",
      "something",
    ],
    ["Outlook-style message IDs", "<BLUPR01MB1234@outlook.com>", "outlook.com"],
  ])("identifies %s", (_name, messageId, expected) => {
    expect(getEmailClient(messageId)).toBe(expected);
  });
});

function createPlainTextEmail(textPlain: string) {
  return {
    textPlain,
    textHtml: undefined,
    snippet: "",
  };
}
