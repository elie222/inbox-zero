import { tool, type InferUITool } from "ai";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import type { AgentToolContext } from "@/utils/ai/agent/types";

const bulkArchiveSchema = z.object({
  senders: z
    .array(z.string().email())
    .min(1)
    .max(50)
    .describe("Email addresses of senders to archive all emails from"),
});

export const bulkArchiveTool = ({
  emailAccountId,
  emailAccountEmail,
  provider,
  logger,
}: AgentToolContext) =>
  tool({
    description:
      "Archive all emails from specific senders in bulk. Use this for cleanup during onboarding - much faster than archiving one by one.",
    inputSchema: bulkArchiveSchema,
    execute: async ({ senders }) => {
      const log = logger.with({ tool: "bulkArchive" });
      log.info("Bulk archiving emails from senders", {
        senderCount: senders.length,
      });

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const result = await emailProvider.bulkArchiveFromSenders(
        senders,
        emailAccountEmail,
      );

      log.info("Bulk archive complete", { result });

      return {
        archived: result.totalArchived,
        senders: senders.length,
      };
    },
  });

export type BulkArchiveTool = InferUITool<ReturnType<typeof bulkArchiveTool>>;
