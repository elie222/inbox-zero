import { useCallback, useState } from "react";
import { useQueryState } from "nuqs";

export const useDisplayedEmail = () => {
  const [threadId, setThreadId] = useQueryState("side-panel-thread-id");
  const [messageId, setMessageId] = useQueryState("side-panel-message-id");
  const [autoOpenReplyForMessageId, setAutoOpenReplyForMessageId] =
    useQueryState("auto-open-reply-for-message-id");
  const [autoOpenForwardForMessageId, setAutoOpenForwardForMessageId] =
    useQueryState("auto-open-forward-for-message-id");
  const [showReplyButton, setShowReplyButton] = useState(false);

  const showEmail = useCallback(
    (
      options: {
        threadId: string;
        messageId?: string;
        showReplyButton?: boolean;
        autoOpenReplyForMessageId?: string;
        autoOpenForwardForMessageId?: string;
      } | null,
    ) => {
      setAutoOpenReplyForMessageId(options?.autoOpenReplyForMessageId || "");
      setAutoOpenForwardForMessageId(
        options?.autoOpenForwardForMessageId || "",
      );
      setThreadId(options?.threadId ?? null);
      setMessageId(options?.messageId ?? null);
      setShowReplyButton(options?.showReplyButton ?? true);
    },
    [
      setAutoOpenForwardForMessageId,
      setAutoOpenReplyForMessageId,
      setMessageId,
      setThreadId,
    ],
  );

  return {
    threadId,
    messageId,
    showEmail,
    showReplyButton,
    autoOpenForwardForMessageId,
    autoOpenReplyForMessageId,
  };
};
