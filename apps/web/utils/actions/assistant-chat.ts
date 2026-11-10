"use server";

import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
import {
  cancelBulkInboxActionJobBody,
  confirmAssistantBulkInboxActionBody,
  confirmAssistantCreateRuleBody,
  confirmAssistantEmailActionBody,
  confirmAssistantSaveMemoryBody,
} from "./assistant-chat.validation";
import {
  confirmAssistantBulkInboxActionForAccount,
  confirmAssistantCreateRuleForAccount,
  confirmAssistantEmailActionForAccount,
  confirmAssistantSaveMemoryForAccount,
} from "./assistant-chat-confirmation";

export const confirmAssistantEmailAction = actionClient
  .metadata({ name: "confirmAssistantEmail" })
  .inputSchema(confirmAssistantEmailActionBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: {
        chatId,
        chatMessageId,
        toolCallId,
        actionType,
        contentOverride,
      },
    }) =>
      confirmAssistantEmailActionForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        actionType,
        contentOverride,
        waitForPersistence: true,
        emailAccountId,
        provider,
        logger,
      }),
  );

export const confirmAssistantCreateRule = actionClient
  .metadata({ name: "confirmAssistantCreateRule" })
  .inputSchema(confirmAssistantCreateRuleBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { chatId, chatMessageId, toolCallId },
    }) =>
      confirmAssistantCreateRuleForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        waitForPersistence: true,
        emailAccountId,
        provider,
        logger,
      }),
  );

export const confirmAssistantSaveMemory = actionClient
  .metadata({ name: "confirmAssistantSaveMemory" })
  .inputSchema(confirmAssistantSaveMemoryBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { chatId, chatMessageId, toolCallId },
    }) =>
      confirmAssistantSaveMemoryForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        waitForPersistence: true,
        emailAccountId,
        logger,
      }),
  );

export const confirmAssistantBulkInboxAction = actionClient
  .metadata({ name: "confirmAssistantBulkInboxAction" })
  .inputSchema(confirmAssistantBulkInboxActionBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { chatId, chatMessageId, toolCallId },
    }) =>
      confirmAssistantBulkInboxActionForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        waitForPersistence: true,
        emailAccountId,
        logger,
      }),
  );

export const cancelBulkInboxActionJob = actionClient
  .metadata({ name: "cancelBulkInboxActionJob" })
  .inputSchema(cancelBulkInboxActionJobBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { jobId } }) => {
    await prisma.bulkInboxActionJob.updateMany({
      where: { id: jobId, emailAccountId, status: "RUNNING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  });
