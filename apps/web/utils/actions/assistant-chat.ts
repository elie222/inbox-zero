"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  confirmAssistantCreateRuleBody,
  confirmAssistantDeleteMemoryBody,
  confirmAssistantEmailActionBody,
  confirmAssistantSaveMemoryBody,
} from "./assistant-chat.validation";
import {
  confirmAssistantCreateRuleForAccount,
  confirmAssistantDeleteMemoryForAccount,
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

export const confirmAssistantDeleteMemory = actionClient
  .metadata({ name: "confirmAssistantDeleteMemory" })
  .inputSchema(confirmAssistantDeleteMemoryBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { chatId, chatMessageId, toolCallId },
    }) =>
      confirmAssistantDeleteMemoryForAccount({
        chatId,
        chatMessageId,
        toolCallId,
        waitForPersistence: true,
        emailAccountId,
        logger,
      }),
  );
