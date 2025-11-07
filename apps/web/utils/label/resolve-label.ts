import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { hasVariables } from "@/utils/template";

const logger = createScopedLogger("resolve-label");

/**
 * Resolves label name and ID pairing for a label action.
 * - If only label name is provided, looks up the labelId (creates if not found)
 * - If only labelId is provided, looks up the label name
 * - If both are provided, returns both
 * - Returns null for both if lookup fails
 * - Skips resolution for AI templates (strings containing {{...}})
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

  // If we have label name with AI template, don't resolve it
  // Templates will be processed at runtime by the AI
  if (label && hasVariables(label)) {
    return { label, labelId: null };
  }

  // If we have label name, look up the ID (or create if not found)
  if (label) {
    try {
      const foundLabel = await emailProvider.getLabelByName(label);

      if (foundLabel) {
        return {
          label,
          labelId: foundLabel.id,
        };
      }

      logger.info("Label not found during rule creation, creating it", {
        labelName: label,
      });
      const createdLabel = await emailProvider.createLabel(label);
      return { label, labelId: createdLabel.id };
    } catch (error) {
      logger.error("Error resolving label", { labelName: label, error });
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
