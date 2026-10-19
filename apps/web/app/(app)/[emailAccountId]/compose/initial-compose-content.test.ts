// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import type { ComposeAttachment } from "./compose-attachments";
import { createInitialComposeContent } from "./initial-compose-content";

describe("createInitialComposeContent", () => {
  it("gives a new reply the account signature followed by the footer", () => {
    const content = createInitialComposeContent({
      initialAttachments: [],
      replyingToEmail: {
        quotedContentHtml: "<blockquote>Earlier</blockquote>",
      },
      accountSignatureHtml: "<div>Alex, Example Co</div>",
      sentWithFooterHtml: "<span>Footer</span>",
    });

    const signature = content.preservedBlocks.find(
      (block) => block.id === "signature",
    );
    expect(signature?.html).toContain("Alex, Example Co");
    expect(signature?.html.indexOf("Alex, Example Co")).toBeLessThan(
      signature?.html.indexOf("Footer") ?? -1,
    );
    expect(content.preservedBlocks.map((block) => block.id)).toContain("quote");
  });

  it("shows an edited draft's inline images from their previews", () => {
    const attachment = inlineImage();
    const content = createInitialComposeContent({
      storedDraft: storedDraft(
        "edited",
        '<p>See below</p><img src="cid:chart@local">',
      ),
      initialAttachments: [attachment],
      accountSignatureHtml: "",
      sentWithFooterHtml: "",
    });

    const image = parseImage(content.draft.editableHtml);
    expect(image?.getAttribute("src")).toBe("blob:chart-preview");
    expect(image?.getAttribute("data-content-id")).toBe("chart@local");
    expect(content.attachments[0].managed).toBe(true);
    expect(attachment.managed).toBeUndefined();
  });

  it("leaves a draft still in its original form untouched", () => {
    const content = createInitialComposeContent({
      storedDraft: storedDraft(
        "original",
        '<p>See below</p><img src="cid:chart@local">',
      ),
      initialAttachments: [inlineImage()],
      accountSignatureHtml: "",
      sentWithFooterHtml: "",
    });

    expect(parseImage(content.draft.editableHtml)?.getAttribute("src")).toBe(
      "cid:chart@local",
    );
    expect(content.attachments[0].managed).toBeFalsy();
  });
});

function inlineImage(): ComposeAttachment {
  return {
    id: "attachment-1",
    filename: "chart.png",
    mimeType: "image/png",
    size: 100,
    disposition: "inline",
    contentId: "chart@local",
    status: "uploaded",
    previewUrl: "blob:chart-preview",
  };
}

function storedDraft(
  mode: "edited" | "original",
  editableHtml: string,
): StoredReplyDraft {
  return {
    emailAccountId: "account-1",
    threadId: "thread-1",
    messageId: "message-1",
    revision: 1,
    updatedAt: 0,
    content: {
      values: { subject: "Report", to: "sam@example.com" },
      draft: { editableHtml, mode, quotedHtml: "", signatureHtml: "" },
      preservedBlocks: [],
      attachments: [],
    },
  };
}

function parseImage(html: string) {
  return new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("img");
}
