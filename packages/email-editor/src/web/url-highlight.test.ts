import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { findUrlHighlights } from "./url-highlight";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
  marks: { link: { attrs: { href: {} } } },
});

describe("URL highlighting", () => {
  it("highlights loaded plain URLs without changing the document", () => {
    const text = "Visit example.com/docs, https://example.org or example.net.";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text(text)),
    ]);
    const original = doc.toJSON();
    const highlights = findUrlHighlights(doc).find();

    expect(highlights.map(({ from, to }) => doc.textBetween(from, to))).toEqual(
      ["example.com/docs", "https://example.org", "example.net"],
    );
    expect(doc.toJSON()).toEqual(original);
  });

  it("leaves existing links and ordinary text alone", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Read the documentation at "),
        schema.text("example.com", [
          schema.mark("link", { href: "https://example.org" }),
        ]),
      ]),
    ]);
    expect(findUrlHighlights(doc).find()).toEqual([]);
  });

  it("removes highlighting when an edit stops being a URL", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("example")),
    ]);
    expect(findUrlHighlights(doc).find()).toEqual([]);
  });
});
