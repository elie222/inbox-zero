import { describe, expect, it } from "vitest";
import { markdownToSlackMrkdwn } from "@inboxzero/slack";

describe("markdownToSlackMrkdwn", () => {
  it("converts bold **text** to *text*", () => {
    expect(markdownToSlackMrkdwn("**Hello**")).toBe("*Hello*");
    expect(markdownToSlackMrkdwn("This is **bold** text")).toBe(
      "This is *bold* text",
    );
  });

  it("converts escaped bold markdown to Slack bold", () => {
    expect(markdownToSlackMrkdwn("\\*\\*Hello\\*\\*")).toBe("*Hello*");
    expect(markdownToSlackMrkdwn("This is \\*\\*bold\\*\\* text")).toBe(
      "This is *bold* text",
    );
  });

  it("converts Markdown links to Slack links", () => {
    expect(markdownToSlackMrkdwn("[Click here](https://example.com)")).toBe(
      "<https://example.com|Click here>",
    );
  });

  it("converts headings to bold", () => {
    expect(markdownToSlackMrkdwn("# Heading")).toBe("*Heading*");
    expect(markdownToSlackMrkdwn("### Sub heading")).toBe("*Sub heading*");
  });

  it("converts bullet points", () => {
    expect(markdownToSlackMrkdwn("* Item one")).toBe("• Item one");
    expect(markdownToSlackMrkdwn("- Item two")).toBe("• Item two");
    expect(markdownToSlackMrkdwn("  * Nested item")).toBe("  • Nested item");
  });

  it("converts escaped bullet points", () => {
    expect(markdownToSlackMrkdwn("\\* Item one")).toBe("• Item one");
    expect(markdownToSlackMrkdwn("\\- Item two")).toBe("• Item two");
    expect(markdownToSlackMrkdwn("  \\* Nested item")).toBe("  • Nested item");
  });

  it("handles bold inside bullet points", () => {
    expect(
      markdownToSlackMrkdwn(
        "*   **Organize with Labels:** Automatically label emails",
      ),
    ).toBe("• *Organize with Labels:* Automatically label emails");
  });

  it("handles a full AI response", () => {
    const markdown = `Here are some things I can do:

*   **Organize with Labels:** Automatically label emails.
*   **Clean Up Your Inbox:** Archive or mark emails as read.
*   **Draft Replies:** Automatically draft responses.

**Is there a specific task you'd like help with?**`;

    const expected = `Here are some things I can do:

• *Organize with Labels:* Automatically label emails.
• *Clean Up Your Inbox:* Archive or mark emails as read.
• *Draft Replies:* Automatically draft responses.

*Is there a specific task you'd like help with?*`;

    expect(markdownToSlackMrkdwn(markdown)).toBe(expected);
  });

  it("handles a full AI response with escaped markdown", () => {
    const markdown = `You have a few items that need your attention today.

\\*\\*Must Handle (To Reply)\\*\\*
\\* Customer Support:
    \\* \\*\\*Aldo:\\*\\* Mentioned an issue with API key.
    \\* \\*\\*Sara:\\*\\* Reporting an error.

\\*\\*Can Wait (FYI)\\*\\*
\\* Newsletter from a service.`;

    const expected = `You have a few items that need your attention today.

*Must Handle (To Reply)*
• Customer Support:
    • *Aldo:* Mentioned an issue with API key.
    • *Sara:* Reporting an error.

*Can Wait (FYI)*
• Newsletter from a service.`;

    expect(markdownToSlackMrkdwn(markdown)).toBe(expected);
  });

  it("leaves plain text unchanged", () => {
    expect(markdownToSlackMrkdwn("Just plain text")).toBe("Just plain text");
  });

  it("preserves code blocks", () => {
    expect(markdownToSlackMrkdwn("`code`")).toBe("`code`");
  });
});
