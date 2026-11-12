import { NextResponse, after } from "next/server";
import {
  consumeStream,
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
import { CHAT_ACCOUNT_MISMATCH_ERROR_CODE } from "@/utils/config";
import type { Prisma } from "@/generated/prisma/client";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import { captureException } from "@/utils/error";
import {
  shouldCompact,
  compactMessages,
  buildCompactionSummaryMessage,
  extractMemories,
} from "@/utils/ai/assistant/compact";
import { toChatActionTotals } from "@/utils/ai/assistant/chat-action-totals";
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
  getLatestStoredMailView,
  getMailViewChange,
  getStoredMailView,
  withMailViewNote,
} from "@/utils/ai/assistant/mail-view-context";
import {
  mergeSeenRulesRevision,
  saveLastSeenRulesRevision,
} from "@/utils/ai/assistant/chat-seen-rules-revision";
import { getToolFailureWarning } from "@/utils/ai/assistant/chat-response-guard";
import { flushLoggerSafely } from "@/utils/logger-flush";
import {
  claimActiveStream,
  clearActiveStream,
  getChatStreamContext,
  startChatRun,
} from "@/utils/chat/active-run";

export const maxDuration = 800;

const RUN_FAILED_NOTICE =
  "Sorry, something went wrong and I couldn't finish my reply. Please try again.";

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
    request.logger.warn("Chat belongs to another email account", {
      chatId: data.id,
    });
    return NextResponse.json(
      {
        error: "This chat belongs to a different email account.",
        errorCode: CHAT_ACCOUNT_MISMATCH_ERROR_CODE,
        isKnownError: true,
      },
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

  // The reply's message id doubles as its stream id, so a client can name the
  // run it wants to stop by the message it is already showing.
  const streamId = crypto.randomUUID();
  const chatRun = await startChatRun(streamId);
  if (!(await claimActiveStream({ chatId: chat.id, streamId }))) {
    chatRun.end();
    return NextResponse.json(
      { error: "A reply is already in progress." },
      { status: 409 },
    );
  }

  try {
    const hiddenInlineActionMessage =
      buildHiddenInlineActionMessage(inlineActions);

    const latestCompaction = chat.compactions[0];

    const messagesForModel = latestCompaction
      ? chat.messages.filter(
          (m) => m.createdAt >= latestCompaction.compactedBeforeCreatedAt,
        )
      : chat.messages;

    // Compared against what the model still sees, so a state compacted out of
    // the history is recorded again.
    const mailViewChange = getMailViewChange({
      previous: getLatestStoredMailView(messagesForModel),
      incoming: data.mailView,
    });

    const savedUserMessage = await saveChatMessage({
      chat: { connect: { id: chat.id } },
      id: message.id,
      role: "user",
      parts: message.parts,
      metadata: buildUserChatMessageMetadata({
        runId: chatRunId,
        context,
        inlineActions,
        mailView: mailViewChange,
      }),
    });

    after(() =>
      trackFirstTimeEvent({
        emailAccountId,
        event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
      }),
    );

    const conversationUiMessages = [
      ...convertToUIMessages({
        ...chat,
        messages: messagesForModel.map((m) =>
          m.role === "user"
            ? withMailViewNote(m, getStoredMailView(m.metadata))
            : m,
        ),
      }),
      withMailViewNote(message, mailViewChange),
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
        buildCompactionSummaryMessage(latestCompaction.summary),
        ...modelMessages,
      ];
    }

    if (shouldCompact(modelMessages)) {
      try {
        const {
          compactedMessages,
          summary,
          compactedCount,
          recentUserMessageCount,
        } = await compactMessages({
          messages: modelMessages,
          actionTotals: toChatActionTotals(chat.actionTotals),
          user,
          logger: request.logger,
        });

        if (compactedCount > 0 && summary.trim().length > 0) {
          modelMessages = compactedMessages;

          // The new message and the hidden inline-action message are kept
          // but not among the stored messages loaded for this run.
          const compactedBeforeCreatedAt = getCompactionBoundary({
            storedMessages: messagesForModel,
            keptStoredUserMessageCount:
              recentUserMessageCount - 1 - (hiddenInlineActionMessage ? 1 : 0),
            newMessageCreatedAt: savedUserMessage.createdAt,
          });

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
      supportsInlineEmailCards: data.supportsInlineEmailCards,
      mailScreen: data.mailView !== undefined,
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
      onStepEnd: (step) => {
        assistantRun.stepCount += 1;
        assistantRun.toolCallCount += step.toolCalls.length;
      },
      onEnd: (result) => {
        assistantRun.finishReason = result.finishReason;
      },
      abortSignal: chatRun.abortSignal,
      logger: runLogger,
    });

    const handleRunError = (error: unknown) => {
      runLogger.error("Assistant chat run failed", { error });
      captureException(error, { extra: { chatId: chat.id } });
      return RUN_FAILED_NOTICE;
    };

    const stream = createUIMessageStream({
      generateId: () => streamId,
      onError: handleRunError,
      execute: async ({ writer }) => {
        let responseMessage: UIMessage | null = null;
        let runFailed = false;

        for await (const chunk of result.toUIMessageStream({
          sendFinish: false,
          onError: handleRunError,
          onEnd: ({ responseMessage: finishedResponseMessage }) => {
            responseMessage = finishedResponseMessage;
          },
        })) {
          // The client treats an error chunk as an unsent message, but the
          // user message is already saved, so the failure is shown as a reply.
          if (chunk.type === "error") {
            runFailed = true;
            continue;
          }
          writer.write(chunk);
        }

        assistantRun.visibleTextProduced = hasVisibleAssistantText(
          responseMessage ? [responseMessage] : [],
        );

        if (chatRun.abortSignal.aborted) return;

        const notice =
          runFailed || !hasAssistantReply(responseMessage)
            ? RUN_FAILED_NOTICE
            : getToolFailureWarning(responseMessage);
        if (!notice) return;

        if (notice === RUN_FAILED_NOTICE) {
          runLogger.warn("Assistant chat run ended without a reply", {
            runFailed,
          });
        } else {
          runLogger.warn("Assistant chat completed with tool failures");
        }

        const noticePartId = crypto.randomUUID();
        writer.write({ type: "text-start", id: noticePartId });
        writer.write({
          type: "text-delta",
          id: noticePartId,
          delta: `\n\n${notice}`,
        });
        writer.write({ type: "text-end", id: noticePartId });
      },
      onEnd: async ({ messages: endMessages, isAborted }) => {
        try {
          // A stopped reply is saved as it stood, minus tool calls that never
          // got a result, which would otherwise show as running forever.
          const messages = isAborted
            ? endMessages.map(removeIncompleteToolParts)
            : endMessages;
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
            stopped: isAborted,
            assistantMessageCount: messages.filter(
              (message) => message.role === "assistant",
            ).length,
            insertedMessageCount,
          });
        } finally {
          chatRun.end();
          await clearActiveStream({ chatId: chat.id, streamId });
        }

        await flushLoggerSafely(runLogger, {
          action: "assistant-chat",
          flushReason: "chat-stream-finish",
        });
      },
    });

    const streamContext = getChatStreamContext();
    return createUIMessageStreamResponse({
      stream,
      // The run keeps going if the client disconnects, so its reply is still
      // saved; with Redis the stream is also kept for the client to resume.
      consumeSseStream: ({ stream: sseStream }) => {
        if (!streamContext) {
          consumeStream({ stream: sseStream });
          return;
        }
        streamContext
          .createNewResumableStream(streamId, () => sseStream)
          .catch((error) => {
            runLogger.error("Failed to create resumable chat stream", {
              error,
            });
            consumeStream({ stream: sseStream });
          });
      },
    });
  } catch (error) {
    chatRun.end();
    await clearActiveStream({ chatId: chat.id, streamId });
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
        actionTotals: { select: { action: true, count: true } },
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
      actionTotals: { select: { action: true, count: true } },
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
    role: "user" as const,
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
    if (part.type === "step-start") return false;
    if (part.type !== "text") return true;
    return part.text.trim().length > 0;
  });
}

// Reasoning alone is not an answer; tool results show as cards.
function hasAssistantReply(message: UIMessage | null) {
  return !!message?.parts.some(
    (part) =>
      (part.type === "text" && part.text.trim().length > 0) ||
      "toolCallId" in part,
  );
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

// The stored message where the kept history starts, so the next run replays
// exactly what the summary left out.
function getCompactionBoundary({
  storedMessages,
  keptStoredUserMessageCount,
  newMessageCreatedAt,
}: {
  storedMessages: { role: string; createdAt: Date }[];
  keptStoredUserMessageCount: number;
  newMessageCreatedAt: Date;
}) {
  if (keptStoredUserMessageCount <= 0) return newMessageCreatedAt;

  let remaining = keptStoredUserMessageCount;
  for (let index = storedMessages.length - 1; index >= 0; index--) {
    if (storedMessages[index].role !== "user") continue;
    remaining--;
    if (remaining === 0) return storedMessages[index].createdAt;
  }
  return storedMessages[0]?.createdAt ?? newMessageCreatedAt;
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

function removeIncompleteToolParts(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.filter(
      (part) =>
        !(
          "toolCallId" in part &&
          (part.state === "input-streaming" || part.state === "input-available")
        ),
    ),
  };
}
