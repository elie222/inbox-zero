import { describe, expect, it } from "vitest";
import {
  SANITIZER_ATTACK_FIXTURES,
  SIGNATURE_FIXTURES,
} from "../fixtures/email-html";
import {
  prepareEmailBodySignatureHtml,
  sanitizeEmailBodyHtml,
} from "./email-body";
import { finalizeEditableEmailHtml } from "./email-html";
import { expectInert } from "./sanitizer.test-utils";

describe("sanitizeEmailBodyHtml", () => {
  it.each(
    SANITIZER_ATTACK_FIXTURES,
  )("removes active content from %s", (html) => {
    expectInert(sanitizeEmailBodyHtml(html));
  });

  it("keeps provider layout, styles and links", () => {
    const html = sanitizeEmailBodyHtml(SIGNATURE_FIXTURES.tableWithLogo);

    expect(html).toContain('cellpadding="0"');
    expect(html).toContain('valign="top"');
    expect(html).toContain("border-collapse:collapse");
    expect(html).toContain('src="https://assets.example.com/logo.png"');
    expect(html).toContain('width="64"');
    expect(html).toContain("font-family:Arial,sans-serif");
    expect(html).toContain("<b>Example Person</b>");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">',
    );
  });

  it("unwraps unknown elements without losing their text", () => {
    const html = sanitizeEmailBodyHtml(SIGNATURE_FIXTURES.outlookMso);

    expect(html).not.toContain("o:p");
    expect(html).not.toContain("MsoNormal");
    expect(html).toContain("Example Person");
    expect(html).toContain("font-size:11.0pt");
  });

  it.each(
    Object.entries(SIGNATURE_FIXTURES),
  )("is stable when reapplied to the %s fixture", (_name, fixture) => {
    const once = sanitizeEmailBodyHtml(fixture);
    expect(sanitizeEmailBodyHtml(once)).toBe(once);
  });

  it("keeps legacy layout attributes common in real mail", () => {
    expect(
      sanitizeEmailBodyHtml(
        '<table align="middle"><tbody><tr><td align="middle">x</td></tr></tbody></table><hr size="1"><blockquote type="cite">q</blockquote>',
      ),
    ).toBe(
      '<table align="middle"><tbody><tr><td align="middle">x</td></tr></tbody></table><hr size="1"><blockquote type="cite">q</blockquote>',
    );
  });

  it("drops image addresses that are not full web URLs", () => {
    expect(
      sanitizeEmailBodyHtml('<img src="http:assets.example.com/logo.png">'),
    ).toBe("");
  });

  it("drops data URI images, which mail clients block", () => {
    expect(
      sanitizeEmailBodyHtml('<img src="data:image/png;base64,iVBORw0KGgo=">'),
    ).toBe("");
  });

  it("keeps font tags, direction, centering and inline images", () => {
    expect(sanitizeEmailBodyHtml(SIGNATURE_FIXTURES.fontTags)).toBe(
      '<font face="Verdana" size="2" color="#336699">Example Person</font><br><font size="1">Sent from a desk</font>',
    );
    expect(sanitizeEmailBodyHtml(SIGNATURE_FIXTURES.rtl)).toContain(
      '<div dir="rtl" style="text-align:right">',
    );
    expect(sanitizeEmailBodyHtml(SIGNATURE_FIXTURES.centered)).toContain(
      '<center><img src="cid:logo@example" alt="Logo">',
    );
  });
});

describe("prepareEmailBodySignatureHtml", () => {
  it("wraps the signature in one container with a separating blank line", () => {
    expect(
      prepareEmailBodySignatureHtml(
        '<div class="gmail_signature" data-smartmail="gmail_signature">Example Person</div>',
      ),
    ).toBe(
      '<div data-smartmail="gmail_signature"><div><br></div><div>Example Person</div></div>',
    );
  });

  it("keeps complex signatures editable instead of protecting them", () => {
    const html = prepareEmailBodySignatureHtml(
      SIGNATURE_FIXTURES.tableWithLogo,
    );

    expect(html).toContain("<table");
    expect(html).toContain("Head of Examples");
  });

  it("returns null when nothing visible is left", () => {
    expect(prepareEmailBodySignatureHtml("<script>x</script><br>")).toBeNull();
  });
});

describe("finalizeEditableEmailHtml", () => {
  it("rewrites inline previews to Content-ID references and sanitizes", () => {
    const sent = finalizeEditableEmailHtml({
      html: '<div>Hi <img src="blob:https://app.example/1" data-content-id="img-1@example" alt="Chart"></div><div onclick="x()">Bye</div><table><tbody><tr><td style="color:#333">Sig</td></tr></tbody></table>',
      inlineAttachments: [
        {
          id: "a",
          filename: "chart.png",
          mimeType: "image/png",
          size: 1,
          contentBase64: "AA==",
          disposition: "inline",
          contentId: "img-1@example",
        },
      ],
      mode: "edited",
    });

    expect(sent).toBe(
      '<div>Hi <img src="cid:img-1@example" alt="Chart"></div><div>Bye</div><table><tbody><tr><td style="color:#333">Sig</td></tr></tbody></table>',
    );
  });

  it("drops unsent local previews", () => {
    expect(
      finalizeEditableEmailHtml({
        html: '<div><img src="blob:https://app.example/2" data-content-id="gone@example"></div>',
        inlineAttachments: [],
        mode: "edited",
      }),
    ).toBe("<div></div>");
  });

  it("returns original HTML untouched", () => {
    const html = "<div><!--[if mso]>x<![endif]-->Hi</div>";
    expect(
      finalizeEditableEmailHtml({
        html,
        inlineAttachments: [],
        mode: "original",
      }),
    ).toBe(html);
  });
});
