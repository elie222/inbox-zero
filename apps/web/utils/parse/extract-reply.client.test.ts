import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { extractEmailReply } from "./extract-reply.client";

// pnpm test utils/parse/extract-reply.client.test.ts

// Setup JSDOM
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;

describe("extractEmailReply", () => {
  it("splits email with gmail quote container", () => {
    const html = `
      <div dir="ltr">
        <div dir="ltr">This is my reply</div>
      </div>
      <div class="gmail_quote_container">
        Original thread content
      </div>
    `;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe('<div dir="ltr">This is my reply</div>');
    expect(result.originalHtml).toBe(`<div class="gmail_quote_container">
        Original thread content
      </div>`);
  });

  it("splits email with gmail quote", () => {
    const html = `
      <div dir="ltr">
        <div dir="ltr">This is my reply</div>
      </div>
      <div class="gmail_quote">
        Original thread content
      </div>
    `;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe('<div dir="ltr">This is my reply</div>');
    expect(result.originalHtml).toBe(`<div class="gmail_quote">
        Original thread content
      </div>`);
  });

  it("handles direct reply without nested div", () => {
    const html = `
      <div dir="ltr">This is a direct reply</div>
      <div class="gmail_quote">
        Original thread content
      </div>
    `;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe(
      '<div dir="ltr">This is a direct reply</div>',
    );
    expect(result.originalHtml).toBe(`<div class="gmail_quote">
        Original thread content
      </div>`);
  });

  it("returns full html when no quote container found", () => {
    const html = '<div dir="ltr">Just a simple email</div>';

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe(html);
    expect(result.originalHtml).toBe("");
  });

  it("ignores gmail_attr in reply selection", () => {
    const html = `
      <div dir="ltr">
        <div dir="ltr">Real reply content</div>
      </div>
      <div dir="ltr" class="gmail_attr">On Mon, Jan 1, 2024...</div>
      <div class="gmail_quote">
        Original thread content
      </div>
    `;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe('<div dir="ltr">Real reply content</div>');
    expect(result.originalHtml).toBe(`<div class="gmail_quote">
        Original thread content
      </div>`);
  });

  it("handles empty html", () => {
    const result = extractEmailReply("");
    expect(result.draftHtml).toBe("");
    expect(result.originalHtml).toBe("");
  });

  it("correctly extracts draft content from Gmail draft with <br> separator", () => {
    const html = `<div dir="ltr">hey, that sounds awesome!!!</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 25 Feb 2025 at 14:44, Alice Smith &lt;<a href="mailto:example@gmail.com">example@gmail.com</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr"><div>hey, checking in</div><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature"><div dir="ltr">Alice Smith,<div>CEO, The Boring Fund</div></div></div></div>\r\n</blockquote></div>\r\n`;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe(
      '<div dir="ltr">hey, that sounds awesome!!!</div>',
    );
    expect(result.originalHtml).toContain("gmail_quote");
  });

  it("handles more complex draft with formatting and <br> separator", () => {
    const html = `<div dir="ltr">This is my <b>formatted</b> reply with <i>styling</i>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Mon, Mar 1, 2025 at 10:00, John Doe &lt;<a href="mailto:john@example.com">john@example.com</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">Original message content</div></blockquote></div>`;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe(
      '<div dir="ltr">This is my <b>formatted</b> reply with <i>styling</i>.</div>',
    );
    expect(result.originalHtml).toContain("gmail_quote");
  });

  it("handles more complex draft with formatting and <br> separator", () => {
    const html = `<div dir="ltr">hi,<div><br></div><div>this is a test</div></div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Mon, 5 May 2025 at 22:27, Matt &lt;<a href="mailto:xyz">examplecom</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">:)</div></blockquote></div>`;

    const result = extractEmailReply(html);
    expect(result.draftHtml).toBe(
      '<div dir="ltr">hi,<div><br></div><div>this is a test</div></div>',
    );
    expect(result.originalHtml).toContain("gmail_quote");
  });
});
