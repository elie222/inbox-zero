import { tool, type InferUITool } from "ai";
import { z } from "zod";
import type {
  AgentToolContext,
  ExecuteActionFn,
  StructuredAction,
} from "@/utils/ai/agent/types";

const sendEmailSchema = z
  .object({
    draftId: z.string().optional().describe("Draft ID to send"),
    to: z.string().optional().describe("Recipient email"),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().optional(),
    content: z.string().optional().describe("Email body"),
  })
  .refine(
    (value) =>
      Boolean(value.draftId) ||
      Boolean(value.to && value.subject && value.content),
    {
      message: "Provide draftId or to+subject+content to send a new message",
    },
  );

type SendEmailToolContext = AgentToolContext & {
  executeAction: ExecuteActionFn;
  dryRun?: boolean;
};

export const sendEmailTool = ({
  emailAccountId,
  provider,
  resourceType,
  logger,
  executeAction,
  dryRun,
}: SendEmailToolContext) =>
  tool({
    description: "Send an email (requires approval)",
    inputSchema: sendEmailSchema,
    execute: async ({ draftId, to, cc, bcc, subject, content }) => {
      const log = logger.with({ tool: "sendEmail" });
      log.info("Preparing send email request", {
        hasDraftId: Boolean(draftId),
      });

      const action: StructuredAction = {
        type: "send",
        draftId,
        to,
        cc,
        bcc,
        subject,
        content,
      };

      const result = await executeAction(action, {
        emailAccountId,
        provider,
        resourceType,
        triggeredBy: "ai:decision",
        dryRun,
      });

      return {
        result,
      };
    },
  });

export type SendEmailTool = InferUITool<ReturnType<typeof sendEmailTool>>;
