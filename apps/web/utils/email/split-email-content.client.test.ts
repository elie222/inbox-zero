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

  it("collapses an Outlook reply header and all content after it", () => {
    const result = splitEmailContent(
      [
        "<div>Current reply</div>",
        '<div id="divRplyFwdMsg"><hr><b>From:</b> Previous sender</div>',
        "<div>Earlier message</div>",
        "<blockquote>Oldest message</blockquote>",
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
