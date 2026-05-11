import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { normalizeLabelName } from "@/utils/label/normalize-label-name";
import { posthogCaptureEvent } from "@/utils/posthog";

type ResourceTerms = {
  resource: "label" | "category";
  resourcePlural: "labels" | "categories";
  providerHint: string;
  listToolName: string;
  createToolName: string;
};

const labelTerms: ResourceTerms = {
  resource: "label",
  resourcePlural: "labels",
  providerHint: "account",
  listToolName: "list_labels",
  createToolName: "create_or_get_label",
};

const categoryTerms: ResourceTerms = {
  resource: "category",
  resourcePlural: "categories",
  providerHint: "Outlook account",
  listToolName: "list_categories",
  createToolName: "create_or_get_category",
};

function buildListTool({
  email,
  emailAccountId,
  provider,
  logger,
  terms,
}: ToolOptions & { terms: ResourceTerms }) {
  return tool({
    description: `List all existing ${terms.resourcePlural} for this ${terms.providerHint}.`,
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: terms.listToolName, email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const items = await emailProvider.getLabels();

        return {
          [terms.resourcePlural]: items.map(pickLabelFields),
        };
      } catch (error) {
        logger.error(`Failed to list ${terms.resourcePlural}`, { error });
        return {
          error: `Failed to list ${terms.resourcePlural}`,
        };
      }
    },
  });
}

function buildCreateOrGetTool({
  email,
  emailAccountId,
  provider,
  logger,
  terms,
}: ToolOptions & { terms: ResourceTerms }) {
  const inputSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(`Exact ${terms.resource} name to reuse or create.`),
  });

  const listToolName =
    terms.resource === "label" ? "listLabels" : "listCategories";

  return tool({
    description: `Reuse an existing ${terms.resource} by exact name or create it if it does not exist yet. Do not call ${listToolName} first — this tool handles the check-and-create in one step.`,
    inputSchema,
    execute: async (input) => {
      trackToolCall({ tool: terms.createToolName, email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const normalizedName = normalizeLabelName(input.name);
        const items = await emailProvider.getLabels();
        const existing = findNormalizedLabel(items, normalizedName);

        if (existing) {
          return {
            created: false,
            [terms.resource]: pickLabelFields(existing),
          };
        }

        const hiddenAware = await emailProvider.getLabels({
          includeHidden: true,
        });
        const existingHidden = findNormalizedLabel(hiddenAware, normalizedName);

        if (existingHidden) {
          return {
            created: false,
            [terms.resource]: pickLabelFields(existingHidden),
          };
        }

        const created = await emailProvider.createLabel(input.name);

        return { created: true, [terms.resource]: pickLabelFields(created) };
      } catch (error) {
        logger.error(`Failed to create or get ${terms.resource}`, { error });
        return {
          error: `Failed to create or get ${terms.resource}`,
        };
      }
    },
  });
}

type ToolOptions = {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
};

export const listLabelsTool = (options: ToolOptions) =>
  buildListTool({ ...options, terms: labelTerms });

export const createOrGetLabelTool = (options: ToolOptions) =>
  buildCreateOrGetTool({ ...options, terms: labelTerms });

export const listCategoriesTool = (options: ToolOptions) =>
  buildListTool({ ...options, terms: categoryTerms });

export const createOrGetCategoryTool = (options: ToolOptions) =>
  buildCreateOrGetTool({ ...options, terms: categoryTerms });

export type ListLabelsTool = InferUITool<ReturnType<typeof listLabelsTool>>;
export type CreateOrGetLabelTool = InferUITool<
  ReturnType<typeof createOrGetLabelTool>
>;
export type ListCategoriesTool = InferUITool<
  ReturnType<typeof listCategoriesTool>
>;
export type CreateOrGetCategoryTool = InferUITool<
  ReturnType<typeof createOrGetCategoryTool>
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
