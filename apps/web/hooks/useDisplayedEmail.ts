import { useCallback } from "react";
import { useQueryState } from "nuqs";

export const useDisplayedEmail = () => {
  const [threadId, setThreadId] = useQueryState("side-panel-thread-id");
  const [messageId, setMessageId] = useQueryState("side-panel-message-id");

  const showEmail = useCallback(
    (
      options: {
        threadId: string;
        messageId?: string;
      } | null,
    ) => {
      setThreadId(options?.threadId ?? null);
      setMessageId(options?.messageId ?? null);
    },
    [setMessageId, setThreadId],
  );

  return {
    threadId,
    messageId,
    showEmail,
  };
};
