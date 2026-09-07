import { describe, expect, it } from "vitest";
import {
  hasReferralSignature,
  stripReferralSignature,
} from "@/utils/referral/signature";

describe("referral signatures", () => {
  it("removes drafted branding without altering reply links or personal signatures", () => {
    const body = '<p>See <a href="https://example.com">the update</a>.</p>';
    const signature = "<p>Best,<br>Sender</p>";
    const html = `${body}${signature}<div>Drafted by <a href="https://example.com/?ref=test">Inbox Zero</a>.</div>`;

    expect(stripReferralSignature(html)).toBe(`${body}${signature}<div></div>`);
    expect(hasReferralSignature(html)).toBe(true);
    expect(hasReferralSignature(html)).toBe(true);
    expect(hasReferralSignature(stripReferralSignature(html))).toBe(false);
  });
});
