"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import type { EmailForLLM } from "@/utils/types";
import { mcpAgentSchema } from "@/utils/actions/mcp-agent.validation";

export const mcpAgentAction = actionClient
  .metadata({ name: "mcpAgent" })
  .schema(mcpAgentSchema)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { from, subject, content },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("Email account not found");

      const testMessage: EmailForLLM = {
        id: "test-message-id",
        to: emailAccount.email,
        from,
        subject,
        content,
      };

      const result = await mcpAgent({ emailAccount, messages: [testMessage] });

      return {
        response: result?.response,
        toolCalls: result?.getToolCalls(),
      };
    },
  );
