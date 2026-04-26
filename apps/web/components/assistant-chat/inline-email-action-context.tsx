"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InlineEmailActionType } from "@/utils/ai/assistant/inline-email-actions";

type InlineEmailActionContextValue = {
  queueAction: (type: InlineEmailActionType, threadIds: string[]) => void;
};

const InlineEmailActionContext =
  createContext<InlineEmailActionContextValue | null>(null);

export function InlineEmailActionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: InlineEmailActionContextValue;
}) {
  return (
    <InlineEmailActionContext.Provider value={value}>
      {children}
    </InlineEmailActionContext.Provider>
  );
}

export function useInlineEmailActionContext() {
  return useContext(InlineEmailActionContext);
}
