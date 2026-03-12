"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { parseAsString, useQueryState } from "nuqs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";
import { captureException } from "@/utils/error";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { MessageContext } from "@/app/api/chat/validation";
import { InlineEmailActionProvider } from "@/components/assistant-chat/inline-email-action-context";
import {
  mergeInlineEmailActions,
  type InlineEmailAction,
  type InlineEmailActionType,
} from "@/utils/ai/assistant/inline-email-actions";

export type Attachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
};

export type Chat = ReturnType<typeof useAiChat<ChatMessage>>;

type ChatContextType = {
  chat: Chat;
  input: string;
  chatId: string | null;
  setInput: (input: string) => void;
  setChatId: (chatId: string | null) => void;
  setNewChat: () => void;
  handleSubmit: () => void;
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
  const previousChatIdRef = useRef(chatId);

  const { data } = useChatMessages(chatId);

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
            context: context ?? undefined,
            inlineActions: pendingInlineActionsRef.current ?? undefined,
            ...body,
          },
        };
      },
    }),
    // messages: initialMessages, // NOTE: couldn't get this to work
    experimental_throttle: 100,
    generateId: generateUUID,
    onFinish: () => {
      pendingInlineActionsRef.current = null;
      mutate("/api/user/rules");
    },
    onError: (error) => {
      const pendingInlineActions = pendingInlineActionsRef.current;
      if (pendingInlineActions?.length) {
        setInlineActions((current) =>
          pendingInlineActions.reduce(
            (merged, action) => mergeInlineEmailActions(merged, action),
            current,
          ),
        );
        pendingInlineActionsRef.current = null;
      }

      console.error(error);
      captureException(error);
    },
  });

  useEffect(() => {
    chat.setMessages(data ? convertToUIMessages(data) : []);
  }, [chat.setMessages, data]);

  useEffect(() => {
    inlineActionsRef.current = inlineActions;
  }, [inlineActions]);

  useEffect(() => {
    if (previousChatIdRef.current === chatId) return;

    previousChatIdRef.current = chatId;
    pendingInlineActionsRef.current = null;
    setInlineActions([]);
  }, [chatId]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const fileParts = attachments.map((a) => ({
      type: "file" as const,
      url: a.url,
      filename: a.name,
      mediaType: a.contentType,
    }));

    const parts: Array<
      | { type: "file"; url: string; filename: string; mediaType: string }
      | { type: "text"; text: string }
    > = [...fileParts];

    if (text) {
      parts.push({ type: "text", text });
    }

    pendingInlineActionsRef.current = inlineActionsRef.current.length
      ? inlineActionsRef.current
      : null;

    if (pendingInlineActionsRef.current) {
      setInlineActions([]);
    }

    chat.sendMessage({ role: "user", parts });

    setAttachments([]);
    setInput("");
  }, [chat.sendMessage, input, attachments]);

  return (
    <ChatContext.Provider
      value={{
        chat,
        chatId,
        input,
        setInput,
        setChatId,
        setNewChat,
        handleSubmit,
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
