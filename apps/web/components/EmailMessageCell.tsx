"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MessageText } from "@/components/Typography";
import { getGmailUrl } from "@/utils/url";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { useThread } from "@/hooks/useThread";
import { snippetRemoveReply } from "@/utils/gmail/snippet";
import { extractNameFromEmail } from "@/utils/email";

export function EmailMessageCell({
  sender,
  userEmail,
  subject,
  snippet,
  threadId,
  messageId,
  hideViewEmailButton,
}: {
  sender: string;
  userEmail: string;
  subject: string;
  snippet: string;
  threadId: string;
  messageId: string;
  hideViewEmailButton?: boolean;
}) {
  return (
    <div className="min-w-0 break-words">
      <MessageText className="flex items-center">
        {extractNameFromEmail(sender)}{" "}
        <Link
          className="ml-2 hover:text-foreground"
          href={getGmailUrl(messageId, userEmail)}
          target="_blank"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </Link>
        {!hideViewEmailButton && (
          <ViewEmailButton
            threadId={threadId}
            messageId={messageId}
            size="xs"
            className="ml-1.5"
          />
        )}
      </MessageText>
      <MessageText className="mt-1 font-bold">{subject}</MessageText>
      <MessageText className="mt-1">
        {snippetRemoveReply(decodeSnippet(snippet)).trim()}
      </MessageText>
    </div>
  );
}

export function EmailMessageCellWithData({
  sender,
  userEmail,
  threadId,
  messageId,
}: {
  sender: string;
  userEmail: string;
  threadId: string;
  messageId: string;
}) {
  const { data, isLoading, error } = useThread({ id: threadId });

  return (
    <EmailMessageCell
      sender={sender}
      userEmail={userEmail}
      subject={
        error
          ? "Error loading email"
          : isLoading
            ? "Loading email..."
            : data?.thread.messages?.[0]?.headers.subject || ""
      }
      snippet={
        error ? "" : isLoading ? "" : data?.thread.messages?.[0]?.snippet || ""
      }
      threadId={threadId}
      messageId={messageId}
    />
  );
}
