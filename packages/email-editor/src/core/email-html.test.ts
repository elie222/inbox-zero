import { describe, expect, it } from "vitest";
import {
  GMAIL_DRAFT_FIXTURE,
  OUTLOOK_DRAFT_FIXTURE,
  RTL_EDITABLE_FIXTURE,
  UNSUPPORTED_EDITABLE_FIXTURE,
} from "../fixtures/email-html";
import {
  EMAIL_ATTACHMENT_LIMITS,
  combineEmailHtml,
  finalizeEditableEmailHtml,
  prepareEmailDraft,
  sanitizePreservedEmailHtmlForPreview,
  validateEmailAttachments,
  type EmailComposerAttachment,
} from "./email-html";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("prepareEmailDraft", () => {
  it("normalizes provider-equivalent markup into the portable email profile", () => {
    const result = prepareEmailDraft({ html: RTL_EDITABLE_FIXTURE });

    expect(result.mode).toBe("rich");
    expect(result.editableHtml).toBe(
      '<p dir="rtl">שלום <strong>עולם</strong></p><p dir="rtl"><br></p><p dir="rtl"><em>שורה שנייה</em></p>',
    );
    expect(result.unsupported).toEqual([]);
  });

  it("keeps unsupported editable layouts byte-for-byte in safe fallback mode", () => {
    const result = prepareEmailDraft({
      html: UNSUPPORTED_EDITABLE_FIXTURE,
    });

    expect(result.mode).toBe("fallback");
    expect(result.editableHtml).toBe(UNSUPPORTED_EDITABLE_FIXTURE);
    expect(result.unsupported).toContain("table");
  });

  it("separates Gmail signatures and complex quotes without parsing them into the editor", () => {
    const result = prepareEmailDraft({ html: GMAIL_DRAFT_FIXTURE });

    expect(result.mode).toBe("rich");
    expect(result.editableHtml).toContain("Thanks for the update.");
    expect(result.editableHtml).not.toContain("gmail_signature");
    expect(result.signatureHtml).toContain("Example Company");
    expect(result.quotedHtml).toContain("Original table content");
    expect(result.quotedHtml).toContain("gmail_quote_container");
  });

  it("separates Outlook signatures and reply containers while preserving RTL", () => {
    const result = prepareEmailDraft({ html: OUTLOOK_DRAFT_FIXTURE });

    expect(result.mode).toBe("rich");
    expect(result.editableHtml).toBe('<p dir="rtl">תודה על העדכון</p>');
    expect(result.signatureHtml).toContain('id="Signature"');
    expect(result.quotedHtml).toContain('id="divRplyFwdMsg"');
    expect(result.quotedHtml).toContain("Original Outlook table");
  });

  it("separates quotes after long runs of provider break markup", () => {
    const separators = "\t<br>\n".repeat(2000);
    const result = prepareEmailDraft({
      html: `<p>Reply</p>${separators}<div class="gmail_quote">Original</div>`,
    });

    expect(result.editableHtml).toBe("<p>Reply</p>");
    expect(result.quotedHtml).toBe('<div class="gmail_quote">Original</div>');
  });

  it("uses an explicitly preserved quote instead of searching editable HTML", () => {
    const quote =
      '<div class="gmail_quote"><table><tbody><tr><td>Keep me</td></tr></tbody></table></div>';
    const result = prepareEmailDraft({
      html: "<div>Hello</div>",
      quotedHtml: quote,
    });

    expect(result.editableHtml).toBe("<p>Hello</p>");
    expect(result.quotedHtml).toBe(quote);
  });

  it("does not silently flatten unsupported list or styled-span semantics", () => {
    const listItem = prepareEmailDraft({
      html: '<ol><li value="4">Fourth</li></ol>',
    });
    const styledSpan = prepareEmailDraft({
      html: '<p><span style="font-weight:500">Medium</span></p>',
    });

    expect(listItem.mode).toBe("fallback");
    expect(listItem.editableHtml).toBe('<ol><li value="4">Fourth</li></ol>');
    expect(styledSpan.mode).toBe("fallback");
    expect(styledSpan.editableHtml).toBe(
      '<p><span style="font-weight:500">Medium</span></p>',
    );
  });

  it("ignores formatting whitespace between blocks and retains inline Content-IDs", () => {
    const result = prepareEmailDraft({
      html: '\n<p>First</p>\n<p><img src="cid:image@example" data-content-id="image@example" alt="Image"></p>\n',
    });

    expect(result.mode).toBe("rich");
    expect(result.editableHtml).toBe(
      '<p>First</p><p><img src="cid:image@example" data-content-id="image@example" alt="Image"></p>',
    );
  });

  it("uses the lossless fallback for remote editable images", () => {
    const html = '<p><img src="https://tracker.example/image.png"></p>';
    const result = prepareEmailDraft({ html });

    expect(result.mode).toBe("fallback");
    expect(result.editableHtml).toBe(html);
  });
});

