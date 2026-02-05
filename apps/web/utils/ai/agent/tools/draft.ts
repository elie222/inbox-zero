import { tool, type InferUITool } from "ai";
import { z } from "zod";
import type {
  AgentToolContextWithEmail,
  ExecuteActionFn,
  StructuredAction,
} from "@/utils/ai/agent/types";

const draftReplySchema = z.object({
  content: z.string().min(1).describe("Draft reply content"),
  subject: z.string().optional(),
  to: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
});

type DraftReplyToolContext = AgentToolContextWithEmail & {
  executeAction: ExecuteActionFn;
  dryRun?: boolean;
};

export const draftReplyTool = ({
  emailAccountId,
  provider,
  resourceType,
  emailId,
  threadId,
  logger,
  executeAction,
  dryRun,
}: DraftReplyToolContext) =>
  tool({
    description: "Create a draft reply to an email",
    inputSchema: draftReplySchema,
    execute: async ({ content, subject, to, cc, bcc }) => {
      const log = logger.with({ tool: "draftReply" });
      log.info("Creating draft reply");

      const action: StructuredAction = {
        type: "draft",
        resourceId: emailId,
        content,
        subject,
        to,
        cc,
        bcc,
      };

      const result = await executeAction(action, {
        emailAccountId,
        provider,
        resourceType,
        emailId,
        threadId,
        triggeredBy: "ai:decision",
        dryRun,
      });

      return {
        emailId,
        threadId,
        result,
      };
    },
  });

export type DraftReplyTool = InferUITool<ReturnType<typeof draftReplyTool>>;
