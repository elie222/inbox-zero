import { toastError, toastSuccess } from "@/components/Toast";
import { upsertRuleAttachmentSourcesAction } from "@/utils/actions/attachment-sources";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import { getActionErrorMessage } from "@/utils/error";

export async function handleRuleAttachmentSourceSave({
  emailAccountId,
  ruleId,
  attachmentSources,
  shouldSave,
  successMessage,
  partialErrorMessage,
}: {
  emailAccountId: string;
  ruleId: string;
  attachmentSources: AttachmentSourceInput[];
  shouldSave: boolean;
  successMessage: string;
  partialErrorMessage: string;
}) {
  if (!shouldSave) {
    toastSuccess({ description: successMessage });
    return "skipped" as const;
  }

  const result = await upsertRuleAttachmentSourcesAction(emailAccountId, {
    ruleId,
    sources: attachmentSources,
  });

  if (result?.serverError || result?.validationErrors) {
    toastError({
      description: getActionErrorMessage(result, partialErrorMessage),
    });
    return "partial" as const;
  }

  toastSuccess({ description: successMessage });
  return "ok" as const;
}
