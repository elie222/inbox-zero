import { describe, expect, it } from "vitest";
import {
  hasReferralSignature,
  stripReferralSignature,
  stripBrandingSignatures,
} from "@/utils/referral/signature";

describe("referral signatures", () => {
  it("removes drafted branding without altering reply links or personal signatures", () => {
    const body = '<p>See <a href="https://example.com">the update</a>.</p>';
    const signature = "<p>Best,<br>Sender</p>";
    const html = `${body}${signature}<div>Drafted by <a href="https://example.com/?ref=test">Inbox Zero</a>.</div>`;

    expect(stripReferralSignature(html)).toBe(`${body}${signature}<div></div>`);
    expect(hasReferralSignature(html)).toBe(true);
    // Repeated detection must not depend on the global regex lastIndex.
    expect(hasReferralSignature(html)).toBe(true);
    expect(hasReferralSignature(stripReferralSignature(html))).toBe(false);
  });
});

describe("branding signatures", () => {
  it.each([
    "The report was sent with Inbox Zero sync enabled.",
    "Drafted by Inbox Zero is the footer text.",
    "<p>The report was sent with Inbox Zero sync enabled.</p>",
  ])("preserves branding phrases within authored text: %s", (body) => {
    expect(stripBrandingSignatures(body)).toBe(body);
  });

  it("removes both HTML footers from a draft body", () => {
    const body = "<p>Thanks for the update.</p>";
    expect(
      stripBrandingSignatures(
        `${body}<div>Drafted by <a href="https://example.com">Inbox Zero</a>.</div><div>Sent with <a href="https://example.com">Inbox Zero</a></div>`,
      ),
    ).toBe(`${body}<div></div><div></div>`);
  });

  it("does not consume later content through malformed links", () => {
    const fragments = "Drafted by Inbox Zero [https:// ".repeat(10_000);
    const anchorFragments = "Sent with <a href=broken ".repeat(10_000);
    expect(stripBrandingSignatures(fragments)).toBe(fragments.trim());
    expect(stripBrandingSignatures(anchorFragments)).toBe(
      anchorFragments.trim(),
    );
  });
});
