import { describe, it, expect } from "vitest";
import { extractSignatureFromHtml } from "./signature-extraction";

describe("extractSignatureFromHtml", () => {
  it("extracts signature from HTML with Outlook signature ID", () => {
    const html = `
      <div dir="ltr">
        <div>Some email content</div>
        <div id="Signature">
          Best,<br>
          John Doe<br>
          CEO, Example Inc.
        </div>
      </div>
    `;

    const signature = extractSignatureFromHtml(html);
    expect(signature).toBe("Best,<br>John Doe<br>CEO, Example Inc.");
  });

  it("extracts signature from example Outlook email", () => {
    const html = `<div dir="ltr"><div>Hey,</div><div><br></div><div>How's it going since we last spoke?</div><div><br></div><div id="Signature"><div dir="ltr">Best,<div>Demo Zero</div></div></div></div>`;

    expect(extractSignatureFromHtml(html)).toBe(
      '<div dir="ltr">Best,<div>Demo Zero</div></div>',
    );
  });

  it("extracts signature with Outlook signature ID prefix", () => {
    const html = `
      <div>
        <div>Email body content</div>
        <div id="Signature_123">
          <p>Best regards,</p>
          <p>Jane Smith</p>
        </div>
      </div>
    `;

    const signature = extractSignatureFromHtml(html);
    expect(signature).toBe("<p>Best regards,</p><p>Jane Smith</p>");
  });

  it("handles signatures with special characters and converts HTML entities", () => {
    const html = `
      <div>
        <div id="Signature">
          Best regards,<br>
          John &amp; Jane © 2024<br>
          <div>Support &amp; Sales</div>
        </div>
      </div>
    `;

    const signature = extractSignatureFromHtml(html);
    expect(signature).toBe(
      "Best regards,<br>John & Jane © 2024<br><div>Support & Sales</div>",
    );
  });

  it("normalizes whitespace in signature", () => {
    const html = `
      <div>
        <div id="Signature">
          <p>  Best regards,  </p>
          <p>   John Doe   </p>
        </div>
      </div>
    `;

    const signature = extractSignatureFromHtml(html);
    expect(signature).toBe("<p>Best regards,</p><p>John Doe</p>");
  });

  it("returns null when no signature is found", () => {
    const html = "<div>Just some content without signature</div>";
    expect(extractSignatureFromHtml(html)).toBeNull();
  });

  it("handles empty input", () => {
    expect(extractSignatureFromHtml("")).toBeNull();
  });
});
