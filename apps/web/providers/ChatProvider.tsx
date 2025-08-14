"use client";

import { useChat as useAiChat } from "@ai-sdk/react";
import { parseAsString, useQueryState } from "nuqs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const chat = useAiChat<ChatMessage>({
    id: chatId ?? undefined,
    api: "/api/chat",
    headers: {
      [EMAIL_ACCOUNT_HEADER]: emailAccountId,
    },
    experimental_prepareRequestBody: ({ id, messages, requestBody }) => ({
      id,
      message: messages.at(-1),
      ...requestBody,
    }),
    // TODO: couldn't get this to work
    // messages: initialMessages,
    experimental_throttle: 100,
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

  useEffect(() => {
    chat.setMessages(data ? convertToUIMessages(data) : []);
  }, [chat.setMessages, data]);

  const handleSubmit = useCallback(() => {
    chat.append({
      role: "user",
      parts: [
        {
          type: "text",
          text: input,
        },
      ],
    });

    setInput("");
  }, [chat.append, input]);

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
