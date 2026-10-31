// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderSentWithFooterHtml } from "@/utils/email/sent-with-footer";
import { findSignatureId, getDraftSignatureHtml } from "./find-signature-id";

const signatures = [
  { id: "default", name: "Default", signatureHtml: "<div>Best,<br>Ada</div>" },
  {
    id: "german",
    name: "German",
    signatureHtml: "<div>Viele Grüße,<br>Ada</div>",
  },
];
const footer = renderSentWithFooterHtml("https://www.getinboxzero.com");

describe("findSignatureId", () => {
  it("matches the composer's wrapped signature with its footer", () => {
    expect(
      findSignatureId(
        signatures,
        `<div data-smartmail="gmail_signature"><div><br></div><div>Viele Grüße,<br>Ada</div><br>${footer}</div>`,
      ),
    ).toBe("german");
  });

  it("matches nothing for an unknown or empty signature", () => {
    expect(findSignatureId(signatures, "<div>Cheers</div>")).toBeUndefined();
    expect(findSignatureId(signatures, "")).toBeUndefined();
  });
});

describe("getDraftSignatureHtml", () => {
  it("reads the signature the edited body holds over the one it opened with", () => {
    const html = getDraftSignatureHtml({
      editableHtml:
        '<div>Hallo</div><div data-smartmail="gmail_signature"><div>Viele Grüße,<br>Ada</div></div>',
      signatureHtml: "<div>Best,<br>Ada</div>",
    });
    expect(findSignatureId(signatures, html)).toBe("german");
  });

  it("falls back to the draft's signature when the body has none", () => {
    expect(
      getDraftSignatureHtml({
        editableHtml: "<div>Hi</div>",
        signatureHtml: "<div>Best,<br>Ada</div>",
      }),
    ).toBe("<div>Best,<br>Ada</div>");
  });
});
