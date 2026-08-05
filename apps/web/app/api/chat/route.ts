import { NextResponse, after } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { withEmailAccount } from "@/utils/middleware";
import { FIRST_TIME_EVENTS, trackFirstTimeEvent } from "@/utils/posthog";
import { getEmailAccountWithAi } from "@/utils/user/get";
import {
  aiProcessAssistantChat,
  ASSISTANT_CHAT_PIPELINE_VERSION,
} from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import { captureException } from "@/utils/error";
import {
  shouldCompact,
  compactMessages,
  extractMemories,
  RECENT_MESSAGES_TO_KEEP,
} from "@/utils/ai/assistant/compact";
import { getInboxStatsForChatContext } from "@/utils/ai/assistant/get-inbox-stats-for-chat-context";
import { formatUtcDate } from "@/utils/date";
import {
  buildUserChatMessageMetadata,
  mapUiMessagesToChatMessageRows,
  type AssistantChatRunMetadata,
} from "@/app/api/chat/chat-message-persistence";
import {
  ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE,
  type AssistantInput,
  assistantInputSchema,
} from "@/utils/actions/assistant-chat.validation";
import { buildInlineEmailActionSystemMessage } from "@/utils/ai/assistant/inline-email-actions";
import {
  mergeSeenRulesRevision,
  saveLastSeenRulesRevision,
} from "@/utils/ai/assistant/chat-seen-rules-revision";
import { getToolFailureWarning } from "@/utils/ai/assistant/chat-response-guard";
import { flushLoggerSafely } from "@/utils/logger-flush";

export const maxDuration = 300;

