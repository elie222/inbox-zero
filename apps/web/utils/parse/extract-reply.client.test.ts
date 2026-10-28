import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { extractDraftComposerContent } from "./extract-reply.client";

const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;

const SIGNATURE = '<div dir="ltr">Alex Example<div>Example Company</div></div>';
const GMAIL_QUOTE = `<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">On Thu, 6 Feb 2025 at 23:23, Leslie Sender &lt;leslie@example.com&gt; wrote:<br></div>
  <blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    <div dir="ltr">Can we meet on Thursday?</div>
  </blockquote>
</div>`;
// The composer used to save its quote behind an empty reply block.
const COMPOSER_QUOTE_WITH_EMPTY_BLOCK = `<div dir="ltr"></div>\n<br>\n${GMAIL_QUOTE}`;
const BODY =
  "<div>Thanks Leslie, Thursday works.</div><div>I will bring the updated proposal.</div>";

describe("extractDraftComposerContent", () => {
  it("keeps the reply body of a composer-saved Gmail draft with a signature and quote", () => {
    const html = `${BODY}<br>${SIGNATURE}<br>${COMPOSER_QUOTE_WITH_EMPTY_BLOCK}`;

    const result = extractDraftComposerContent(html);

    expect(result.draftHtml).toContain("Thanks Leslie, Thursday works.");
    expect(result.draftHtml).toContain("I will bring the updated proposal.");
    expect(result.draftHtml).not.toContain("gmail_quote");
    expect(result.originalHtml).toContain("Can we meet on Thursday?");
    expectNoTextLost(html, result);
  });

  it("keeps the reply body of a composer-saved Outlook draft with a signature and quote", () => {
    const html = `<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style type="text/css" style="display:none">P {margin-top:0;margin-bottom:0;}</style></head><body dir="ltr"><div style="font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">Thanks Leslie, Thursday works.</div><br><div id="Signature"><div>Alex Example</div></div><br>${COMPOSER_QUOTE_WITH_EMPTY_BLOCK}</body></html>`;

    const result = extractDraftComposerContent(html);

    expect(result.draftHtml).toContain("Thanks Leslie, Thursday works.");
    expect(result.draftHtml).not.toContain("gmail_quote");
    expect(result.originalHtml).toContain("Can we meet on Thursday?");
    expectNoTextLost(html, result);
  });

  it("splits a draft written in Outlook at its reply header", () => {
    const html = `<div dir="ltr"><p>Thursday works for me.</p></div><div id="Signature"><p>Alex Example</p></div><div id="appendonsend"></div><hr style="display:inline-block;width:98%"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> Leslie Sender<br><b>Subject:</b> Meeting</div><div>Can we meet on Thursday?</div>`;

    const result = extractDraftComposerContent(html);

    expect(result.draftHtml).toContain("Thursday works for me.");
    expect(result.draftHtml).not.toContain("divRplyFwdMsg");
    expect(result.originalHtml).toContain("Can we meet on Thursday?");
    expectNoTextLost(html, result);
  });

  it("splits a draft written in Gmail at its quote", () => {
    const html = `<div dir="ltr">hey, that sounds awesome!!!</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 25 Feb 2025 at 14:44, Alice Smith &lt;<a href="mailto:example@gmail.com">example@gmail.com</a>&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr"><div>hey, checking in</div></div>\r\n</blockquote></div>\r\n`;

    const result = extractDraftComposerContent(html);

    expect(result.draftHtml).toBe(
      '<div dir="ltr">hey, that sounds awesome!!!</div>',
    );
    expect(result.originalHtml).toContain("hey, checking in");
  });

  it("returns a draft without a quote unchanged", () => {
    const html = '<div dir="ltr">Just a simple email</div>';

    expect(extractDraftComposerContent(html)).toEqual({
      draftHtml: html,
      originalHtml: "",
    });
  });

  it("handles a missing body", () => {
    expect(extractDraftComposerContent(undefined)).toEqual({
      draftHtml: "",
      originalHtml: "",
    });
  });

  it("fills an empty quoted draft from plaintext", () => {
    const html = `<div dir="ltr"></div><div class="gmail_quote">Original thread content</div>`;

    const result = extractDraftComposerContent(html, "First saved reply");

    expect(result.draftHtml).toBe("<p>First saved reply</p>");
    expect(result.originalHtml).toContain("Original thread content");
  });

  it("fills a quoted draft whose reply part is only a break or nbsp", () => {
    const html = `<div dir="ltr">&nbsp;<br></div><div class="gmail_quote">Original thread content</div>`;

    const result = extractDraftComposerContent(html, "First saved reply");

    expect(result.draftHtml).toBe("<p>First saved reply</p>");
    expect(result.originalHtml).toContain("Original thread content");
  });

  it("keeps an image-only reply instead of its plaintext stand-in", () => {
    const html = `<div><img src="cid:diagram@example" alt="Diagram"></div><br>${GMAIL_QUOTE}`;

    const result = extractDraftComposerContent(html, "[image: Diagram]");

    expect(result.draftHtml).toContain('src="cid:diagram@example"');
  });
});

function expectNoTextLost(
  html: string,
  result: { draftHtml: string; originalHtml: string },
) {
  expect(visibleText(result.draftHtml + result.originalHtml)).toBe(
    visibleText(html),
  );
}

function visibleText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
