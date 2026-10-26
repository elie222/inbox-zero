import { prepareEmailDraft } from "@inboxzero/email-editor/core";
import {
  findReplySendAsAddress,
  type SendAsAddress,
} from "@/utils/email/send-as";
import { createPreservedEmailBlocks } from "@/utils/email/preserved-blocks";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import { stripBrandingSignatures } from "@/utils/referral/signature";
import type { ComposeAttachment } from "./compose-attachments";

export function createInitialComposeContent({
  storedDraft,
  initialAttachments,
  replyingToEmail,
  initialSendAs,
  sendAsAddresses,
  accountSignatureHtml,
  sentWithFooterHtml,
}: {
  storedDraft?: StoredReplyDraft;
  initialAttachments: ComposeAttachment[];
  replyingToEmail?: {
    draftHtml?: string;
    quotedContentHtml?: string;
    signatureHtml?: string;
  };
  initialSendAs?: SendAsAddress;
  sendAsAddresses: SendAsAddress[];
  accountSignatureHtml: string;
  sentWithFooterHtml: string;
}) {
  // Copied because restoring marks the inline images the editor shows.
  const restoredAttachments = initialAttachments.map((attachment) => ({
    ...attachment,
  }));
  if (storedDraft?.content) {
    const { draft, preservedBlocks } = storedDraft.content;
    const parsedDraft = new DOMParser().parseFromString(
      draft.editableHtml,
      "text/html",
    );
    // HTML still in its original form is sent exactly as loaded, so its
    // cid: images must not be swapped for local previews.
    const images =
      draft.mode === "edited"
        ? parsedDraft.querySelectorAll('img[data-content-id], img[src^="cid:"]')
        : [];
    for (const image of images) {
      const contentId =
        image.getAttribute("data-content-id") ??
        image.getAttribute("src")?.slice(4);
      const attachment = restoredAttachments.find(
        (item) => item.contentId === contentId,
      );
      if (attachment && contentId) {
        // Without a preview the image still goes out as its attachment.
        image.setAttribute("src", attachment.previewUrl ?? `cid:${contentId}`);
        image.setAttribute("data-content-id", contentId);
        attachment.managed = true;
      }
    }
    return {
      draft: {
        ...draft,
        editableHtml: sentWithFooterHtml
          ? stripBrandingOutsideSignature(parsedDraft.body)
          : parsedDraft.body.innerHTML,
      },
      preservedBlocks,
      attachments: restoredAttachments,
    };
  }

  const preparedDraft = prepareEmailDraft({
    html: replyingToEmail?.draftHtml ?? "",
    quotedHtml: replyingToEmail?.quotedContentHtml,
    signatureHtml:
      replyingToEmail?.signatureHtml ??
      getSendAsSignatureHtml(
        initialSendAs,
        sendAsAddresses,
        accountSignatureHtml,
      ) ??
      undefined,
  });
  // The footer travels with the signature so it lands right after it and is
  // removed with it, without introducing another block in the composer. A
  // reopened draft's signature may already carry a footer; it is replaced.
  const draft = {
    ...preparedDraft,
    editableHtml: sentWithFooterHtml
      ? stripBrandingSignatures(preparedDraft.editableHtml)
      : preparedDraft.editableHtml,
    signatureHtml: withSentWithFooter(
      preparedDraft.signatureHtml,
      sentWithFooterHtml,
    ),
  };
  const preservedBlocks = createPreservedEmailBlocks(draft);
  return { draft, preservedBlocks, attachments: restoredAttachments };
}

// Only an account with aliases picks an address; the rest keep sending
// without one so the provider applies its default.
export function findSelectableSendAs(
  candidates: string | undefined,
  addresses: SendAsAddress[],
) {
  if (addresses.length < 2) return;
  return findReplySendAsAddress(candidates, addresses);
}

// Mail sent through the API gets no signature from the provider, so the
// default address falls back to the provider's signature when none is set in
// Inbox Zero. An alias uses its own when the provider has one.
export function getSendAsSignatureHtml(
  address: SendAsAddress | undefined,
  addresses: SendAsAddress[],
  accountSignatureHtml: string,
) {
  const sendAs = address ?? addresses.find((item) => item.isDefault);
  if (sendAs?.isDefault) return accountSignatureHtml || sendAs.signature || "";
  return sendAs?.signature || accountSignatureHtml;
}

export function withSentWithFooter(signatureHtml: string, footerHtml: string) {
  return [stripBrandingSignatures(signatureHtml.trim()), footerHtml]
    .filter(Boolean)
    .join("<br>");
}

// The footer inside the composer's signature belongs to it; only branding
// elsewhere in the body is removed.
function stripBrandingOutsideSignature(body: HTMLElement) {
  const signature = body.querySelector(":scope > [data-smartmail]");
  if (!signature) return stripBrandingSignatures(body.innerHTML);
  const placeholder = document.createComment("signature");
  signature.replaceWith(placeholder);
  const html = stripBrandingSignatures(body.innerHTML);
  // A function replacer keeps "$" sequences in the signature literal.
  return html.replace("<!--signature-->", () => signature.outerHTML);
}
