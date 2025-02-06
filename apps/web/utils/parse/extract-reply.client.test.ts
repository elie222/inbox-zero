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
});
