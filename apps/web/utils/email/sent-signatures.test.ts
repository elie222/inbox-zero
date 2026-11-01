import { describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { findSentSignatures } from "./sent-signatures";

const english = '<div dir="ltr"><div>Best,</div><div>Ada Lovelace</div></div>';
const german =
  '<div dir="ltr"><div>Viele Grüße,</div><div>Ada Lovelace</div></div>';

describe("findSentSignatures", () => {
  it("finds each signature the user sends, most used first", async () => {
    const emailProvider = providerWithSent([
      gmailMessage("Hallo", german),
      gmailMessage("Hi", english),
      gmailMessage("Hey", english),
      outlookMessage("Moin", german),
      outlookMessage("Hi again", english),
    ]);

    const found = await findSentSignatures({
      emailProvider,
      knownSignatures: [],
    });

    expect(found).toEqual([
      { html: english, count: 3 },
      { html: german, count: 2 },
    ]);
  });

  it("ignores signatures in quoted replies and ones already saved", async () => {
    const emailProvider = providerWithSent([
      gmailMessage(
        `Sounds good<div class="gmail_quote"><blockquote>Thanks<div class="gmail_signature">Grace Hopper</div></blockquote></div>`,
        english,
      ),
      gmailMessage("Hallo", german),
    ]);

    const found = await findSentSignatures({
      emailProvider,
      knownSignatures: ["<p>Viele  Grüße,</p><p>Ada Lovelace</p>"],
    });

    expect(found).toEqual([{ html: english, count: 1 }]);
  });

  it("keeps the Inbox Zero footer and blank spacer out of a signature", async () => {
    const emailProvider = providerWithSent([
      getMockMessage({
        textHtml: `<p>Hi</p><div data-smartmail="gmail_signature"><div><br></div><div>Ada</div><br><div>Sent with <a href="https://www.getinboxzero.com">Inbox Zero</a></div></div>`,
      }),
    ]);

    const found = await findSentSignatures({
      emailProvider,
      knownSignatures: [],
    });

    expect(found).toEqual([{ html: "<div>Ada</div>", count: 1 }]);
  });
});

function providerWithSent(messages: ReturnType<typeof getMockMessage>[]) {
  return createMockEmailProvider({
    getSentMessages: vi.fn().mockResolvedValue(messages),
  });
}

function gmailMessage(body: string, signature: string) {
  return getMockMessage({
    textHtml: `<div dir="ltr">${body}<br clear="all"><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${signature}</div></div>`,
  });
}

function outlookMessage(body: string, signature: string) {
  return getMockMessage({
    textHtml: `<html><body><div>${body}</div><div id="Signature">${signature}</div></body></html>`,
  });
}
