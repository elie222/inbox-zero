"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
import {
  CHAT_ACCOUNT_MISMATCH_ERROR_CODE,
  EMAIL_ACCOUNT_HEADER,
} from "@/utils/config";
import type {
  MailViewContext,
  MessageContext,
} from "@/utils/ai/assistant/chat-context-validation";
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
import {
  type MailScreenAction,
  parseMailScreenAction,
} from "@/utils/ai/assistant/mail-screen-action";

const logger = createClientLogger("assistant-chat");
const SAVE_POLL_MS = 1000;

const CHAT_SEND_FAILED_MESSAGE = msg`We couldn't send your message. Please try again.`;
const CHAT_ACCOUNT_MISMATCH_MESSAGE = msg`That chat belongs to another email account, so we started a new one. Send your message again.`;

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

type QueuedMessage = {
  attachments: Attachment[];
  text: string;
};

type QueuedMessageWaiter = {
  reject: (error: unknown) => void;
  resolve: () => void;
};

type ChatSendError = {
  chatId: string;
  message: string;
  offerNewChat: boolean;
};

type PendingChatRequest = {
  // The server saved the message once it answered OK; a later failure is
  // shown in the reply rather than reported as unsent.
  accepted?: boolean;
  attachmentCount: number;
  chatId: string;
  // Set by onError when the message never reached the server.
  sendError?: Error;
  textLength: number;
};

