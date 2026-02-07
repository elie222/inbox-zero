"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  agentApprovalBody,
  toggleAllowedActionBody,
  createSkillBody,
  updateSkillBody,
  deleteSkillBody,
  addAllowedActionOptionBody,
  removeAllowedActionOptionBody,
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

export const createSkillAction = actionClient
  .metadata({ name: "createSkill" })
  .inputSchema(createSkillBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { name, description, content },
    }) => {
      return prisma.skill.create({
        data: {
          emailAccountId,
          name,
          description,
          content,
        },
      });
    },
  );

export const updateSkillAction = actionClient
  .metadata({ name: "updateSkill" })
  .inputSchema(updateSkillBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { skillId, name, description, content, enabled },
    }) => {
      const contentChanged =
        name !== undefined ||
        description !== undefined ||
        content !== undefined;

      return prisma.skill.update({
        where: { id: skillId, emailAccountId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(content !== undefined && { content }),
          ...(enabled !== undefined && { enabled }),
          ...(contentChanged && { version: { increment: 1 } }),
        },
      });
    },
  );

export const deleteSkillAction = actionClient
  .metadata({ name: "deleteSkill" })
  .inputSchema(deleteSkillBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { skillId } }) => {
    return prisma.skill.delete({
      where: { id: skillId, emailAccountId },
    });
  });

export const addAllowedActionOptionAction = actionClient
  .metadata({ name: "addAllowedActionOption" })
  .inputSchema(addAllowedActionOptionBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { actionType, provider, kind, externalId, name },
    }) => {
      const where = {
        emailAccountId,
        actionType,
        provider,
        kind,
        ...(externalId ? { externalId } : { name }),
      };

      const existing = await prisma.allowedActionOption.findFirst({
        where,
        select: { id: true },
      });

      if (existing) return existing;

      return prisma.allowedActionOption.create({
        data: {
          emailAccountId,
          actionType,
          provider,
          kind,
          externalId,
          name,
        },
      });
    },
  );

export const removeAllowedActionOptionAction = actionClient
  .metadata({ name: "removeAllowedActionOption" })
  .inputSchema(removeAllowedActionOptionBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { optionId } }) => {
    return prisma.allowedActionOption.delete({
      where: { id: optionId, emailAccountId },
    });
  });
