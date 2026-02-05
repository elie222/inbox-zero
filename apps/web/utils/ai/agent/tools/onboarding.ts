import { tool, type InferUITool } from "ai";
import { z } from "zod";

const showSetupPreviewSchema = z.object({});

export const showSetupPreviewTool = () =>
  tool({
    description:
      "Show a visual preview of the default labels. Call this to display the setup table. Keep your text brief - just a short intro before calling this.",
    inputSchema: showSetupPreviewSchema,
    execute: async () => {
      return {
        labels: [
          { name: "To Reply", actions: ["label"] },
          { name: "Awaiting Reply", actions: ["label"] },
          { name: "Actioned", actions: ["label"] },
          { name: "FYI", actions: ["label"] },
          { name: "Newsletter", actions: ["label"] },
          { name: "Calendar", actions: ["label"] },
          { name: "Receipt", actions: ["label"] },
          { name: "Notification", actions: ["label"] },
          { name: "Marketing", actions: ["skipInbox", "label"] },
          { name: "Cold Email", actions: ["skipInbox", "label"] },
        ],
      };
    },
  });

export type ShowSetupPreviewTool = InferUITool<
  ReturnType<typeof showSetupPreviewTool>
>;
