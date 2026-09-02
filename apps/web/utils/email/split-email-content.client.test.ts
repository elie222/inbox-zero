/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { splitEmailContent } from "./split-email-content.client";

describe("splitEmailContent", () => {
  it("collapses a Gmail quote container", () => {
    const result = splitEmailContent(
      '<div>Current reply</div><div class="gmail_quote_container"><div>Earlier message</div></div>',
    );

    expect(result).toEqual({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
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

    expect(result).toEqual({
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

    expect(result).toEqual({
      mainContent:
        '<div class="WordSection1"><p class="MsoNormal">Current reply</p></div>',
      hasQuotedContent: true,
    });
  });

  it("preserves an Outlook-styled divider that is not a reply header", () => {
    const html = [
      '<div class="WordSection1">',
      "<div>First section</div>",
      '<div style="border-top:solid #E1E1E1 1.0pt">Second section</div>',
      "<div>Final section</div>",
      "</div>",
    ].join("");

    expect(splitEmailContent(html)).toEqual({
      mainContent: html,
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

    expect(result).toEqual({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("collapses a standalone provider quote block", () => {
    const result = splitEmailContent(
      '<div>Current reply</div><blockquote type="cite">Earlier message</blockquote>',
    );

    expect(result).toEqual({
      mainContent: "<div>Current reply</div>",
      hasQuotedContent: true,
    });
  });

  it("preserves messages without recognized quoted content", () => {
    const html =
      "<div>A regular message</div><blockquote>A cited passage</blockquote>";

    expect(splitEmailContent(html)).toEqual({
      mainContent: html,
      hasQuotedContent: false,
    });
  });
});