describe("outgoing HTML", () => {
  it("combines canonical reply, preserved signature, and quote in provider order", () => {
    expect(
      combineEmailHtml({
        editableHtml: "<p>Hello</p>",
        signatureHtml: '<div class="gmail_signature">Regards</div>',
        quotedHtml: '<div class="gmail_quote">Original</div>',
      }),
    ).toBe(
      '<p>Hello</p><br><div class="gmail_signature">Regards</div><br><div class="gmail_quote">Original</div>',
    );
  });

  it("preserves surrounding provider whitespace while combining HTML", () => {
    expect(
      combineEmailHtml({
        editableHtml: " <p>Hello</p> ",
        quotedHtml: '\n<div class="gmail_quote">Original</div>\n',
      }),
    ).toBe(' <p>Hello</p> <br>\n<div class="gmail_quote">Original</div>\n');
  });

  it("rewrites composer previews to matching Content-ID URLs and rejects data URLs", () => {
    const result = finalizeEditableEmailHtml({
      html: '<p>Diagram <img src="blob:https://app.example/preview" data-content-id="inline-1@example" alt="Diagram"></p><img src="data:image/png;base64,AAAA">',
      inlineAttachments: [
        attachment({
          disposition: "inline",
          contentId: "inline-1@example",
          mimeType: "image/png",
        }),
      ],
    });

    expect(result).toContain('src="cid:inline-1@example"');
    expect(result).not.toContain("blob:");
    expect(result).not.toContain("data:image");
    expect(result).not.toContain("data-content-id");
  });
});

describe("preserved HTML preview", () => {
  it("keeps complex layout but blocks active content and remote tracking images", () => {
    const result = sanitizePreservedEmailHtmlForPreview(
      '<table background="https://tracker.example/background" style="position : fixed;width:100%"><tbody><tr><td onclick="steal()" contenteditable="false">Content<script>steal()</script><img src="https://tracker.example/pixel" srcset="https://tracker.example/large 2x" onerror="steal()" alt="Logo"></td></tr></tbody></table>',
    );

    expect(result).toContain("<table");
    expect(result).toContain("Content");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("tracker.example");
    expect(result).not.toContain("position");
    expect(result).not.toContain("contenteditable");
    expect(result).toContain("width:100%");
  });
});

describe("validateEmailAttachments", () => {
  it("accepts distinct regular and inline attachments within shared limits", () => {
    const result = validateEmailAttachments([
      attachment(),
      attachment({
        id: "inline-1",
        disposition: "inline",
        contentId: "inline-1@example",
        mimeType: "image/png",
      }),
    ]);

    expect(result).toEqual({ valid: true });
  });

  it("accepts an empty regular attachment", () => {
    expect(
      validateEmailAttachments([
        attachment({ contentBase64: "", filename: "empty.txt", size: 0 }),
      ]),
    ).toEqual({ valid: true });
  });

  it("rejects oversized inline images and duplicate Content-IDs", () => {
    const oversized = attachment({
      disposition: "inline",
      contentId: "duplicate@example",
      mimeType: "image/png",
      size: EMAIL_ATTACHMENT_LIMITS.maxInlineBytes + 1,
    });
    expect(validateEmailAttachments([oversized])).toEqual({
      valid: false,
      error: "Inline images must be 3 MB or smaller.",
    });

    const first = attachment({
      id: "inline-1",
      disposition: "inline",
      contentId: "duplicate@example",
      mimeType: "image/png",
    });
    const second = attachment({
      id: "inline-2",
      disposition: "inline",
      contentId: "duplicate@example",
      mimeType: "image/jpeg",
    });
    expect(validateEmailAttachments([first, second])).toEqual({
      valid: false,
      error: "Inline image Content-IDs must be unique.",
    });
  });

  it("rejects attachment sizes that do not match their decoded content", () => {
    expect(validateEmailAttachments([attachment({ size: 8 })])).toEqual({
      valid: false,
      error: "Attachment sizes do not match their content.",
    });
  });

  it("rejects inline content that does not match its declared image type", () => {
    expect(
      validateEmailAttachments([
        attachment({
          contentBase64: "Y29udGVudA==",
          contentId: "spoofed@example",
          disposition: "inline",
          id: "spoofed",
          mimeType: "image/png",
          size: 7,
        }),
      ]),
    ).toEqual({
      valid: false,
      error: "Inline image content does not match its file type.",
    });
  });
});

function attachment(
  overrides: Partial<EmailComposerAttachment> = {},
): EmailComposerAttachment {
  const inlineImage = overrides.disposition === "inline";
  return {
    id: "attachment-1",
    filename: "document.pdf",
    mimeType: inlineImage ? "image/png" : "application/pdf",
    size: inlineImage ? 68 : 7,
    contentBase64: inlineImage ? PNG_BASE64 : "Y29udGVudA==",
    disposition: "attachment",
    ...overrides,
  };
}
