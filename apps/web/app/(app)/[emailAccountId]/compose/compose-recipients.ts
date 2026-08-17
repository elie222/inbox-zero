import { isValidEmail, splitRecipientList } from "@/utils/email";
import { mergeAndDedupeRecipients } from "@/utils/email/reply-all";

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
