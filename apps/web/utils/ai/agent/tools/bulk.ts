import { tool, type InferUITool } from "ai";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { validateAction } from "@/utils/ai/agent/validation/allowed-actions";
import type {
  AgentToolContext,
  StructuredAction,
} from "@/utils/ai/agent/types";

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
  dryRun,
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

      const action: StructuredAction = {
        type: "archive",
        resourceId: "bulk-archive",
      };
      const validation = await validateAction({
        action,
        context: {
          emailAccountId,
          provider,
          resourceType: "email",
          triggeredBy: "ai:decision:bulk-archive",
          dryRun,
        },
        logger: log,
      });

      if (!validation.allowed) {
        const blocked = await prisma.executedAgentAction.create({
          data: {
            actionType: "archive",
            actionData: {
              type: "archive",
              mode: "bulkArchiveFromSenders",
              senders,
            },
            status: "BLOCKED",
            error: validation.reason ?? 'Action type "archive" not enabled',
            triggeredBy: "ai:decision:bulk-archive",
            matchMetadata: {
              conditionsChecked: validation.conditionsChecked,
              senderCount: senders.length,
            },
            emailAccountId,
          },
        });

        return {
          archived: 0,
          senders: senders.length,
          blocked: true,
          reason: validation.reason,
          logId: blocked.id,
        };
      }

      if (dryRun) {
        return {
          archived: 0,
          senders: senders.length,
          dryRun: true,
        };
      }

      const actionLog = await prisma.executedAgentAction.create({
        data: {
          actionType: "archive",
          actionData: {
            type: "archive",
            mode: "bulkArchiveFromSenders",
            senders,
          },
          status: "PENDING",
          triggeredBy: "ai:decision:bulk-archive",
          matchMetadata: {
            conditionsChecked: validation.conditionsChecked,
            senderCount: senders.length,
          },
          emailAccountId,
        },
      });

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        const result = await emailProvider.bulkArchiveFromSenders(
          senders,
          emailAccountEmail,
        );

        await prisma.executedAgentAction.update({
          where: { id: actionLog.id },
          data: { status: "SUCCESS" },
        });

        log.info("Bulk archive complete", { result });

        return {
          archived: result.totalArchived,
          senders: senders.length,
          logId: actionLog.id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.executedAgentAction.update({
          where: { id: actionLog.id },
          data: {
            status: "FAILED",
            error: message,
          },
        });

        throw error;
      }
    },
  });

export type BulkArchiveTool = InferUITool<ReturnType<typeof bulkArchiveTool>>;
