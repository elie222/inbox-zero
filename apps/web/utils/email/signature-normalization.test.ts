import { describe, expect, it } from "vitest";
import {
  getProviderSignatureHtml,
  stripProviderSignatureHtml,
} from "@/utils/email/signature-normalization";

const SIGNATURE_HTML =
  '<div class="gmail_signature" data-smartmail="gmail_signature"><b>Jane</b><div style="border-top: 1px solid #ccc">Acme</div></div>';

describe("stripProviderSignatureHtml", () => {
  it("keeps line breaks in the body that are not next to the signature", () => {
    expect(
      stripProviderSignatureHtml(
        `First line<br>Second line\n\n<br>${SIGNATURE_HTML}`,
      ).trim(),
    ).toBe("First line<br>Second line");
  });
});

describe("getProviderSignatureHtml", () => {
  it("returns the whole signature block, nested markup included", () => {
    expect(getProviderSignatureHtml(`Body<br>${SIGNATURE_HTML}`)).toBe(
      SIGNATURE_HTML,
    );
  });
});
