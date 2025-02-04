import { useCallback, useState } from "react";
import { useQueryState } from "nuqs";

export const useDisplayedEmail = () => {
  const [threadId, setThreadId] = useQueryState("side-panel-thread-id");
  const [messageId, setMessageId] = useQueryState("side-panel-message-id");
  const [autoOpenReplyForMessageId, setAutoOpenReplyForMessageId] =
    useQueryState("auto-open-reply-for-message-id");
  const [showReplyButton, setShowReplyButton] = useState(false);

  const showEmail = useCallback(
    (
      options: {
        threadId: string;
        messageId?: string;
        showReplyButton?: boolean;
        autoOpenReplyForMessageId?: string;
      } | null,
    ) => {
      setAutoOpenReplyForMessageId(options?.autoOpenReplyForMessageId || "");
      setThreadId(options?.threadId ?? null);
      setMessageId(options?.messageId ?? null);
      setShowReplyButton(options?.showReplyButton ?? true);
    },
    [setMessageId, setThreadId, setAutoOpenReplyForMessageId],
  );

  return {
    threadId,
    messageId,
    showEmail,
    showReplyButton,
    autoOpenReplyForMessageId,
  };
};
