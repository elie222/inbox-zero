import { describe, expect, it } from "vitest";
import { markdownToSlackMrkdwn, richTextToSlackMrkdwn } from "./format";

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

  it("encodes spaces in markdown link hrefs", () => {
    expect(
      markdownToSlackMrkdwn("[Click here](https://example.com/has a space)"),
    ).toBe("<https://example.com/has%20a%20space|Click here>");
  });

  it("escapes link labels inside generated Slack links", () => {
    expect(markdownToSlackMrkdwn("[Click > here](https://example.com)")).toBe(
      "<https://example.com|Click &gt; here>",
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

  it("escapes plain-text email addresses wrapped in angle brackets", () => {
    expect(
      markdownToSlackMrkdwn("Display Name <notifications@github.com>"),
    ).toBe("Display Name &lt;notifications@github.com&gt;");
  });

  it("preserves existing entities inside invalid angle-bracket blocks", () => {
    expect(markdownToSlackMrkdwn("Keep <abc &amp; def> safe")).toBe(
      "Keep &lt;abc &amp; def&gt; safe",
    );
  });

  it("preserves valid Slack mrkdwn blocks", () => {
    expect(
      markdownToSlackMrkdwn("Ping <@U123ABC> in <#C123ABC456> or <!here>."),
    ).toBe("Ping <@U123ABC> in <#C123ABC456> or <!here>.");
  });

  it.each([
    ["user mention", "<@U123ABC>"],
    ["channel reference", "<#C123ABC456>"],
    ["special mention", "<!everyone>"],
    ["subteam mention", "<!subteam^S123ABC>"],
    ["date token", "<!date^1735689600^{date_short}|Jan 1>"],
    ["mailto link", "<mailto:test@example.com|Email me>"],
    ["http link", "<https://example.com/path?a=1&b=2|Example>"],
  ])("preserves valid Slack token: %s", (_label, token) => {
    expect(markdownToSlackMrkdwn(`Before ${token} after`)).toBe(
      `Before ${token} after`,
    );
  });

  it.each([
    ["unknown token", "Before <abc> after", "Before &lt;abc&gt; after"],
    [
      "email-like token",
      "Before <person@example.com> after",
      "Before &lt;person@example.com&gt; after",
    ],
    [
      "entity-bearing invalid token",
      "Before <abc &amp; def> after",
      "Before &lt;abc &amp; def&gt; after",
    ],
    [
      "broken mention shape",
      "Before <@user-name> after",
      "Before &lt;@user-name&gt; after",
    ],
  ])("escapes invalid angle-bracket block: %s", (_label, input, expected) => {
    expect(markdownToSlackMrkdwn(input)).toBe(expected);
  });

  it.each([
    ["unsafe protocol", "[Click me](ftp://example.com/file)", "Click me"],
    [
      "escaped label characters",
      "[A < B & C > D](https://example.com)",
      "<https://example.com|A &lt; B &amp; C &gt; D>",
    ],
    [
      "mailto href with spaces",
      "[Email](mailto:test@example.com?subject=hello world)",
      "<mailto:test@example.com?subject=hello%20world|Email>",
    ],
  ])("handles markdown link edge case: %s", (_label, input, expected) => {
    expect(markdownToSlackMrkdwn(input)).toBe(expected);
  });
});

describe("richTextToSlackMrkdwn", () => {
  it("converts HTML anchor tags to Slack links", () => {
    expect(
      richTextToSlackMrkdwn(
        'Drafted by <a href="https://example.com/ref">Inbox Zero</a>.',
      ),
    ).toBe("Drafted by <https://example.com/ref|Inbox Zero>.");
  });

  it("strips layout tags while preserving line breaks", () => {
    expect(
      richTextToSlackMrkdwn(
        "<div>Hello there</div><div>Second line<br>Third line</div>",
      ),
    ).toBe("Hello there\nSecond line\nThird line");
  });

  it("separates adjacent list items", () => {
    expect(
      richTextToSlackMrkdwn("<ul><li>First item</li><li>Second item</li></ul>"),
    ).toBe("• First item\n• Second item");
  });

  it("escapes unmatched angle brackets in plain text", () => {
    expect(richTextToSlackMrkdwn("Hello <script world")).toBe(
      "Hello &lt;script world",
    );
  });

  it("preserves existing HTML entities without double escaping", () => {
    expect(richTextToSlackMrkdwn("Fish &amp; Chips & gravy")).toBe(
      "Fish &amp; Chips &amp; gravy",
    );
  });

  it("preserves unknown angle-bracket blocks as escaped text", () => {
    expect(richTextToSlackMrkdwn("Keep <abc> and 2 < 3 > 1")).toBe(
      "Keep &lt;abc&gt; and 2 &lt; 3 &gt; 1",
    );
  });

  it("keeps literal placeholder-like text while replacing inserted links", () => {
    expect(
      richTextToSlackMrkdwn(
        '__SLACK_LINK_TOKEN_0__ <a href="https://example.com">Inbox Zero</a>',
      ),
    ).toBe("__SLACK_LINK_TOKEN_0__ <https://example.com/|Inbox Zero>");
  });

  it("escapes href fallback labels when anchor text is empty", () => {
    expect(
      richTextToSlackMrkdwn('<a href="https://example.com/?a=1&b=2"></a>'),
    ).toBe("<https://example.com/?a=1&b=2|https://example.com/?a=1&amp;b=2>");
  });

  it.each([
    [
      "unsafe anchor href",
      '<a href="javascript:alert(1)">Click me</a>',
      "Click me",
    ],
    [
      "empty unsafe anchor href",
      '<a href="javascript:alert(1)"></a>',
      "javascript:alert(1)",
    ],
    [
      "preserves valid entity text outside tags",
      "A &amp; B <span>inside</span>",
      "A &amp; B &lt;span&gt;inside&lt;/span&gt;",
    ],
  ])("handles rich text edge case: %s", (_label, input, expected) => {
    expect(richTextToSlackMrkdwn(input)).toBe(expected);
  });
});
