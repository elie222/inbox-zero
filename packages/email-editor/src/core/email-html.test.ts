import { describe, expect, it } from "vitest";
import {
  GMAIL_DRAFT_FIXTURE,
  OUTLOOK_DRAFT_FIXTURE,
} from "../fixtures/email-html";
import {
  EMAIL_ATTACHMENT_LIMITS,
  combineEmailHtml,
  createInlineContentId,
  detectInlineImageMimeType,
  finalizeEditableEmailHtml,
  prepareEmailDraft,
  sanitizePreservedEmailHtmlForPreview,
  splitQuotedHtml,
  validateEmailAttachments,
  type EmailComposerAttachment,
} from "./email-html";
import { canOpenEmailLink } from "./email-profile";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("prepareEmailDraft", () => {
  it("separates Gmail signatures and complex quotes", () => {
    const result = prepareEmailDraft({ html: GMAIL_DRAFT_FIXTURE });

    expect(result.mode).toBe("original");
    expect(result.editableHtml).toContain("Thanks for the update.");
    expect(result.editableHtml).not.toContain("gmail_signature");
    expect(result.signatureHtml).toContain("Example Company");
    expect(result.quotedHtml).toContain("Original table content");
    expect(result.quotedHtml).toContain("gmail_quote_container");
  });

  it("separates Outlook signatures and reply containers", () => {
    const result = prepareEmailDraft({ html: OUTLOOK_DRAFT_FIXTURE });

    expect(result.editableHtml).toBe(
      '<div dir="rtl"><p>תודה על העדכון</p></div>',
    );
    expect(result.signatureHtml).toContain('id="Signature"');
    expect(result.quotedHtml).toContain('id="divRplyFwdMsg"');
    expect(result.quotedHtml).toContain("Original Outlook table");
  });

  it("keeps the provider body exactly as written", () => {
    const html =
      '<div dir="rtl">שלום <b>עולם</b><!--[if mso]>x<![endif]--></div>';
    expect(prepareEmailDraft({ html })).toMatchObject({
      editableHtml: html,
      mode: "original",
    });
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

    expect(result.editableHtml).toBe("<div>Hello</div>");
    expect(result.quotedHtml).toBe(quote);
  });

  it("drops blank blocks left between the reply and its quote", () => {
    const result = prepareEmailDraft({
      html: '<div>Reply</div><br><div dir="ltr"></div>\n<br>\n<div class="gmail_quote">Original</div>',
    });

    expect(result.editableHtml).toBe("<div>Reply</div>");
    expect(result.quotedHtml).toBe('<div class="gmail_quote">Original</div>');
  });

  it("does not grow a reply each time it is saved and reopened", () => {
    const signatureHtml = '<div dir="ltr">Alex Example</div>';
    let html = combineEmailHtml({
      editableHtml: "<div>Reply</div>",
      signatureHtml,
      quotedHtml: '<div class="gmail_quote">Original</div>',
    });
    const saved = html;

    for (let reopen = 0; reopen < 3; reopen++) {
      const { quotedHtml, editableHtml } = splitQuotedHtml(html);
      const draft = prepareEmailDraft({
        html: editableHtml,
        quotedHtml,
        signatureHtml,
      });
      expect(draft.editableHtml).toBe("<div>Reply</div>");
      html = combineEmailHtml(draft);
    }

    expect(html).toBe(saved);
  });

  it("finds an edited signature again when a sent draft is reopened", () => {
    const sent = finalizeEditableEmailHtml({
      mode: "edited",
      html: '<div>Hello</div><div data-smartmail="gmail_signature"><div><br></div><div>Edited <a href="https://example.com/new">link</a></div></div>',
      inlineAttachments: [],
    });
    const reopened = prepareEmailDraft({
      html: sent,
      signatureHtml: "<div>Original signature</div>",
    });

    expect(reopened.editableHtml).toBe("<div>Hello</div>");
    expect(reopened.signatureHtml).toContain("Edited");
    expect(reopened.signatureHtml).not.toContain("Original signature");
  });
});

describe("outgoing HTML", () => {
  it("combines the reply, preserved signature, and quote in provider order", () => {
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
      mode: "edited",
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

  it.each([
    '<noscript><img src="https://tracker.example/pixel"></noscript>',
    '<math><mtext><table><mglyph><style><img src="https://tracker.example/pixel"></style></mglyph></table></mtext></math>',
    "<div><style>body{background:url(https://tracker.example/bg)}</style></div>",
    '<link rel="stylesheet" href="https://tracker.example/style.css">',
  ])("never lets a preview reach the sender's host: %s", (html) => {
    expect(sanitizePreservedEmailHtmlForPreview(html)).not.toContain(
      "tracker.example",
    );
  });
});

describe("portable composer helpers", () => {
  it("only opens web, email, and telephone links", () => {
    expect(canOpenEmailLink("mailto:hello@example.com")).toBe(true);
    expect(canOpenEmailLink("javascript:alert(1)")).toBe(false);
    expect(canOpenEmailLink("#reply")).toBe(false);
  });

  it("detects inline image MIME types from their content", () => {
    expect(detectInlineImageMimeType(PNG_BASE64)).toBe("image/png");
    expect(detectInlineImageMimeType("Y29udGVudA==")).toBeNull();
  });

  it("creates safe Content-IDs for a caller-owned domain", () => {
    expect(createInlineContentId("mobile.inboxzero")).toMatch(
      /^[^<>\s]+@mobile\.inboxzero$/u,
    );
    expect(() => createInlineContentId("invalid domain")).toThrow(
      "Content-ID domain is invalid.",
    );
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
