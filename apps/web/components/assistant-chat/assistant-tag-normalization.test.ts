import { describe, expect, it } from "vitest";
import { normalizeAssistantTagMarkup } from "@/components/assistant-chat/assistant-tag-normalization";

describe("normalizeAssistantTagMarkup", () => {
  it.each([
    {
      name: "whitespace between attributes",
      input:
        '<rule-suggestion\n\nname="Large messages"\r\narchive="true">Review</rule-suggestion>',
      expected:
        '<rule-suggestion name="Large messages" archive="true">Review</rule-suggestion>',
    },
    {
      name: "smart double quotes containing a greater-than sign",
      input:
        "<rule-suggestion name=“Large messages” when=“size > 10MB”></rule-suggestion>",
      expected:
        '<rule-suggestion name="Large messages" when="size > 10MB"></rule-suggestion>',
    },
    {
      name: "smart single quotes",
      input: "<email-detail threadid=‘thread-1’>Receipt</email-detail>",
      expected: "<email-detail threadid='thread-1'>Receipt</email-detail>",
    },
    {
      name: "self-closing tags",
      input: '<rule-suggestion name="Monitoring" archive="true" />',
      expected:
        '<rule-suggestion name="Monitoring" archive="true"></rule-suggestion>',
    },
    {
      name: "uppercase allowed tag names",
      input: "<EMAIL />",
      expected: "<EMAIL></EMAIL>",
    },
  ])("normalizes $name", ({ input, expected }) => {
    expect(normalizeAssistantTagMarkup(input)).toBe(expected);
  });

  it.each([
    {
      name: "bare container tags",
      input: "&lt;emails&gt;&lt;/emails&gt;",
      expected: "<emails></emails>",
    },
    {
      name: "quoted greater-than entities",
      input: "&lt;rule-suggestion when=&quot;size &gt; 10MB&quot; /&gt;",
      expected: '<rule-suggestion when="size &gt; 10MB"></rule-suggestion>',
    },
    {
      name: "uppercase entities",
      input:
        "&LT;email-detail threadid=&QUOT;thread-1&QUOT;&GT;Receipt&LT;/email-detail&GT;",
      expected: '<email-detail threadid="thread-1">Receipt</email-detail>',
    },
    {
      name: "smart punctuation inside an encoded quoted value",
      input: "&lt;rule-suggestion when=&quot;Say “size &gt; 10MB”&quot; /&gt;",
      expected:
        '<rule-suggestion when="Say “size &gt; 10MB”"></rule-suggestion>',
    },
    {
      name: "nested allowed tags",
      input:
        "&lt;emails&gt;&lt;email threadid=&quot;thread-1&quot;&gt;Receipt&lt;/email&gt;&lt;/emails&gt;",
      expected: '<emails><email threadid="thread-1">Receipt</email></emails>',
    },
  ])("normalizes entity-escaped $name", ({ input, expected }) => {
    expect(normalizeAssistantTagMarkup(input)).toBe(expected);
  });

  it.each([
    "&apos;",
    "&#39;",
    "&#x27;",
  ])("decodes the %s single-quote delimiter", (quote) => {
    expect(
      normalizeAssistantTagMarkup(
        `&lt;email-detail threadid=${quote}thread-1${quote}&gt;Receipt&lt;/email-detail&gt;`,
      ),
    ).toBe("<email-detail threadid='thread-1'>Receipt</email-detail>");
  });

  it.each([
    "&quot;",
    "&#34;",
    "&#x22;",
  ])("decodes the %s double-quote delimiter", (quote) => {
    expect(
      normalizeAssistantTagMarkup(
        `&lt;email-detail threadid=${quote}thread-1${quote}&gt;Receipt&lt;/email-detail&gt;`,
      ),
    ).toBe('<email-detail threadid="thread-1">Receipt</email-detail>');
  });

  it("removes one runtime backslash from opening and closing tags", () => {
    const content = String.raw`\<email-detail threadid="thread-1">Receipt\</email-detail>`;

    expect(normalizeAssistantTagMarkup(content)).toBe(
      '<email-detail threadid="thread-1">Receipt</email-detail>',
    );
  });

  it("preserves whitespace and smart punctuation inside quoted values", () => {
    expect(
      normalizeAssistantTagMarkup(
        '<rule-suggestion name="Large  “priority”  messages" />',
      ),
    ).toBe(
      '<rule-suggestion name="Large  “priority”  messages"></rule-suggestion>',
    );
  });

  it.each([
    "<email.foo />",
    "<email-extra />",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    '<email threadid="unterminated>',
    "&lt;email threadid=&quot;unterminated&gt;",
  ])("leaves unsupported or malformed markup unchanged: %s", (content) => {
    expect(normalizeAssistantTagMarkup(content)).toBe(content);
  });
});
