"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";

const mcpAgentSchema = z.object({
  query: z.string().min(1, "Query is required"),
  context: z
    .object({
      emailContent: z.string().optional(),
      senderName: z.string().optional(),
      senderEmail: z.string().optional(),
      subject: z.string().optional(),
    })
    .optional(),
});

export type McpAgentActionInput = z.infer<typeof mcpAgentSchema>;

export const mcpAgentAction = actionClient
  .metadata({ name: "mcpAgent" })
  .schema(mcpAgentSchema)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { query, context } }) => {
      // Get email account with AI configuration
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      // Call the MCP agent
      const result = await mcpAgent({
        query,
        emailAccount,
        context,
      });

      return result;
    },
  );
