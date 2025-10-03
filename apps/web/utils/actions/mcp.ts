"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectMcpConnectionBody,
  toggleMcpConnectionBody,
  toggleMcpToolBody,
} from "@/utils/actions/mcp.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import { getEmailAccountWithAi } from "@/utils/user/get";
import type { EmailForLLM } from "@/utils/types";
import { testMcpSchema } from "@/utils/actions/mcp.validation";

export const disconnectMcpConnectionAction = actionClient
  .metadata({ name: "disconnectMcpConnection" })
  .schema(disconnectMcpConnectionBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      await prisma.mcpConnection.delete({
        where: { id: connectionId, emailAccountId },
      });
    },
  );

export const toggleMcpConnectionAction = actionClient
  .metadata({ name: "toggleMcpConnection" })
  .schema(toggleMcpConnectionBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { connectionId, isActive },
    }) => {
      await prisma.mcpConnection.update({
        where: { id: connectionId, emailAccountId },
        data: { isActive },
      });
    },
  );

export const toggleMcpToolAction = actionClient
  .metadata({ name: "toggleMcpTool" })
  .schema(toggleMcpToolBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { toolId, isEnabled } }) => {
      await prisma.mcpTool.update({
        where: { id: toolId, connection: { emailAccountId } },
        data: { isEnabled },
      });
    },
  );

export const testMcpAction = actionClient
  .metadata({ name: "mcpAgent" })
  .schema(testMcpSchema)
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
