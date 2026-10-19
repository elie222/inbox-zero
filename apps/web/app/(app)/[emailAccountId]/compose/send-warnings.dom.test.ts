// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getEditableText } from "./send-warnings";

describe("getEditableText", () => {
  it("keeps the user's text and drops the signature and quoted thread", () => {
    const text = getEditableText(
      '<div>See you Thursday.</div><div data-smartmail="gmail_signature">[Title] | attachments welcome</div><div class="gmail_quote"><blockquote>I attached the file.</blockquote></div>',
    );

    expect(text).toContain("See you Thursday.");
    expect(text).not.toContain("[Title]");
    expect(text).not.toContain("attach");
  });

  it("keeps a block quote the user wrote", () => {
    expect(
      getEditableText(
        "<div>Quick note:</div><blockquote>Contract attached below.</blockquote>",
      ),
    ).toContain("Contract attached below.");
  });

  it("separates block elements so words don't run together", () => {
    expect(
      getEditableText("<div>Here's the file</div><div>attached</div>"),
    ).toMatch(/file\s+attached/);
  });
});
