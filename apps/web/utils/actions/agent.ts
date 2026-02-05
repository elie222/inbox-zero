"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  agentApprovalBody,
  toggleAllowedActionBody,
} from "@/utils/actions/agent.validation";
import {
  approveAgentAction as approveAgentExecution,
  denyAgentAction as denyAgentExecution,
} from "@/utils/ai/agent/execution";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export const approveAgentAction = actionClient
  .metadata({ name: "approveAgentAction" })
  .inputSchema(agentApprovalBody)
  .action(async ({ ctx: { userId, logger }, parsedInput: { approvalId } }) => {
    const result = await approveAgentExecution({
      approvalId,
      userId,
      logger,
    });

    if (result.error) {
      throw new SafeError(result.error);
    }

    return result;
  });

export const denyAgentAction = actionClient
  .metadata({ name: "denyAgentAction" })
  .inputSchema(agentApprovalBody)
  .action(async ({ ctx: { userId }, parsedInput: { approvalId } }) => {
    const result = await denyAgentExecution({ approvalId, userId });

    if (result.error) {
      throw new SafeError(result.error);
    }

    return result;
  });

export const toggleAllowedActionAction = actionClient
  .metadata({ name: "toggleAllowedAction" })
  .inputSchema(toggleAllowedActionBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { actionType, enabled },
    }) => {
      await prisma.allowedAction.upsert({
        where: {
          emailAccountId_resourceType_actionType: {
            emailAccountId,
            resourceType: "email",
            actionType,
          },
        },
        update: { enabled },
        create: {
          emailAccountId,
          actionType,
          resourceType: "email",
          enabled,
        },
      });
    },
  );
