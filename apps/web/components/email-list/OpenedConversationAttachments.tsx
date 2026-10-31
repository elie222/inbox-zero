"use client";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { createOpenedConversationAttachments } from "@/utils/attachments/opened-conversation";
const Context = createContext<
  ReturnType<typeof createOpenedConversationAttachments> | undefined
>(undefined);
export function OpenedConversationAttachments({
  emailAccountId,
  threadId,
  children,
  allowUncached = false,
}: {
  emailAccountId: string;
  threadId: string;
  children: ReactNode;
  allowUncached?: boolean;
}) {
  const session = useMemo(
    () =>
      createOpenedConversationAttachments(
        emailAccountId,
        threadId,
        allowUncached,
      ),
    [emailAccountId, threadId, allowUncached],
  );
  useLayoutEffect(() => {
    session.open();
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }
    ).connection;
    const pause = () => {
      if (
        document.visibilityState !== "visible" ||
        navigator.onLine === false ||
        connection?.saveData
      )
        session.pause();
    };
    connection?.addEventListener("change", pause);
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("offline", pause);
    return () => {
      connection?.removeEventListener("change", pause);
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("offline", pause);
      session.close();
    };
  }, [session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useOpenedConversationAttachments() {
  return useContext(Context);
}
