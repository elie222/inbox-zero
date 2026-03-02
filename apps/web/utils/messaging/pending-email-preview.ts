import { convertEmailHtmlToText } from "@/utils/mail";
import { removeExcessiveWhitespace, truncate } from "@/utils/string";

const PENDING_EMAIL_PREVIEW_MAX_CHARS = 600;

type PendingEmailPreviewPart = {
  type: "tool-sendEmail" | "tool-replyEmail" | "tool-forwardEmail";
  output?: {
    pendingAction?: {
      messageHtml?: string | null;
      content?: string | null;
    };
  };
};

export function buildPendingEmailPreview(
  part: PendingEmailPreviewPart,
): string | null {
  const rawContent = getPendingEmailPreviewContent(part);
  if (!rawContent) return null;

  const normalized = removeExcessiveWhitespace(rawContent);
  if (!normalized) return null;

  return truncate(normalized, PENDING_EMAIL_PREVIEW_MAX_CHARS);
}

function getPendingEmailPreviewContent(part: PendingEmailPreviewPart) {
  const pendingAction = part.output?.pendingAction;
  if (!pendingAction) return null;

  if (part.type === "tool-sendEmail") {
    const messageHtml = pendingAction.messageHtml?.trim();
    if (!messageHtml) return null;

    try {
      return convertEmailHtmlToText({
        htmlText: messageHtml,
        includeLinks: false,
      });
    } catch {
      return messageHtml.replace(/<[^>]+>/g, " ");
    }
  }

  return pendingAction.content?.trim() || null;
}
