import {
  combineEmailHtml,
  finalizeEditableEmailHtml,
  type PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import {
  type ComposeAttachment,
  getEditorInlineAttachments,
} from "./compose-attachments";

export function buildComposeMessageHtml({
  draft,
  preservedBlockIds,
  attachments,
}: {
  draft: PreparedEmailDraft;
  preservedBlockIds: string[];
  attachments: ComposeAttachment[];
}) {
  const editableHtml = finalizeEditableEmailHtml({
    html: draft.editableHtml,
    inlineAttachments: getEditorInlineAttachments(attachments),
    mode: draft.mode,
  });
  return {
    editableHtml,
    messageHtml: combineEmailHtml({
      editableHtml,
      signatureHtml: preservedBlockIds.includes("signature")
        ? draft.signatureHtml
        : "",
      quotedHtml: preservedBlockIds.includes("quote") ? draft.quotedHtml : "",
    }),
  };
}