type ChatContextType = {
  chat: Chat;
  input: string;
  chatId: string | null;
  persistedMessageIds: Set<string>;
  sendError: Omit<ChatSendError, "chatId"> | null;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setChatId: (chatId: string | null) => void;
  setNewChat: () => void;
  submitTextMessage: (text: string) => Promise<void>;
  handleSubmit: () => void;
  queuedMessage: QueuedMessage | null;
  sendQueuedMessageNow: () => Promise<void>;
  unqueueMessage: () => void;
  stop: () => Promise<void>;
  context: MessageContext | null;
  setContext: (context: MessageContext | null) => void;
  setAmbientContext: (context: MessageContext | null) => void;
  setMailView: (mailView: MailViewContext | null) => void;
  setMailScreenActionHandler: (
    handler: ((action: MailScreenAction) => void) | null,
  ) => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();
  const { emailAccountId } = useAccount();
  const { mutate } = useSWRConfig();

  const [input, setInput] = useState<string>("");
  const [chatId, setChatId] = useQueryState("chatId", parseAsString);
  const [context, setContext] = useState<MessageContext | null>(null);
  const [ambientContext, setAmbientContext] = useState<MessageContext | null>(
    null,
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendError, setSendError] = useState<ChatSendError | null>(null);
  // Sent while a reply runs; goes out as soon as the chat is free again.
  const [queuedMessage, setQueuedMessage] = useState<QueuedMessage | null>(
    null,
  );
  const [isStopping, setIsStopping] = useState(false);
  const queuedWaitersRef = useRef<QueuedMessageWaiter[]>([]);
  const queuedAccountIdRef = useRef<string | null>(null);
  // Read when a send fails, after the render that started it.
  const queuedMessageRef = useRef(queuedMessage);
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);
  const previousQueueChatIdRef = useRef(chatId);
  const [inlineActions, setInlineActions] = useState<InlineEmailAction[]>([]);
  const inlineActionsRef = useRef(inlineActions);
  const pendingInlineActionsRef = useRef<InlineEmailAction[] | null>(null);
  // Read at send time only, so screen changes don't re-render the chat.
  const mailViewRef = useRef<MailViewContext | null>(null);
  const mailScreenActionHandlerRef = useRef<
    ((action: MailScreenAction) => void) | null
  >(null);
  // A resumed run replays its tool results; each split is shown only once.
  const shownSplitCallIdsRef = useRef(new Set<string>());
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

  // useChat replaces (and stops) its Chat whenever `id` changes, so a new chat
  // needs its id before the first send adopts it into the URL. Rotate once
  // adopted so clearing chatId later starts a fresh chat.
  const [draftChatId, setDraftChatId] = useState(generateUUID);
  if (chatId === draftChatId) setDraftChatId(generateUUID());

  const {
    data,
    error: chatLoadError,
    mutate: mutateChatMessages,
  } = useChatMessages(chatId);
  const persistedMessageIds = useMemo(
    () => new Set(data?.messages.map((message) => message.id) ?? []),
    [data?.messages],
  );

  const setNewChat = useCallback(() => {
    setChatId(generateUUID());
  }, [setChatId]);

  const showSendError = useCallback((error: ChatSendError) => {
    setSendError(error);
    toastError({ description: error.message });
  }, []);

  const queueInlineAction = useCallback(
    (type: InlineEmailActionType, threadIds: string[]) => {
      setInlineActions((current) =>
        mergeInlineEmailActions(current, { type, threadIds }),
      );
    },
    [],
  );

  const chat = useAiChat<ChatMessage>({
    id: chatId ?? draftChatId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: {
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      fetch: async (input, init) => {
        const request = pendingRequestRef.current;
        const response = await fetch(input, init);
        // Reconnects share this fetch; only the send POST saves the message.
        if (response.ok && request && init?.method === "POST")
          request.accepted = true;
        return response;
      },
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            supportsInlineEmailCards: true,
            inlineActions: pendingInlineActionsRef.current ?? undefined,
            mailView: mailViewRef.current ?? undefined,
            ...body,
          },
        };
      },
    }),
    // messages: initialMessages, // NOTE: couldn't get this to work
    experimental_throttle: 100,
    generateId: generateUUID,
    // Fires only for streamed calls, not for history. A resumed run replays
    // from its first chunk, so its calls are skipped rather than re-applied
    // over whatever the user did on the screen since.
    onToolCall: ({ toolCall }) => {
      if (toolCall.dynamic || toolCall.toolName !== "controlMailScreen") return;
      if (resumingRef.current) return;
      const action = parseMailScreenAction(toolCall.input);
      if ("error" in action) return;
      mailScreenActionHandlerRef.current?.(action);
    },
    onFinish: async ({ message, isAbort }) => {
      pendingInlineActionsRef.current = null;
      pendingRequestRef.current = null;
      pendingRequestContextRef.current = null;
      const splitChange = getSplitInboxChange(message);
      // An abort is a stop or a reattach, which refetch once the server has
      // saved the reply; refetching now would drop the partial one shown.
      await Promise.all([
        mutate("/api/user/rules"),
        splitChange ? mutate("/api/mail/settings") : Promise.resolve(),
        chatId && !isAbort ? mutate(`/api/chats/${chatId}`) : Promise.resolve(),
      ]);
      // Showing the split is the preview: the user sees what it catches and
      // can ask for a change or a delete.
      const shown = splitChange?.shown;
      if (shown && !shownSplitCallIdsRef.current.has(shown.toolCallId)) {
        shownSplitCallIdsRef.current.add(shown.toolCallId);
        mailScreenActionHandlerRef.current?.({
          action: "show_split",
          splitId: shown.splitId,
          emailAccountId,
        });
      }
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

      const isAccountMismatch = isChatAccountMismatchError(error);
      interruptedRef.current = !isAccountMismatch;
      if (document.visibilityState === "visible" && !isAccountMismatch)
        resumeActiveRun();

      // The server already has the message once it accepts the request, so a
      // dropped connection is reattached rather than reported as unsent.
      if (chat.status === "streaming" || pendingRequestRef.current?.accepted) {
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
      if (pendingContext?.type === "fix-rule") {
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

      if (pendingRequest) pendingRequest.sendError = error;
      pendingRequestRef.current = null;
      pendingRequestContextRef.current = null;

      if (isAccountMismatch) {
        logger.warn("Assistant chat belongs to another email account", {
          chatId: pendingRequest?.chatId ?? chatId ?? chat.id,
          emailAccountId,
        });
        // The unsent message goes back in the input, so a fresh chat lets the
        // user send it again instead of failing on every retry.
        const newChatId = generateUUID();
        setChatId(newChatId);
        showSendError({
          chatId: newChatId,
          message: i18n._(CHAT_ACCOUNT_MISMATCH_MESSAGE),
          offerNewChat: false,
        });
        return;
      }

      reportChatRequestError({
        emailAccountId,
        error,
        fallbackChatId: chatId ?? chat.id,
        request: pendingRequest,
      });
      showSendError({
        chatId: pendingRequest?.chatId ?? chatId ?? chat.id,
        message: getChatSendErrorMessage(error, i18n),
        offerNewChat: true,
      });
    },
  });

  const isRunActive =
    chat.status === "submitted" || chat.status === "streaming";

  // The URL can carry a chat from another account (e.g. an old link). Sending
  // to it can never succeed, so start a fresh chat in its place.
  const isLoadedChatFromOtherAccount =
    chatLoadError?.info?.errorCode === CHAT_ACCOUNT_MISMATCH_ERROR_CODE;
  useEffect(() => {
    // A send already in flight fails with the same mismatch and recovers in
    // onError; switching chats now would abort it and drop the unsent message.
    if (!chatId || !isLoadedChatFromOtherAccount || isRunActive) return;
    logger.warn("Assistant chat belongs to another email account", {
      chatId,
      emailAccountId,
    });
    const newChatId = generateUUID();
    setChatId(newChatId);
    // Keep showing why a send that just ended failed.
    setSendError((current) =>
      current?.chatId === chatId ? { ...current, chatId: newChatId } : current,
    );
  }, [
    chatId,
    emailAccountId,
    isLoadedChatFromOtherAccount,
    isRunActive,
    setChatId,
  ]);

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
    setAmbientContext(null);
    setAttachments([]);
    setInlineActions([]);
    rejectQueuedWaiters(takeQueuedWaiters(queuedWaitersRef));
    setQueuedMessage(null);
  }, [chat.setMessages, emailAccountId, setChatId]);

  const setMailView = useCallback((mailView: MailViewContext | null) => {
    mailViewRef.current = mailView;
  }, []);

  const setMailScreenActionHandler = useCallback(
    (handler: ((action: MailScreenAction) => void) | null) => {
      mailScreenActionHandlerRef.current = handler;
    },
    [],
  );

  const setDisplayedContext = useCallback((next: MessageContext | null) => {
    setContext(next);
    if (!next) setAmbientContext(null);
  }, []);

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
        toastError({ description: getMaxTextLengthMessage(i18n) });
        throw new ChatInputValidationError();
      }

      if (!chatId) setChatId(chat.id);
      setSendError(null);
      stoppedRef.current = false;
      interruptedRef.current = false;

      const requestChatId = chatId ?? chat.id;
      const requestContext = context ?? ambientContext;
      const request: PendingChatRequest = {
        attachmentCount,
        chatId: requestChatId,
        textLength,
      };
      pendingRequestRef.current = request;
      pendingRequestContextRef.current = requestContext;
      pendingInlineActionsRef.current = inlineActionsRef.current.length
        ? inlineActionsRef.current
        : null;

      if (pendingInlineActionsRef.current) {
        setInlineActions([]);
      }

      // sendMessage resolves even when the request fails (it reports through
      // onError), so reject here to let callers keep the unsent message.
      // Aborts and drops after streaming began are not send failures.
      const sendPromise = chat
        .sendMessage(
          { role: "user", parts },
          requestContext ? { body: { context: requestContext } } : undefined,
        )
        .then(() => {
          if (request.sendError) throw request.sendError;
        });
      if (requestContext) {
        setContext((current) => (current === requestContext ? null : current));
      }

      return sendPromise;
    },
    [
      chat.id,
      chat.sendMessage,
      chatId,
      context,
      ambientContext,
      emailAccountId,
      i18n,
      setChatId,
    ],
  );

  // A queued message goes first, so a new one joins it until the chat is free.
  // After an error the queue waits for the user, and sending is that signal.
  const shouldQueue =
    isRunActive || isStopping || (!!queuedMessage && chat.status !== "error");

  const queueDraft = useCallback(
    (draft: QueuedMessage) => {
      queuedAccountIdRef.current = emailAccountId;
      setQueuedMessage((current) => mergeQueuedMessages(current, draft));
    },
    [emailAccountId],
  );

  const stopRun = useCallback(async () => {
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

  const stop = useCallback(async () => {
    setIsStopping(true);
    try {
      await stopRun();
    } finally {
      setIsStopping(false);
    }
  }, [stopRun]);

  const restoreDraft = useCallback((draft: QueuedMessage) => {
    setInput((current) =>
      current ? `${draft.text}\n\n${current}` : draft.text,
    );
    setAttachments((current) => mergeAttachments(draft.attachments, current));
  }, []);

  // Returns null when the message could not be sent at all.
  const sendDraft = useCallback(
    (draft: QueuedMessage) => {
      const text = draft.text.trim();
      const parts: ChatMessagePart[] = draft.attachments.map((attachment) => ({
        type: "file" as const,
        url: attachment.url,
        filename: attachment.name,
        mediaType: attachment.contentType,
      }));
      if (text) parts.push({ type: "text", text });

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
          showSendError({
            chatId: chatId ?? chat.id,
            message: i18n._(CHAT_SEND_FAILED_MESSAGE),
            offerNewChat: true,
          });
        }
        return null;
      }

      sendPromise.catch(() => {
        // A message queued behind this one was meant to follow it, so both
        // go back in the input in that order rather than the queue sending
        // ahead of the retry.
        const queued = queuedMessageRef.current;
        if (!queued) {
          restoreDraft(draft);
          return;
        }
        rejectQueuedWaiters(takeQueuedWaiters(queuedWaitersRef));
        setQueuedMessage(null);
        restoreDraft(mergeQueuedMessages(draft, queued));
      });
      return sendPromise;
    },
    [
      chat.id,
      chatId,
      emailAccountId,
      i18n,
      restoreDraft,
      sendMessageParts,
      showSendError,
    ],
  );

  const sendQueuedMessage = useCallback(
    (draft: QueuedMessage) => {
      const waiters = takeQueuedWaiters(queuedWaitersRef);
      setQueuedMessage(null);
      const sendPromise = sendDraft(draft);
      if (!sendPromise) {
        restoreDraft(draft);
        rejectQueuedWaiters(waiters);
        return;
      }
      sendPromise.then(
        () => {
          for (const waiter of waiters) waiter.resolve();
        },
        () => rejectQueuedWaiters(waiters),
      );
    },
    [restoreDraft, sendDraft],
  );

  const handleSubmit = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return;
    const draft = { text: input, attachments };

    if (queuedMessage && !shouldQueue) {
      // Cleared first: if the merged message can't be sent, the queue puts
      // all of it back in the input.
      setAttachments([]);
      setInput("");
      sendQueuedMessage(mergeQueuedMessages(queuedMessage, draft));
      return;
    }
    if (shouldQueue) queueDraft(draft);
    else if (!sendDraft(draft)) return;

    setAttachments([]);
    setInput("");
  }, [
    attachments,
    input,
    queueDraft,
    queuedMessage,
    sendDraft,
    sendQueuedMessage,
    shouldQueue,
  ]);

  const submitTextMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;

      // Callers such as the rule card treat a resolved call as sent, so a
      // queued message settles only once it actually goes out.
      if (shouldQueue || queuedMessage) {
        const draft = { text: trimmedText, attachments: [] };
        await new Promise<void>((resolve, reject) => {
          queuedWaitersRef.current.push({ resolve, reject });
          // After an error the queue waits for the user, and this is them.
          if (shouldQueue || !queuedMessage) queueDraft(draft);
          else sendQueuedMessage(mergeQueuedMessages(queuedMessage, draft));
        });
        return;
      }

      await sendMessageParts([{ type: "text", text: trimmedText }]);
      setInput("");
    },
    [
      queueDraft,
      queuedMessage,
      sendMessageParts,
      sendQueuedMessage,
      shouldQueue,
    ],
  );

  // Takes the queued message back into the input, unsent.
  const unqueueMessage = useCallback(() => {
    if (!queuedMessage) return;
    rejectQueuedWaiters(takeQueuedWaiters(queuedWaitersRef));
    setQueuedMessage(null);
    restoreDraft(queuedMessage);
  }, [queuedMessage, restoreDraft]);

  // The draft input survives a chat switch, so a queued message rejoins it
  // rather than being dropped.
  const unqueueMessageRef = useRef(unqueueMessage);
  useEffect(() => {
    unqueueMessageRef.current = unqueueMessage;
  }, [unqueueMessage]);
  useEffect(() => {
    if (previousQueueChatIdRef.current === chatId) return;
    previousQueueChatIdRef.current = chatId;
    unqueueMessageRef.current();
  }, [chatId]);

  // The server frees the chat only after saving the reply, so a queued message
  // waits until the refetched chat has the reply and no run. After an error it
  // waits for the user, since the failed message may need to go first.
  const lastMessageId = chat.messages.at(-1)?.id;
  const isChatSettled = !isRunActive && !isStopping && chat.status !== "error";
  const isChatFree =
    isChatSettled &&
    !!lastMessageId &&
    persistedMessageIds.has(lastMessageId) &&
    !data?.activeStreamId;

  useEffect(() => {
    if (!queuedMessage || !isChatFree) return;
    // An account switch clears the queue in this same commit; the chat shown
    // as free may still be the previous account's.
    if (queuedAccountIdRef.current !== emailAccountId) return;
    sendQueuedMessage(queuedMessage);
  }, [emailAccountId, isChatFree, queuedMessage, sendQueuedMessage]);

  // A reply that just ended can still be saving; check again until it's done.
  const isWaitingForSave = !!queuedMessage && isChatSettled && !isChatFree;
  useEffect(() => {
    if (!isWaitingForSave) return;
    // Each check waits for the last: SWR drops a response once a newer request
    // starts, so overlapping checks on a slow server would never land.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      await mutateChatMessages().catch(() => undefined);
      if (!cancelled) timer = setTimeout(check, SAVE_POLL_MS);
    };
    timer = setTimeout(check, SAVE_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isWaitingForSave, mutateChatMessages]);

  const sendQueuedMessageNow = useCallback(async () => {
    // Stopping keeps the partial reply, so the queued message steers from
    // where the run left off; the effect above sends it once the run ends.
    if (isRunActive) {
      await stop();
      return;
    }
    // A finished reply still being saved is sent by the effect above. After an
    // error nothing else will send it, so the user's click does.
    if (queuedMessage && chat.status === "error" && !isStopping) {
      sendQueuedMessage(queuedMessage);
    }
  }, [
    chat.status,
    isRunActive,
    isStopping,
    queuedMessage,
    sendQueuedMessage,
    stop,
  ]);

  return (
    <ChatContext.Provider
      value={{
        chat,
        chatId,
        input,
        persistedMessageIds,
        sendError:
          sendError?.chatId === chat.id
            ? {
                message: sendError.message,
                offerNewChat: sendError.offerNewChat,
              }
            : null,
        setInput,
        setChatId,
        setNewChat,
        submitTextMessage,
        handleSubmit,
        queuedMessage,
        sendQueuedMessageNow,
        unqueueMessage,
        stop,
        context: context ?? ambientContext,
        setContext: setDisplayedContext,
        setAmbientContext,
        setMailView,
        setMailScreenActionHandler,
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

function takeQueuedWaiters(ref: { current: QueuedMessageWaiter[] }) {
  const waiters = ref.current;
  ref.current = [];
  return waiters;
}

// The queue puts an unsent message back in the input itself.
function rejectQueuedWaiters(waiters: QueuedMessageWaiter[]) {
  for (const waiter of waiters) waiter.reject(new QueuedMessageNotSentError());
}

/** A queued message didn't go out; its text is already back in the input. */
export class QueuedMessageNotSentError extends Error {
  constructor() {
    super("The queued message was not sent");
    this.name = "QueuedMessageNotSentError";
  }
}

function mergeQueuedMessages(
  current: QueuedMessage | null,
  next: QueuedMessage,
): QueuedMessage {
  if (!current) return next;
  return {
    text: [current.text.trim(), next.text.trim()].filter(Boolean).join("\n\n"),
    attachments: [...current.attachments, ...next.attachments],
  };
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
  console.error(error);
  captureException(error);
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const statusCode = (error as Record<string, unknown>).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

function isChatAccountMismatchError(error: unknown) {
  return (
    getChatRequestErrorBody(error)?.errorCode ===
    CHAT_ACCOUNT_MISMATCH_ERROR_CODE
  );
}

function getChatSendErrorMessage(error: unknown, i18n: I18n) {
  const statusCode = getErrorStatusCode(error);
  const serverMessage = getChatRequestErrorBody(error)?.error;
  // 4xx responses explain what the user can do; 5xx bodies are not for users.
  if (
    statusCode !== null &&
    statusCode < 500 &&
    typeof serverMessage === "string" &&
    serverMessage.trim()
  ) {
    if (serverMessage === ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE)
      return getMaxTextLengthMessage(i18n);
    return serverMessage;
  }
  return i18n._(CHAT_SEND_FAILED_MESSAGE);
}

function getChatRequestErrorBody(
  error: unknown,
): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const responseBody = (error as Record<string, unknown>).responseBody;
  if (typeof responseBody !== "string") return null;

  try {
    const body: unknown = JSON.parse(responseBody);
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether the assistant changed splits in this reply, and the last split it
 * created or edited, which a later delete of another split doesn't hide.
 */
function getSplitInboxChange(
  message: ChatMessage,
): { shown?: { toolCallId: string; splitId: string } } | null {
  let changed = false;
  let shown: { toolCallId: string; splitId: string } | undefined;
  for (const part of message.parts) {
    if (part.type !== "tool-manageSplitInbox") continue;
    if (part.state !== "output-available" || !part.output.success) continue;
    if (!("action" in part.output)) continue;
    changed = true;
    if (part.output.action !== "create" && part.output.action !== "update")
      continue;
    const splitId = part.output.split?.id;
    if (splitId) shown = { toolCallId: part.toolCallId, splitId };
  }
  return changed ? { shown } : null;
}

function getMaxTextLengthMessage(i18n: I18n) {
  const maxLength = i18n.number(ASSISTANT_CHAT_MAX_TEXT_LENGTH);
  return i18n._(msg`Messages can be up to ${maxLength} characters.`);
}
