import type { UIMessageChunk, UIMessageStreamWriter } from "ai";
import { describe, expect, it } from "vitest";
import {
  createAssistantTagStreamNormalizer,
  normalizeAssistantTagMarkup,
  writeNormalizedAssistantTagStream,
} from "@/utils/ai/assistant/assistant-tag-normalization";

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

describe("createAssistantTagStreamNormalizer", () => {
  function streamDeltas(deltas: string[]) {
    const normalizer = createAssistantTagStreamNormalizer();
    const emitted = deltas.map((delta) => normalizer.push("part-1", delta));
    return emitted.join("") + normalizer.flush("part-1");
  }

  it.each([
    {
      name: "entity-escaped tags split across deltas",
      deltas: [
        "Here you go:\n&lt;emai",
        "ls&gt;&lt;email threadid=&quot;t-1",
        "&quot;&gt;Receipt&lt;/email&gt;&lt;/emails&gt;",
      ],
      expected:
        'Here you go:\n<emails><email threadid="t-1">Receipt</email></emails>',
    },
    {
      name: "self-closing tags",
      deltas: ['<email-detail threadid="t-1" />'],
      expected: '<email-detail threadid="t-1"></email-detail>',
    },
    {
      name: "smart quotes containing a greater-than sign",
      deltas: [
        "<rule-suggestion name=“Big”",
        " when=“size > 10MB”>Review</rule-suggestion>",
      ],
      expected:
        '<rule-suggestion name="Big" when="size > 10MB">Review</rule-suggestion>',
    },
    {
      name: "backslash-escaped tags",
      deltas: [
        String.raw`\<email-detail threadid="t-1">Receipt\</email-detail>`,
      ],
      expected: '<email-detail threadid="t-1">Receipt</email-detail>',
    },
  ])("normalizes $name", ({ deltas, expected }) => {
    expect(streamDeltas(deltas)).toBe(expected);
  });

  it("streams prose immediately instead of buffering it until the part ends", () => {
    const normalizer = createAssistantTagStreamNormalizer();

    expect(normalizer.push("part-1", "You have 3 emails ")).toBe(
      "You have 3 emails ",
    );
    expect(normalizer.push("part-1", "from Acme & Co < Beta")).toBe(
      "from Acme & Co < Beta",
    );
    expect(normalizer.flush("part-1")).toBe("");
  });

  it("holds back only the unfinished tag", () => {
    const normalizer = createAssistantTagStreamNormalizer();

    expect(normalizer.push("part-1", "## Today\n&lt;emails&gt;&lt;email")).toBe(
      "## Today\n<emails>",
    );
    expect(normalizer.push("part-1", " threadid=&quot;t-1&quot;&gt;Hi")).toBe(
      '<email threadid="t-1">Hi',
    );
  });

  it("keeps buffers separate per text part", () => {
    const normalizer = createAssistantTagStreamNormalizer();

    expect(normalizer.push("part-1", "&lt;emails")).toBe("");
    expect(normalizer.push("part-2", "plain text")).toBe("plain text");
    expect(normalizer.push("part-1", "&gt;")).toBe("<emails>");
    expect(normalizer.flush("part-1")).toBe("");
  });

  it("stops holding back a tag-like run that never closes", () => {
    const normalizer = createAssistantTagStreamNormalizer();

    expect(normalizer.push("part-1", "I checked <email addresses")).toBe(
      "I checked ",
    );

    const prose = "and found nothing. ".repeat(40);
    expect(normalizer.push("part-1", prose)).toContain("found nothing");
    expect(normalizer.push("part-1", "Done.")).toBe("Done.");
  });

  it("emits malformed markup unchanged when the part ends", () => {
    expect(streamDeltas(['<email threadid="unterminated'])).toBe(
      '<email threadid="unterminated',
    );
  });
});

describe("writeNormalizedAssistantTagStream", () => {
  function createWriter() {
    const written: UIMessageChunk[] = [];
    const writer = {
      write: (chunk: UIMessageChunk) => written.push(chunk),
    } as unknown as UIMessageStreamWriter;

    return { writer, written };
  }

  async function* chunks(values: UIMessageChunk[], error?: Error) {
    yield* values;
    if (error) throw error;
  }

  it("normalizes text deltas and forwards other chunks in order", async () => {
    const { writer, written } = createWriter();

    await writeNormalizedAssistantTagStream({
      stream: chunks([
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Here:\n&lt;emails&gt;&lt;emai" },
        {
          type: "text-delta",
          id: "t",
          delta: "l threadid=&quot;t-1&quot;&gt;",
        },
        { type: "text-end", id: "t" },
      ]),
      writer,
    });

    expect(written).toEqual([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Here:\n<emails>" },
      { type: "text-delta", id: "t", delta: '<email threadid="t-1">' },
      { type: "text-end", id: "t" },
    ]);
  });

  // A terminal error ends the stream without a `text-end`, so the wrapper has
  // to release what it was holding back or that text never reaches the client.
  it("releases buffered text when the stream ends without a text-end", async () => {
    const { writer, written } = createWriter();

    await writeNormalizedAssistantTagStream({
      stream: chunks([
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Found &lt;email threadid" },
        { type: "error", errorText: "boom" },
      ]),
      writer,
    });

    expect(written).toEqual([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Found " },
      { type: "error", errorText: "boom" },
      { type: "text-delta", id: "t", delta: "&lt;email threadid" },
    ]);
  });

  it("releases buffered text when the stream throws", async () => {
    const { writer, written } = createWriter();
    const failure = new Error("aborted");

    await expect(
      writeNormalizedAssistantTagStream({
        stream: chunks(
          [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Found <email threadid" },
          ],
          failure,
        ),
        writer,
      }),
    ).rejects.toThrow(failure);

    expect(written).toEqual([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Found " },
      { type: "text-delta", id: "t", delta: "<email threadid" },
    ]);
  });
});
