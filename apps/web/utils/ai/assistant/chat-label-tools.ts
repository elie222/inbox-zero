import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { posthogCaptureEvent } from "@/utils/posthog";

const listLabelsInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullish()
      .describe("Optional label name filter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum number of labels to return."),
  })
  .strict();

const createOrGetLabelInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Exact label name to reuse or create."),
  })
  .strict();

export const manageLabelsTool = ({
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
      "Manage the user's label catalog. Use list to inspect existing labels. Use createOrGet to reuse an existing label by exact name or create it if missing.",
    inputSchema: z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("list"),
        })
        .merge(listLabelsInputSchema),
      z
        .object({
          action: z.literal("createOrGet"),
        })
        .merge(createOrGetLabelInputSchema),
    ]),
    execute: async (input) => {
      trackToolCall({ tool: "manage_labels", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        if (input.action === "list") {
          const labels = await emailProvider.getLabels();
          const query = input.query ? normalizeLabelName(input.query) : null;
          const filteredLabels = query
            ? labels.filter((label) =>
                normalizeLabelName(label.name).includes(query),
              )
            : labels;
          const limitedLabels = filteredLabels.slice(0, input.limit);

          return {
            action: "list" as const,
            totalCount: filteredLabels.length,
            returnedCount: limitedLabels.length,
            truncated: filteredLabels.length > limitedLabels.length,
            labels: limitedLabels.map((label) => ({
              id: label.id,
              name: label.name,
              type: label.type,
            })),
          };
        }

        const labels = await emailProvider.getLabels();
        const normalizedName = normalizeLabelName(input.name);
        const existingLabel = labels.find(
          (label) => normalizeLabelName(label.name) === normalizedName,
        );

        if (existingLabel) {
          return {
            action: "createOrGet" as const,
            created: false,
            label: {
              id: existingLabel.id,
              name: existingLabel.name,
              type: existingLabel.type,
            },
          };
        }

        const createdLabel = await emailProvider.createLabel(input.name);

        return {
          action: "createOrGet" as const,
          created: true,
          label: {
            id: createdLabel.id,
            name: createdLabel.name,
            type: createdLabel.type,
          },
        };
      } catch (error) {
        logger.error("Failed to manage labels", {
          error,
          action: input.action,
        });
        return {
          error: "Failed to manage labels",
        };
      }
    },
  });

export type ManageLabelsTool = InferUITool<ReturnType<typeof manageLabelsTool>>;

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

function normalizeLabelName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
