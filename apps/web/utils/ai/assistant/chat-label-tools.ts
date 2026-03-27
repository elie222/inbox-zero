import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { normalizeLabelName } from "@/utils/label/normalize-label-name";
import { posthogCaptureEvent } from "@/utils/posthog";

const createOrGetLabelInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Exact label name to reuse or create."),
});

export const listLabelsTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "List all existing labels or categories for this account. Use this when the user asks to browse or inspect their labels and has not already given an exact label name.",
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: "list_labels", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const labels = await emailProvider.getLabels();

        return {
          labels: labels.map(pickLabelFields),
        };
      } catch (error) {
        logger.error("Failed to list labels", { error });
        return {
          error: "Failed to list labels",
        };
      }
    },
  });

export const createOrGetLabelTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Reuse an existing label by exact name or create it if it does not exist yet. Use this when the user gives a specific label name they want to use.",
    inputSchema: createOrGetLabelInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "create_or_get_label", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const normalizedName = normalizeLabelName(input.name);
        const labels = await emailProvider.getLabels();
        const existingLabel = findNormalizedLabel(labels, normalizedName);

        if (existingLabel) {
          return { created: false, label: pickLabelFields(existingLabel) };
        }

        const hiddenAwareLabels = await emailProvider.getLabels({
          includeHidden: true,
        });
        const existingHiddenLabel = findNormalizedLabel(
          hiddenAwareLabels,
          normalizedName,
        );

        if (existingHiddenLabel) {
          return {
            created: false,
            label: pickLabelFields(existingHiddenLabel),
          };
        }

        const createdLabel = await emailProvider.createLabel(input.name);

        return { created: true, label: pickLabelFields(createdLabel) };
      } catch (error) {
        logger.error("Failed to create or get label", { error });
        return {
          error: "Failed to create or get label",
        };
      }
    },
  });

export type ListLabelsTool = InferUITool<ReturnType<typeof listLabelsTool>>;
export type CreateOrGetLabelTool = InferUITool<
  ReturnType<typeof createOrGetLabelTool>
>;

function pickLabelFields(label: { id: string; name: string; type: string }) {
  return { id: label.id, name: label.name, type: label.type };
}

function findNormalizedLabel<T extends { name: string }>(
  labels: T[],
  normalizedName: string,
): T | undefined {
  return labels.find(
    (label) => normalizeLabelName(label.name) === normalizedName,
  );
}

async function trackToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}
