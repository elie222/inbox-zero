"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import type { EmailForLLM } from "@/utils/types";

// Schema for testing with mock email data
const mcpAgentSchema = z.object({
  query: z.string().min(1, "Query is required"),
  // For testing, we'll accept mock message data
  mockMessage: z
    .object({
      from: z.string().optional(),
      subject: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
});

export type McpAgentActionInput = z.infer<typeof mcpAgentSchema>;

export const mcpAgentAction = actionClient
  .metadata({ name: "mcpAgent" })
  .schema(mcpAgentSchema)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { query, mockMessage },
    }) => {
      // Get email account with AI configuration
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      // Create mock message for testing
      const testMessage: EmailForLLM = {
        id: "test-message-id",
        from: mockMessage?.from || "john.smith@example.com",
        to: emailAccount.email,
        subject: mockMessage?.subject || "Question about our services",
        content:
          mockMessage?.content ||
          `Hi there,\n\nI'm ${mockMessage?.from ? mockMessage.from.split("@")[0] : "John Smith"} and I have a question about ${query}.\n\nCould you please help me with this?\n\nThanks!`,
      };

      // Call the MCP agent with mock message
      const result = await mcpAgent({
        emailAccount,
        messages: [testMessage],
      });

      return result;
    },
  );
