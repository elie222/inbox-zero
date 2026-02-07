import { tool, type InferUITool } from "ai";
import { z } from "zod";
import type {
  AgentToolContextWithEmail,
  ExecuteActionFn,
  StructuredAction,
} from "@/utils/ai/agent/types";

const forwardEmailSchema = z.object({
  to: z.string().describe("Recipient email address to forward to"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  content: z.string().optional().describe("Optional message to include"),
});

type ForwardEmailToolContext = AgentToolContextWithEmail & {
  executeAction: ExecuteActionFn;
  dryRun?: boolean;
};

export const forwardEmailTool = ({
  emailAccountId,
  emailId,
  provider,
  resourceType,
  logger,
  executeAction,
  dryRun,
}: ForwardEmailToolContext) =>
  tool({
    description: "Forward the current email to another recipient",
    inputSchema: forwardEmailSchema,
    execute: async ({ to, cc, bcc, content }) => {
      const log = logger.with({ tool: "forwardEmail" });
      log.info("Preparing forward email request");

      const action: StructuredAction = {
        type: "forward",
        resourceId: emailId,
        to,
        cc,
        bcc,
        content,
      };

      const result = await executeAction(action, {
        emailAccountId,
        provider,
        resourceType,
        triggeredBy: "ai:decision",
        dryRun,
      });

      return { result };
    },
  });

export type ForwardEmailTool = InferUITool<ReturnType<typeof forwardEmailTool>>;
