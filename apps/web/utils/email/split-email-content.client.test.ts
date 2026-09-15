/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { splitEmailContent } from "./split-email-content.client";

describe("splitEmailContent", () => {
  it("preserves styled quote ancestors and following content without repeating the reply", () => {
    const result = splitEmailContent(
      '<!doctype html><html><head><style>.wrapper { color: red; }</style></head><body style="background: #222"><div class="wrapper"><p>Current reply</p><div class="gmail_quote">History</div><p>Following history</p></div><p>Older history</p></body></html>',
    );
    const quoted = new DOMParser().parseFromString(
      result.quotedContent,
      "text/html",
    );
    expect(quoted.body.style.backgroundColor).toBe("rgb(34, 34, 34)");
    expect(quoted.body.textContent).toBe(
      "HistoryFollowing historyOlder history",
    );
    expect(quoted.querySelector(".wrapper .gmail_quote")?.textContent).toBe(
      "History",
    );
    expect(quoted.head.querySelector("style")?.textContent).toContain(
      ".wrapper",
    );
    expect(result.mainContent).not.toContain("History");
  });

  it("preserves styles in HTML fragments without document tags", () => {
    const result = splitEmailContent(
      '<style>.gmail_quote { color: red; }</style><p>Reply</p><div class="gmail_quote">History</div>',
    );
    const quoted = new DOMParser().parseFromString(
      result.quotedContent,
      "text/html",
    );
    expect(quoted.head.querySelector("style")?.textContent).toBe(
      ".gmail_quote { color: red; }",
    );
    expect(quoted.body.textContent).toBe("History");
  });

  it("removes blank quote spacing without removing reply content", () => {
    const result = splitEmailContent(
      '<p>Reply</p><br><div dir="ltr"></div><br><div class="gmail_quote">History</div>',
    );
    expect(result.mainContent).toBe("<p>Reply</p>");
  });
  it("preserves trailing images and styled content before a quote", () => {
    const content =
      '<div><img src="cid:signature"></div><div style="height:20px"></div>';
    expect(
      splitEmailContent(`${content}<div class="gmail_quote">History</div>`)
        .mainContent,
    ).toBe(content);
  });
  it("collapses a Gmail quote container", () => {
    const result = splitEmailContent(
      '<div>Current reply</div><div class="gmail_quote_container"><div>Earlier message</div></div>',
    );

    expect(result).toMatchObject({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("preserves document-level styles when collapsing quoted content", () => {
    const result = splitEmailContent(
      '<!doctype html><html><head><style>p { margin: 0; }</style></head><body style="background: #222; color: #eee"><p>Current reply</p><div class="gmail_quote">Earlier message</div></body></html>',
    );
    const parsedDocument = new DOMParser().parseFromString(
      result.mainContent,
      "text/html",
    );

    expect(result.hasQuotedContent).toBe(true);
    expect(result.mainContent).toMatch(/^<!doctype html>/i);
    expect(parsedDocument.body.getAttribute("style")).toBe(
      "background: #222; color: #eee",
    );
    expect(parsedDocument.head.querySelector("style")?.textContent).toContain(
      "p { margin: 0; }",
    );
    expect(parsedDocument.body.textContent).toBe("Current reply");
  });

  it("preserves legacy doctype identifiers when collapsing quoted content", () => {
    const legacyDoctype =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">';
    const result = splitEmailContent(
      `${legacyDoctype}<html><body><p>Current reply</p><div class="gmail_quote">Earlier message</div></body></html>`,
    );

    expect(result.mainContent).toMatch(
      /^<!DOCTYPE html PUBLIC "-\/\/W3C\/\/DTD HTML 4\.01 Transitional\/\/EN" "http:\/\/www\.w3\.org\/TR\/html4\/loose\.dtd">/,
    );
  });

  it("collapses a provider-prefixed Outlook reply header and all later content", () => {
    const result = splitEmailContent(
      [
        "<div>Current reply</div>",
        '<div id="m_123_x_divRplyFwdMsg"><hr><b>From:</b> Previous sender</div>',
        "<div>Earlier message</div>",
        "<blockquote>Oldest message</blockquote>",
      ].join(""),
    );

    expect(result).toMatchObject({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("collapses an Outlook desktop reply header without a provider id", () => {
    const result = splitEmailContent(
      [
        '<div class="WordSection1">',
        '<p class="MsoNormal">Current reply</p>',
        '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0in 0in 0in">',
        '<p class="MsoNormal"><b>From:</b> Previous sender<br><b>Sent:</b> Earlier</p>',
        "</div>",
        '<p class="MsoNormal">Earlier message</p>',
        "</div>",
      ].join(""),
    );

    expect(result).toMatchObject({
      mainContent:
        '<div class="WordSection1"><p class="MsoNormal">Current reply</p></div>',
      hasQuotedContent: true,
    });
  });

  it("collapses an equivalent Outlook reply style inside a wrapper", () => {
    const result = splitEmailContent(
      [
        '<div class="WordSection1">',
        '<p class="MsoNormal">Current reply</p>',
        "<div>",
        '<div style="padding: 3pt 0cm 0cm 0cm; border-top: 1.0pt solid rgb(225, 225, 225)">',
        '<p class="MsoNormal"><b>Header one:</b> Value<br><b>Header two:</b> Value</p>',
        "</div>",
        '<p class="MsoNormal">Earlier message</p>',
        "</div>",
        "</div>",
      ].join(""),
    );

    expect(result.hasQuotedContent).toBe(true);
    expect(result.mainContent).toContain("Current reply");
    expect(result.mainContent).not.toContain("Earlier message");
  });

  it("preserves an Outlook-styled divider that is not a reply header", () => {
    const html = [
      '<div class="WordSection1">',
      "<div>First section</div>",
      '<div style="border-top:solid #E1E1E1 1.0pt">Second section</div>',
      "<div>Final section</div>",
      "</div>",
    ].join("");

    expect(splitEmailContent(html)).toMatchObject({
      mainContent: html,
      quotedContent: "",
      hasQuotedContent: false,
    });
  });

  it("collapses a provider-prefixed append-on-send marker", () => {
    const result = splitEmailContent(
      [
        "<div>Current reply</div>",
        '<div id="m_123_x_appendonsend"></div>',
        "<div>Earlier message</div>",
      ].join(""),
    );

    expect(result).toMatchObject({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("collapses a standalone provider quote block", () => {
    const result = splitEmailContent(
      '<div>Current reply</div><blockquote type="cite">Earlier message</blockquote>',
    );

    expect(result).toMatchObject({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("preserves messages without recognized quoted content", () => {
    const html =
      "<div>A regular message</div><blockquote>A cited passage</blockquote>";

    expect(splitEmailContent(html)).toMatchObject({
      mainContent: html,
      quotedContent: "",
      hasQuotedContent: false,
    });
  });
});
