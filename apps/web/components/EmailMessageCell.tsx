"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MessageText } from "@/components/Typography";
import { getEmailUrlForMessage } from "@/utils/url";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { useThread } from "@/hooks/useThread";
import { snippetRemoveReply } from "@/utils/gmail/snippet";
import { extractNameFromEmail } from "@/utils/email";
import { Badge } from "@/components/ui/badge";
import { useEmail } from "@/providers/EmailProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMemo } from "react";
import { isDefined } from "@/utils/types";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@prisma/client";

export function EmailMessageCell({
  message,
  userEmail,
  hideViewEmailButton,
  filterReplyTrackerLabels,
}: {
  message: ParsedMessage;
  userEmail: string;
  hideViewEmailButton?: boolean;
  filterReplyTrackerLabels?: boolean;
}) {
  const { id: messageId, threadId, headers, snippet, labelIds } = message;
  const sender = headers?.from || "";
  const subject = headers?.subject || "";
  const { userLabels } = useEmail();
  const { provider } = useAccount();

  const labelsToDisplay = useMemo(() => {
    const labels = labelIds
      ?.map((idOrName) => {
        // First try to find by ID
        let label = userLabels[idOrName];

        // If not found by ID, try to find by name
        if (!label) {
          const foundLabel = Object.values(userLabels).find(
            (l) => l.name.toLowerCase() === idOrName.toLowerCase(),
          );
          if (foundLabel) {
            label = foundLabel;
          }
        }

        if (!label) return null;
        return { id: label.id, name: label.name };
      })
      .filter(isDefined)
      .filter((label) => {
        if (filterReplyTrackerLabels) {
          if (
            label.name === getRuleLabel(SystemType.TO_REPLY) ||
            label.name === getRuleLabel(SystemType.AWAITING_REPLY)
          ) {
            return false;
          }
        }

        if (label.name.includes("/")) {
          return false;
        }
        return true;
      });

    if (labelIds && !labelIds.includes("INBOX")) {
      labels?.unshift({ id: "ARCHIVE", name: "Archived" });
    }

    return labels;
  }, [labelIds, userLabels, filterReplyTrackerLabels]);

  return (
    <div className="min-w-0 break-words">
      <MessageText className="flex items-center">
        <span className="max-w-[300px] truncate">
          {extractNameFromEmail(sender)}
        </span>
        {!hideViewEmailButton && isGoogleProvider(provider) && (
          <>
            <Link
              className="ml-2 hover:text-foreground"
              href={getEmailUrlForMessage(message, provider, userEmail)}
              target="_blank"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </Link>
            <ViewEmailButton
              threadId={threadId}
              messageId={messageId}
              size="xs"
              className="ml-1.5"
            />
          </>
        )}
        {labelsToDisplay && labelsToDisplay.length > 0 && (
          <span className="ml-2 flex flex-wrap items-center gap-1">
            {labelsToDisplay.map((label) => (
              <Badge variant="secondary" key={label.id}>
                {label.name}
              </Badge>
            ))}
          </span>
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

  const firstMessage = data?.thread.messages?.[0];

  const message: ParsedMessage = {
    id: messageId,
    threadId,
    historyId: firstMessage?.historyId || "",
    inline: firstMessage?.inline || [],
    subject: error
      ? "Error loading email"
      : isLoading
        ? "Loading email..."
        : firstMessage?.headers.subject || "",
    date: firstMessage?.headers.date || "",
    headers: {
      from: sender,
      to: firstMessage?.headers.to || "",
      subject: error
        ? "Error loading email"
        : isLoading
          ? "Loading email..."
          : firstMessage?.headers.subject || "",
      date: firstMessage?.headers.date || "",
    },
    snippet: error ? "" : isLoading ? "" : firstMessage?.snippet || "",
    labelIds: firstMessage?.labelIds,
    weblink: firstMessage?.weblink,
  };

  return <EmailMessageCell message={message} userEmail={userEmail} />;
}
