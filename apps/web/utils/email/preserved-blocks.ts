import type { PreparedEmailDraft } from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";

export function createPreservedEmailBlocks(
  draft: Pick<PreparedEmailDraft, "signatureHtml" | "quotedHtml">,
): EmailEditorPreservedBlock[] {
  const blocks: EmailEditorPreservedBlock[] = [];
  if (draft.signatureHtml) {
    blocks.push({
      id: "signature",
      kind: "signature",
      html: draft.signatureHtml,
      collapsed: false,
    });
  }
  if (draft.quotedHtml) {
    blocks.push({
      id: "quote",
      kind: "quote",
      html: draft.quotedHtml,
      collapsed: true,
    });
  }
  return blocks;
}
