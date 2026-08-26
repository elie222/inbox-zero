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

// Returns null when the change should be ignored (e.g. the pending search
// query is not a valid email yet). An empty array means the sole recipient
// was deselected, so it resolves to an empty selection rather than a no-op.
export function resolveRecipientSelection(values: string[]): string | null {
  if (values.length === 0) return "";
  const lastValue = values.at(-1);
  if (!lastValue || !isValidEmail(lastValue)) return null;
  return values.join(",");
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
