import type { EmailProvider } from "@/utils/email/types";

/**
 * Resolves label name and ID pairing for a label action.
 * - If only label name is provided, looks up the labelId
 * - If only labelId is provided, looks up the label name
 * - If both are provided, returns both
 * - Returns null for both if lookup fails
 */
export async function resolveLabelNameAndId({
  emailProvider,
  label,
  labelId,
}: {
  emailProvider: EmailProvider;
  label?: string | null;
  labelId?: string | null;
}): Promise<{ label: string | null; labelId: string | null }> {
  // If we have both, return them
  if (label && labelId) {
    return { label, labelId };
  }

  // If we have label name, look up the ID
  if (label) {
    try {
      const foundLabel = await emailProvider.getLabelByName(label);
      return {
        label,
        labelId: foundLabel?.id ?? null,
      };
    } catch {
      return { label, labelId: null };
    }
  }

  // If we have labelId, look up the name
  if (labelId) {
    try {
      const foundLabel = await emailProvider.getLabelById(labelId);
      return {
        label: foundLabel?.name ?? null,
        labelId,
      };
    } catch {
      return { label: null, labelId };
    }
  }

  // Neither provided
  return { label: null, labelId: null };
}
