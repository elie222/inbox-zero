import { useCallback } from "react";
import { useQueryState } from "nuqs";

export const useDisplayedEmail = () => {
  const [messageId, setMessageId] = useQueryState("messageId");
  const [threadId, setThreadId] = useQueryState("threadId");

  const showEmail = useCallback(
    (
      options: {
        messageId: string;
        threadId: string;
      } | null,
    ) => {
      if (options) {
        setMessageId(options.messageId);
        setThreadId(options.threadId);
      } else {
        setMessageId(null);
        setThreadId(null);
      }
    },
    [setMessageId, setThreadId],
  );

  return {
    messageId,
    threadId,
    showEmail,
  };
};