export const POST = withEmailAccount("chat", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const inboxStatsPromise = getInboxStatsForChatContext({
    emailAccountId,
    provider: user.account.provider,
    logger: request.logger,
  });

  const json = await request.json();
  const { data, error } = assistantInputSchema.safeParse(json);

  if (error) {
    const requestMetadata = getInvalidChatRequestMetadata(json);
    const messageTooLong = error.issues.some(
      (issue) =>
        issue.code === "too_big" &&
        issue.path.length === 4 &&
        issue.path[0] === "message" &&
        issue.path[1] === "parts" &&
        typeof issue.path[2] === "number" &&
        issue.path[3] === "text",
    );

    request.logger.warn("Assistant chat request rejected", {
      ...requestMetadata,
      failureCategory: messageTooLong ? "message_too_long" : "validation_error",
      statusCode: 400,
      validationIssueCodes: [
        ...new Set(error.issues.map((issue) => issue.code)),
      ],
    });
    await flushLoggerSafely(request.logger, {
      action: "assistant-chat",
      flushReason: "chat-validation-error",
    });

    return NextResponse.json(
      {
        error: messageTooLong
          ? ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE
          : "Invalid chat message.",
      },
      { status: 400 },
    );
  }

  const chat =
    (await getChatWithCompactions(data.id)) ||
    (await createNewChat({
      emailAccountId,
      chatId: data.id,
      logger: request.logger,
    }));

  if (!chat) {
    return NextResponse.json(
      { error: "Failed to get or create chat" },
      { status: 500 },
    );
  }

  if (chat.emailAccountId !== emailAccountId) {
    return NextResponse.json(
      { error: "You are not authorized to access this chat" },
      { status: 403 },
    );
  }

  if (chat.deletedAt) {
    return NextResponse.json(
      { error: "This chat has been deleted." },
      { status: 410 },
    );
  }

  const chatHasHistory =
    chat.messages.length > 0 || chat.compactions.length > 0;
  const { message, context, inlineActions } = data;
  const chatRunId = crypto.randomUUID();
  const runLogger = request.logger.with({ chatId: chat.id, chatRunId });

  const hiddenInlineActionMessage =
    buildHiddenInlineActionMessage(inlineActions);

  await saveChatMessage({
    chat: { connect: { id: chat.id } },
    id: message.id,
    role: "user",
    parts: message.parts,
    metadata: buildUserChatMessageMetadata({
      runId: chatRunId,
      context,
      inlineActions,
    }),
  });

  after(() =>
    trackFirstTimeEvent({
      emailAccountId,
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
    }),
  );

  const latestCompaction = chat.compactions[0];

  const messagesForModel = latestCompaction
    ? chat.messages.filter(
        (m) => m.createdAt >= latestCompaction.compactedBeforeCreatedAt,
      )
    : chat.messages;

  const conversationUiMessages = [
    ...convertToUIMessages({ ...chat, messages: messagesForModel }),
    message,
  ];

  const uiMessages = [
    ...conversationUiMessages,
    ...(hiddenInlineActionMessage ? [hiddenInlineActionMessage] : []),
  ];

  const conversationModelMessages = await convertToModelMessages(
    conversationUiMessages,
  );

  let modelMessages = hiddenInlineActionMessage
    ? await convertToModelMessages(uiMessages)
    : conversationModelMessages;

  if (latestCompaction) {
    modelMessages = [
      {
        role: "system" as const,
        content: `Summary of earlier conversation:\n${latestCompaction.summary}`,
      },
      ...modelMessages,
    ];
  }

  if (shouldCompact(modelMessages)) {
    try {
      const { compactedMessages, summary, compactedCount } =
        await compactMessages({
          messages: modelMessages,
          user,
          logger: request.logger,
        });

      if (compactedCount > 0 && summary.trim().length > 0) {
        modelMessages = compactedMessages;

        // Compute boundary: keep at least RECENT_MESSAGES_TO_KEEP DB messages.
        // messagesForModel doesn't include the new user message (saved after query),
        // so we keep RECENT_MESSAGES_TO_KEEP from the existing set.
        const keepFromIndex = Math.max(
          0,
          messagesForModel.length - RECENT_MESSAGES_TO_KEEP,
        );
        const compactedBeforeCreatedAt =
          messagesForModel[keepFromIndex]?.createdAt ?? new Date();

        const [, memories] = await Promise.all([
          prisma.$transaction([
            prisma.chatCompaction.create({
              data: {
                chatId: chat.id,
                summary,
                messageCount: compactedCount,
                compactedBeforeCreatedAt,
              },
            }),
            prisma.chat.update({
              where: { id: chat.id },
              data: { compactionCount: { increment: 1 } },
            }),
          ]),
          extractMemories({
            messages: conversationModelMessages,
            user,
          }).catch((err) => {
            request.logger.error("Failed to extract memories", {
              error: err,
            });
            return [];
          }),
        ]);

        if (memories.length > 0) {
          await prisma.chatMemory.createMany({
            data: memories.map((m) => ({
              content: m.content,
              chatId: chat.id,
              emailAccountId,
            })),
            skipDuplicates: true,
          });
        }
      }
    } catch (compactionError) {
      request.logger.error(
        "Chat compaction failed, continuing with full history",
        {
          error: compactionError,
        },
      );
    }
  }

  let memories: { content: string; date: string }[] = [];
  try {
    const recentMemories = await prisma.chatMemory.findMany({
      where: { emailAccountId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { content: true, createdAt: true },
    });
    memories = recentMemories.map((m) => ({
      content: m.content,
      date: formatUtcDate(m.createdAt),
    }));
  } catch (error) {
    request.logger.warn("Failed to load memories for chat", { error });
  }

  try {
    const inboxStats = await inboxStatsPromise;
    let seenRulesRevision: number | null = null;
    const assistantRun: AssistantChatRunMetadata = {
      runId: chatRunId,
      provider: null,
      modelName: null,
      pipelineVersion: ASSISTANT_CHAT_PIPELINE_VERSION,
      deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
      finishReason: null,
      stepCount: 0,
      toolCallCount: 0,
      visibleTextProduced: false,
    };
    const result = await aiProcessAssistantChat({
      messages: modelMessages,
      conversationMessagesForMemory: conversationModelMessages,
      emailAccountId,
      user,
      context,
      chatId: chat.id,
      chatLastSeenRulesRevision: chat.lastSeenRulesRevision,
      chatHasHistory,
      memories,
      inboxStats,
      onRulesStateExposed: (rulesRevision) => {
        seenRulesRevision = mergeSeenRulesRevision(
          seenRulesRevision,
          rulesRevision,
        );
      },
      onModelResolved: (resolvedModel) => {
        assistantRun.provider = resolvedModel.provider;
        assistantRun.modelName = resolvedModel.modelName ?? null;
      },
      onStepFinish: (step) => {
        assistantRun.stepCount += 1;
        assistantRun.toolCallCount += step.toolCalls.length;
      },
      onFinish: (result) => {
        assistantRun.finishReason = result.finishReason;
      },
      logger: runLogger,
    });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        let responseMessage: UIMessage | null = null;

        for await (const chunk of result.toUIMessageStream({
          sendFinish: false,
          onFinish: ({ responseMessage: finishedResponseMessage }) => {
            responseMessage = finishedResponseMessage;
          },
        })) {
          writer.write(chunk);
        }

        const warning = getToolFailureWarning(responseMessage);
        if (!warning) return;

        runLogger.warn("Assistant chat completed with tool failures");

        const warningPartId = crypto.randomUUID();
        writer.write({ type: "text-start", id: warningPartId });
        writer.write({
          type: "text-delta",
          id: warningPartId,
          delta: `\n\n${warning}`,
        });
        writer.write({ type: "text-end", id: warningPartId });
      },
      onFinish: async ({ messages }) => {
        assistantRun.visibleTextProduced = hasVisibleAssistantText(messages);
        const persistableMessages = messages.filter(
          isPersistableAssistantMessage,
        );

        if (persistableMessages.length < messages.length) {
          runLogger.error("Skipping empty assistant chat messages", {
            skippedCount: messages.length - persistableMessages.length,
          });
        }

        let insertedMessageCount = 0;
        if (persistableMessages.length > 0) {
          const result = await saveChatMessages(
            persistableMessages,
            chat.id,
            runLogger,
            assistantRun,
          );
          insertedMessageCount = result.count;
        }

        if (seenRulesRevision != null) {
          await saveLastSeenRulesRevision({
            chatId: chat.id,
            rulesRevision: seenRulesRevision,
            logger: runLogger,
          });
        }

        runLogger.info("Assistant chat run completed", {
          provider: assistantRun.provider,
          modelName: assistantRun.modelName,
          pipelineVersion: assistantRun.pipelineVersion,
          deploymentCommit: assistantRun.deploymentCommit,
          finishReason: assistantRun.finishReason,
          stepCount: assistantRun.stepCount,
          toolCallCount: assistantRun.toolCallCount,
          visibleTextProduced: assistantRun.visibleTextProduced,
          assistantMessageCount: messages.filter(
            (message) => message.role === "assistant",
          ).length,
          insertedMessageCount,
        });

        await flushLoggerSafely(runLogger, {
          action: "assistant-chat",
          flushReason: "chat-stream-finish",
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    runLogger.error("Error in assistant chat", { error });
    await flushLoggerSafely(runLogger, {
      action: "assistant-chat",
      flushReason: "chat-error",
    });
    return NextResponse.json(
      { error: "Error in assistant chat" },
      { status: 500 },
    );
  }
});

async function createNewChat({
  emailAccountId,
  chatId,
  logger,
}: {
  emailAccountId: string;
  chatId: string;
  logger: Logger;
}) {
  try {
    const newChat = await prisma.chat.create({
      data: { emailAccountId, id: chatId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        compactions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    logger.info("New chat created", { chatId: newChat.id, emailAccountId });
    return newChat;
  } catch (error) {
    logger.error("Failed to create new chat", { error, emailAccountId });
    return;
  }
}

async function getChatWithCompactions(chatId: string) {
  return prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      compactions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

async function saveChatMessage(message: Prisma.ChatMessageCreateInput) {
  return prisma.chatMessage.create({ data: message });
}

async function saveChatMessages(
  messages: UIMessage[],
  chatId: string,
  logger: Logger,
  assistantRun: AssistantChatRunMetadata,
) {
  try {
    const rows = mapUiMessagesToChatMessageRows(messages, chatId, {
      assistantRun,
    });
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant",
    );

    logger.info("Persisting chat messages", {
      chatId,
      messageCount: messages.length,
      assistantMessageIds: assistantMessages.map((message) => message.id),
      assistantToolCallIds: assistantMessages.flatMap((message) =>
        getToolCallIdsFromUiParts(message.parts),
      ),
    });

    const result = await prisma.chatMessage.createMany({
      data: rows,
      skipDuplicates: true,
    });

    logger.info("Persisted chat messages", {
      chatId,
      insertedCount: result.count,
    });

    return result;
  } catch (error) {
    logger.error("Failed to save chat messages", { error, chatId });
    captureException(error, { extra: { chatId } });
    throw error;
  }
}

function buildHiddenInlineActionMessage(
  inlineActions?: AssistantInput["inlineActions"],
) {
  const text = buildInlineEmailActionSystemMessage(inlineActions);
  if (!text) return null;

  return {
    id: crypto.randomUUID(),
    role: "system" as const,
    parts: [{ type: "text" as const, text }],
  } satisfies UIMessage;
}

function isPersistableAssistantMessage(message: UIMessage) {
  if (message.role !== "assistant") return true;

  return hasRenderableAssistantResponse(message);
}

function hasRenderableAssistantResponse(
  message: Pick<UIMessage, "parts"> | null | undefined,
) {
  const parts = message?.parts;
  if (!parts?.length) return false;

  return parts.some((part) => {
    if (part.type !== "text") return true;
    return part.text.trim().length > 0;
  });
}

function hasVisibleAssistantText(messages: UIMessage[]) {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) => part.type === "text" && part.text.trim().length > 0,
      ),
  );
}

function getToolCallIdsFromUiParts(parts: UIMessage["parts"] | undefined) {
  return (
    parts?.flatMap((part) => ("toolCallId" in part ? [part.toolCallId] : [])) ||
    []
  );
}

function getInvalidChatRequestMetadata(value: unknown) {
  if (!value || typeof value !== "object") {
    return { attachmentCount: 0, textLength: 0 };
  }

  const message = (value as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    return { attachmentCount: 0, textLength: 0 };
  }

  const parts = (message as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) {
    return { attachmentCount: 0, textLength: 0 };
  }

  return parts.reduce(
    (metadata, part) => {
      if (!part || typeof part !== "object") return metadata;

      const candidate = part as Record<string, unknown>;
      if (candidate.type === "text" && typeof candidate.text === "string") {
        metadata.textLength += candidate.text.length;
      } else if (candidate.type === "file") {
        metadata.attachmentCount += 1;
      }

      return metadata;
    },
    { attachmentCount: 0, textLength: 0 },
  );
}
