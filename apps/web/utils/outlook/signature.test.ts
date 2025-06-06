import { describe, it, expect } from "vitest";
import { extractGmailSignature } from "./signature";

describe("extractGmailSignature", () => {
  it("extracts signature from HTML with gmail_signature class", () => {
    const html = `
      <div dir="ltr">
        <div>Some email content</div>
        <div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">
          Best,<br>
          John Doe<br>
          CEO, Example Inc.
        </div>
      </div>
    `;

    const signature = extractGmailSignature(html);
    expect(signature).toBe("Best,<br>John Doe<br>CEO, Example Inc.");
  });

  it("extracts signature from example email", () => {
    const html = `<div dir="ltr"><div>Hey,</div><div><br></div><div>How's it going since we last spoke?</div><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr">Best,<div>Demo Zero</div></div></div></div>`;

    expect(extractGmailSignature(html)).toBe(
      '<div dir="ltr">Best,<div>Demo Zero</div></div>',
    );
  });

  it("handles nested signatures and takes the first one", () => {
    const html = `
      <div>
        <div class="gmail_signature">Outer signature</div>
        <div>
          <div class="gmail_signature">Inner signature</div>
        </div>
      </div>
    `;

    const signature = extractGmailSignature(html);
    expect(signature).toBe("Outer signature");
  });

  it("handles signatures with special characters and entities", () => {
    const html = `
      <div>
        <div class="gmail_signature">
          Best regards,<br>
          John & Jane © 2024<br>
          <div>Support & Sales</div>
        </div>
      </div>
    `;

    const signature = extractGmailSignature(html);
    expect(signature).toBe(
      "Best regards,<br>John & Jane © 2024<br><div>Support & Sales</div>",
    );
  });

  it("returns null when no signature is found", () => {
    const html = "<div>Just some content without signature</div>";
    expect(extractGmailSignature(html)).toBeNull();
  });

  it("handles empty input", () => {
    expect(extractGmailSignature("")).toBeNull();
  });
});
