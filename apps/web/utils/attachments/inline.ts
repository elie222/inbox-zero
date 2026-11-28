import type { Attachment } from "@/utils/types";

/**
 * Whether a MIME part is an asset embedded in the HTML body rather than a file.
 *
 * Inline parts are only ever rendered by swapping `cid:` image sources, so any
 * other part must stay in the attachment list or it is hidden everywhere.
 * `Content-Disposition: inline` alone is not enough: Apple Mail marks every
 * file dropped into the body (PDFs included) as inline, without a Content-ID.
 */
export function isInlineAttachment(
  attachment: Pick<Attachment, "mimeType" | "headers">,
): boolean {
  const disposition = attachment.headers?.["content-disposition"]
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    disposition !== "attachment" &&
    Boolean(attachment.headers?.["content-id"]) &&
    attachment.mimeType.toLowerCase().startsWith("image/")
  );
}
