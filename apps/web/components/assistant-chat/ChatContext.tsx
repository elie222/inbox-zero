"use client";

import { createContext, useContext } from "react";
import type { SetInputFunction } from "./types";

type ChatContextType = {
  setInput: SetInputFunction;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  setInput,
}: {
  children: React.ReactNode;
  setInput: SetInputFunction;
}) {
  return (
    <ChatContext.Provider value={{ setInput }}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (context === undefined) {
    // TODO: throw error once this feature is live
    // throw new Error("useChat must be used within a ChatProvider");
    return { setInput: null };
  }
  return context;
}
