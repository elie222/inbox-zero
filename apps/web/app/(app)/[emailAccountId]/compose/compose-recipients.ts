import { isValidEmail, splitRecipientList } from "@/utils/email";
import { mergeAndDedupeRecipients } from "@/utils/email/reply-all";

export type ComposeRecipientField = "to" | "cc" | "bcc";

export function resolveComposeRecipientFields({
  selectedRecipients,
  pendingRecipients,
}: {
  selectedRecipients: Record<ComposeRecipientField, string | undefined>;
  pendingRecipients: Record<ComposeRecipientField, string>;
}) {
  const resolveField = (field: ComposeRecipientField) =>
    resolveComposeRecipients({
      selectedRecipients: selectedRecipients[field],
      pendingRecipient: pendingRecipients[field],
    });

  return {
    to: resolveField("to"),
    cc: resolveField("cc") || undefined,
    bcc: resolveField("bcc") || undefined,
  };
}

export function resolveComposeRecipients({
  selectedRecipients,
  pendingRecipient,
}: {
  selectedRecipients: string | undefined;
  pendingRecipient: string;
}) {
  const selected = splitRecipientList(selectedRecipients ?? "");
  const pending = pendingRecipient.trim();

  if (!isValidEmail(pending)) return selected.join(",");

  return mergeAndDedupeRecipients(selected, pending).join(",");
}
