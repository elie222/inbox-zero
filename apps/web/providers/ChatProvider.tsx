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
import { toastError } from "@/components/Toast";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

export type Chat = ReturnType<typeof useAiChat<ChatMessage>>;

type ChatContextType = {
  chat: Chat;
  input: string;
  chatId: string | null;
  setInput: (input: string) => void;
  setChatId: (chatId: string | null) => void;
  setNewChat: () => void;
  handleSubmit: () => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { emailAccountId } = useAccount();
  const { mutate } = useSWRConfig();

  const [input, setInput] = useState<string>("");
  const [chatId, setChatId] = useQueryState("chatId", parseAsString);
  const { data } = useChatMessages(chatId);

  const setNewChat = useCallback(() => {
    setChatId(generateUUID());
  }, [setChatId]);

  // Prepare initial messages for useChat - stable reference to prevent re-initialization
  const initialMessages = useMemo(() => {
    if (data && data.messages && data.messages.length > 0) {
      return convertToUIMessages(data);
    }
    return [];
  }, [data]);

  const chat = useAiChat<ChatMessage>({
    id: chatId ?? undefined,
    initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: {
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          message: messages.at(-1),
        },
      }),
    }),
    generateId: generateUUID,
    onFinish: () => {
      mutate("/api/user/rules");
    },
    onError: (error) => {
      console.error(error);
      toastError({
        title: "An error occured!",
        description: error.message || "",
      });
    },
  });

  const handleSubmit = useCallback(() => {
    chat.sendMessage({ text: input });
    setInput("");
  }, [chat.sendMessage, input]);

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
      }}
    >
      {children}
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
