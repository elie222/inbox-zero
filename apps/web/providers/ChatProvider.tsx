"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { parseAsString, useQueryState } from "nuqs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";
import { captureException } from "@/utils/error";
import { toastError } from "@/components/Toast";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { MessageContext } from "@/utils/ai/assistant/chat-context-validation";
import { InlineEmailActionProvider } from "@/components/assistant-chat/inline-email-action-context";
import {
  mergeInlineEmailActions,
  type InlineEmailAction,
  type InlineEmailActionType,
} from "@/utils/ai/assistant/inline-email-actions";
import {
  ASSISTANT_CHAT_MAX_TEXT_LENGTH,
  ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE,
} from "@/utils/actions/assistant-chat.validation";
import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("assistant-chat");

export type Attachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
};

export type Chat = ReturnType<typeof useAiChat<ChatMessage>>;

type ChatMessagePart =
  | { type: "file"; url: string; filename: string; mediaType: string }
  | { type: "text"; text: string };

type PendingChatRequest = {
  attachmentCount: number;
  chatId: string;
  textLength: number;
};

type ChatContextType = {
  chat: Chat;
  input: string;
  chatId: string | null;
  persistedMessageIds: Set<string>;
  setInput: (input: string) => void;
  setChatId: (chatId: string | null) => void;
  setNewChat: () => void;
  submitTextMessage: (text: string) => Promise<void>;
  handleSubmit: () => void;
  stop: () => Promise<void>;
  context: MessageContext | null;
  setContext: (context: MessageContext | null) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { emailAccountId } = useAccount();
  const { mutate } = useSWRConfig();

  const [input, setInput] = useState<string>("");
  const [chatId, setChatId] = useQueryState("chatId", parseAsString);
  const [context, setContext] = useState<MessageContext | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [inlineActions, setInlineActions] = useState<InlineEmailAction[]>([]);
  const inlineActionsRef = useRef(inlineActions);
  const pendingInlineActionsRef = useRef<InlineEmailAction[] | null>(null);
  const pendingRequestRef = useRef<PendingChatRequest | null>(null);
  const pendingRequestContextRef = useRef<MessageContext | null>(null);
  const previousChatIdRef = useRef(chatId);
  const previousEmailAccountIdRef = useRef<string | null>(null);
  // After an explicit stop, don't reattach until the user sends again.
  const stoppedRef = useRef(false);
  // A send failed or dropped mid-reply; the run may still be going server-side.
  const interruptedRef = useRef(false);
  const resumingRef = useRef(false);
  const resumedStreamIdRef = useRef<string | null>(null);
  const messagesAtHideRef = useRef<unknown>(null);

  const { data } = useChatMessages(chatId);
  const persistedMessageIds = useMemo(
    () => new Set(data?.messages.map((message) => message.id) ?? []),
    [data?.messages],
  );

  const setNewChat = useCallback(() => {
    setChatId(generateUUID());
  }, [setChatId]);

  const queueInlineAction = useCallback(
    (type: InlineEmailActionType, threadIds: string[]) => {
      setInlineActions((current) =>
        mergeInlineEmailActions(current, { type, threadIds }),
      );
    },
    [],
  );

  const chat = useAiChat<ChatMessage>({
    id: chatId ?? undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: {
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            supportsInlineEmailCards: true,
            inlineActions: pendingInlineActionsRef.current ?? undefined,
            ...body,
          },
        };
      },
    }),
    // messages: initialMessages, // NOTE: couldn't get this to work
    experimental_throttle: 100,
    generateId: generateUUID,
    onFinish: async ({ isAbort }) => {
      pendingInlineActionsRef.current = null;
      pendingRequestRef.current = null;
      pendingRequestContextRef.current = null;
      // An abort is a stop or a reattach, which refetch once the server has
      // saved the reply; refetching now would drop the partial one shown.
      await Promise.all([
        mutate("/api/user/rules"),
        chatId && !isAbort ? mutate(`/api/chats/${chatId}`) : Promise.resolve(),
      ]);
    },
    onError: (error) => {
      if (resumingRef.current) {
        interruptedRef.current = true;
        logger.warn("Assistant chat resume failed", {
          chatId: chatId ?? chat.id,
          errorName: error.name,
        });
        return;
      }

      interruptedRef.current = true;
      if (document.visibilityState === "visible") resumeActiveRun();

      // The server already has the message once the reply starts streaming,
      // so a dropped connection is reattached rather than reported as unsent.
      if (chat.status === "streaming") {
        pendingInlineActionsRef.current = null;
        pendingRequestRef.current = null;
        pendingRequestContextRef.current = null;
        logger.warn("Assistant chat stream interrupted", {
          chatId: chatId ?? chat.id,
          errorName: error.name,
        });
        return;
      }

      const pendingRequest = pendingRequestRef.current;
      const pendingInlineActions = pendingInlineActionsRef.current;
      const pendingContext = pendingRequestContextRef.current;
      if (pendingContext) {
        setContext((current) => current ?? pendingContext);
      }
      if (pendingInlineActions?.length) {
        setInlineActions((current) =>
          pendingInlineActions.reduce(
            (merged, action) => mergeInlineEmailActions(merged, action),
            current,
          ),
        );
        pendingInlineActionsRef.current = null;
      }

      reportChatRequestError({
        emailAccountId,
        error,
        fallbackChatId: chatId ?? chat.id,
        request: pendingRequest,
      });
      pendingRequestRef.current = null;
      pendingRequestContextRef.current = null;
    },
  });

  const isRunActive =
    chat.status === "submitted" || chat.status === "streaming";
  const handledDataRef = useRef<{ chatId: string; data: typeof data } | null>(
    null,
  );

  useEffect(() => {
    const handled = handledDataRef.current;
    if (handled?.chatId === chat.id && handled.data === data) return;
    handledDataRef.current = { chatId: chat.id, data };
    // The reply is saved only when the run ends, so data fetched mid-run (e.g.
    // on window focus) is behind the local messages. onFinish refetches once
    // the run ends, which brings in the saved reply.
    if (isRunActive) return;
    chat.setMessages(data ? convertToUIMessages(data) : []);
  }, [chat.id, chat.setMessages, data, isRunActive]);

  const resumeActiveRun = useCallback(async () => {
    if (!chatId || stoppedRef.current || resumingRef.current) return;

    resumingRef.current = true;
    interruptedRef.current = false;
    try {
      // Drop a stalled request first so two streams never write the reply.
      await chat.stop();
      await chat.resumeStream();
    } finally {
      resumingRef.current = false;
    }
    await mutate(`/api/chats/${chatId}`);
  }, [chat.resumeStream, chat.stop, chatId, mutate]);

  // Reattach to a reply still running for this chat, e.g. after a reload or
  // when opening the chat mid-run, once its saved messages are shown.
  const activeStreamId = data?.activeStreamId ?? null;
  useEffect(() => {
    if (!activeStreamId || resumedStreamIdRef.current === activeStreamId)
      return;
    if (chat.status === "submitted" || chat.status === "streaming") return;
    if (chat.messages.at(-1)?.id === activeStreamId) return;

    resumedStreamIdRef.current = activeStreamId;
    resumeActiveRun();
  }, [activeStreamId, chat.messages, chat.status, resumeActiveRun]);

  // Mobile browsers drop the connection of a backgrounded tab while the reply
  // keeps running, so reattach when the tab comes back.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        messagesAtHideRef.current = chat.messages;
        return;
      }

      const stalled =
        chat.status === "streaming" &&
        chat.messages === messagesAtHideRef.current;
      if (interruptedRef.current || stalled) resumeActiveRun();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [chat.messages, chat.status, resumeActiveRun]);

  useEffect(() => {
    inlineActionsRef.current = inlineActions;
  }, [inlineActions]);

  useEffect(() => {
    if (previousChatIdRef.current === chatId) return;

    previousChatIdRef.current = chatId;
    stoppedRef.current = false;
    interruptedRef.current = false;
    if (pendingRequestRef.current?.chatId === chatId) return;

    pendingInlineActionsRef.current = null;
    pendingRequestRef.current = null;
    pendingRequestContextRef.current = null;
    setInlineActions([]);
  }, [chatId]);

  useEffect(() => {
    if (!emailAccountId) return;

    if (previousEmailAccountIdRef.current === null) {
      previousEmailAccountIdRef.current = emailAccountId;
      return;
    }

    if (previousEmailAccountIdRef.current === emailAccountId) return;

    previousEmailAccountIdRef.current = emailAccountId;
    pendingInlineActionsRef.current = null;
    pendingRequestRef.current = null;
    pendingRequestContextRef.current = null;
    setChatId(null);
    chat.setMessages([]);
    setInput("");
    setContext(null);
    setAttachments([]);
    setInlineActions([]);
  }, [chat.setMessages, emailAccountId, setChatId]);

  const sendMessageParts = useCallback(
    (parts: ChatMessagePart[]) => {
      const textLength = getChatTextLength(parts);
      const attachmentCount = parts.filter(
        (part) => part.type === "file",
      ).length;

      if (textLength > ASSISTANT_CHAT_MAX_TEXT_LENGTH) {
        logger.warn("Assistant chat input rejected", {
          attachmentCount,
          chatId: chatId ?? chat.id,
          emailAccountId,
          failureCategory: "message_too_long",
          maxTextLength: ASSISTANT_CHAT_MAX_TEXT_LENGTH,
          statusCode: null,
          textLength,
        });
        logger.flush().catch(() => undefined);
        toastError({ description: ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE });
        throw new ChatInputValidationError();
      }

      if (!chatId) setChatId(chat.id);
      stoppedRef.current = false;
      interruptedRef.current = false;

      const requestChatId = chatId ?? chat.id;
      const requestContext = context;
      pendingRequestRef.current = {
        attachmentCount,
        chatId: requestChatId,
        textLength,
      };
      pendingRequestContextRef.current = requestContext;
      pendingInlineActionsRef.current = inlineActionsRef.current.length
        ? inlineActionsRef.current
        : null;

      if (pendingInlineActionsRef.current) {
        setInlineActions([]);
      }

      const sendPromise = chat.sendMessage(
        { role: "user", parts },
        requestContext ? { body: { context: requestContext } } : undefined,
      );
      if (requestContext) {
        setContext((current) => (current === requestContext ? null : current));
      }

      return sendPromise;
    },
    [chat.id, chat.sendMessage, chatId, context, emailAccountId, setChatId],
  );

  const submitTextMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;

      await sendMessageParts([{ type: "text", text: trimmedText }]);
      setInput("");
    },
    [sendMessageParts],
  );

  const stop = useCallback(async () => {
    stoppedRef.current = true;
    interruptedRef.current = false;
    if (!chatId) {
      await chat.stop();
      return;
    }

    // The reply's message id is its stream id; sending it keeps a late stop
    // from cancelling a newer reply.
    const lastMessage = chat.messages.at(-1);
    const activeStreamId =
      lastMessage?.role === "assistant" &&
      !persistedMessageIds.has(lastMessage.id)
        ? lastMessage.id
        : undefined;

    const stopRequest = fetch(`/api/chat/${chatId}/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      body: JSON.stringify({ activeStreamId }),
    });
    await chat.stop();

    try {
      const response = await stopRequest;
      if (!response.ok) throw new Error(`Status ${response.status}`);
    } catch (error) {
      logger.warn("Failed to stop assistant chat run", {
        chatId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    await mutate(`/api/chats/${chatId}`);
  }, [
    chat.messages,
    chat.stop,
    chatId,
    emailAccountId,
    mutate,
    persistedMessageIds,
  ]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    const submittedInput = input;
    const submittedAttachments = attachments;

    const fileParts = attachments.map((attachment) => ({
      type: "file" as const,
      url: attachment.url,
      filename: attachment.name,
      mediaType: attachment.contentType,
    }));

    const parts: ChatMessagePart[] = [...fileParts];

    if (text) {
      parts.push({ type: "text", text });
    }

    let sendPromise: Promise<void>;
    try {
      sendPromise = sendMessageParts(parts);
    } catch (error) {
      if (!(error instanceof ChatInputValidationError)) {
        reportChatRequestError({
          emailAccountId,
          error,
          fallbackChatId: chatId ?? chat.id,
          request: pendingRequestRef.current,
        });
      }
      return;
    }

    setAttachments([]);
    setInput("");
    sendPromise.catch(() => {
      setInput((current) =>
        current ? `${submittedInput}\n\n${current}` : submittedInput,
      );
      setAttachments((current) =>
        mergeAttachments(submittedAttachments, current),
      );
    });
  }, [attachments, chat.id, chatId, emailAccountId, input, sendMessageParts]);

  return (
    <ChatContext.Provider
      value={{
        chat,
        chatId,
        input,
        persistedMessageIds,
        setInput,
        setChatId,
        setNewChat,
        submitTextMessage,
        handleSubmit,
        stop,
        context,
        setContext,
        attachments,
        setAttachments,
      }}
    >
      <InlineEmailActionProvider value={{ queueAction: queueInlineAction }}>
        {children}
      </InlineEmailActionProvider>
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

// NOTE: not sure why we don't just use the default from AI SDK
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getChatTextLength(parts: ChatMessagePart[]) {
  return parts.reduce(
    (length, part) => length + (part.type === "text" ? part.text.length : 0),
    0,
  );
}

function mergeAttachments(
  submitted: Attachment[],
  current: Attachment[],
): Attachment[] {
  const currentIds = new Set(current.map((attachment) => attachment.id));
  return [
    ...submitted.filter((attachment) => !currentIds.has(attachment.id)),
    ...current,
  ];
}

class ChatInputValidationError extends Error {
  constructor() {
    super(ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE);
    this.name = "ChatInputValidationError";
  }
}

function reportChatRequestError({
  emailAccountId,
  error,
  fallbackChatId,
  request,
}: {
  emailAccountId: string;
  error: unknown;
  fallbackChatId: string;
  request: PendingChatRequest | null;
}) {
  logger.error("Assistant chat request failed", {
    attachmentCount: request?.attachmentCount ?? 0,
    chatId: request?.chatId ?? fallbackChatId,
    emailAccountId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    failureCategory: "request_error",
    statusCode: getErrorStatusCode(error),
    textLength: request?.textLength ?? 0,
  });
  logger.flush().catch(() => undefined);
  toastError({
    description: "We couldn't send your message. Please try again.",
  });
  console.error(error);
  captureException(error);
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const statusCode = (error as Record<string, unknown>).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}
