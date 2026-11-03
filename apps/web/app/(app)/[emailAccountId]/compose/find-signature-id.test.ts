// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderSentWithFooterHtml } from "@/utils/email/sent-with-footer";
import { findSignatureId, getDraftSignatureHtml } from "./find-signature-id";
import { createInitialComposeContent } from "./initial-compose-content";

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

  it("selects the matching image-only signature without matching empty text", () => {
    const images = [
      {
        id: "first",
        name: "First",
        signatureHtml: '<img src="https://example.com/first.png">',
      },
      {
        id: "second",
        name: "Second",
        signatureHtml: '<img src="https://example.com/second.png">',
      },
    ];
    expect(findSignatureId(images, images[1].signatureHtml)).toBe("second");
    expect(findSignatureId(images, "")).toBeUndefined();
    expect(
      findSignatureId(images, '<img src="https://example.com/other.png">'),
    ).toBeUndefined();
  });

  it("matches image-only signatures through compose initialization and edited draft extraction", () => {
    const images = [
      { id: "empty", name: "Empty", signatureHtml: "" },
      {
        id: "image",
        name: "Image",
        signatureHtml: '<img src="https://example.com/signature.png">',
      },
    ];
    const content = createInitialComposeContent({
      initialAttachments: [],
      sendAsAddresses: [],
      accountSignatureHtml: images[1].signatureHtml,
      sentWithFooterHtml: footer,
    });
    expect(findSignatureId(images, getDraftSignatureHtml(content.draft))).toBe(
      "image",
    );
    const signature = content.preservedBlocks.find(
      (block) => block.id === "signature",
    );
    expect(signature).toBeDefined();
    expect(
      findSignatureId(
        images,
        getDraftSignatureHtml({
          editableHtml: `<p>Hello</p><div data-smartmail="gmail_signature"><div><br></div>${signature?.html}</div>`,
          signatureHtml: "",
        }),
      ),
    ).toBe("image");
    expect(findSignatureId(images, `<div><br></div>${footer}`)).toBeUndefined();
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
