"use client";

import { ExternalLinkIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { getEmailUrlForMessage } from "@/utils/url";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Tooltip } from "@/components/Tooltip";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useThread } from "@/hooks/useThread";
import { snippetRemoveReply } from "@/utils/gmail/snippet";
import { extractNameFromEmail } from "@/utils/email";
import { Badge } from "@/components/ui/badge";
import { useEmail } from "@/providers/EmailProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMemo } from "react";
import { isDefined } from "@/utils/types";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";

const MAX_VISIBLE_LABELS = 2;

export function EmailMessageCell({
  sender,
  userEmail,
  subject,
  snippet,
  threadId,
  messageId,
  hideViewEmailButton,
  labelIds,
  filterReplyTrackerLabels,
}: {
  sender: string;
  userEmail: string;
  subject: string;
  snippet: string;
  threadId: string;
  messageId: string;
  hideViewEmailButton?: boolean;
  labelIds?: string[];
  filterReplyTrackerLabels?: boolean;
}) {
  const { userLabels } = useEmail();
  const { provider } = useAccount();
  const { showEmail } = useDisplayedEmail();

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

  const showIcons = !hideViewEmailButton && isGoogleProvider(provider);
  const visibleLabels = labelsToDisplay?.slice(0, MAX_VISIBLE_LABELS) ?? [];
  const overflowLabels = labelsToDisplay?.slice(MAX_VISIBLE_LABELS) ?? [];

  return (
    <div className="min-w-0 break-words text-sm text-slate-700 dark:text-foreground">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="order-1 max-w-[240px] shrink-0 truncate font-semibold">
          {extractNameFromEmail(sender)}
        </span>
        <span className="order-4 min-w-0 max-w-full basis-full truncate sm:order-2 sm:max-w-md sm:basis-auto">
          {subject}
        </span>
        {visibleLabels.length > 0 && (
          <div className="order-5 flex shrink-0 items-center gap-1 sm:order-3">
            {visibleLabels.map((label) => (
              <Badge
                variant="outline"
                key={label.id}
                className="max-w-[140px] truncate font-normal text-muted-foreground"
              >
                {label.name}
              </Badge>
            ))}
            {overflowLabels.length > 0 && (
              <Tooltip content={overflowLabels.map((l) => l.name).join(", ")}>
                <span>
                  <Badge
                    variant="outline"
                    className="font-normal text-muted-foreground"
                  >
                    +{overflowLabels.length}
                  </Badge>
                </span>
              </Tooltip>
            )}
          </div>
        )}
        {showIcons && (
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 text-muted-foreground sm:order-4 sm:ml-0">
            <Link
              className="hover:text-foreground"
              href={getEmailUrlForMessage(
                messageId,
                threadId,
                userEmail,
                provider,
              )}
              target="_blank"
              aria-label="Open in Gmail"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </Link>
            <Tooltip content="View email">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => showEmail({ threadId, messageId })}
                aria-label="View email"
              >
                <MailIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      <p className="mt-1 line-clamp-2 max-w-2xl break-all text-sm text-muted-foreground">
        {snippetRemoveReply(decodeSnippet(snippet)).trim()}
      </p>
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

  const firstMessage = data?.thread?.messages?.[0];
  const emailNotFound = !isLoading && !error && !firstMessage;

  return (
    <EmailMessageCell
      sender={sender}
      userEmail={userEmail}
      subject={
        error
          ? "Error loading email"
          : isLoading
            ? "Loading email..."
            : emailNotFound
              ? "Email not found"
              : firstMessage?.headers.subject || ""
      }
      snippet={
        error || emailNotFound
          ? ""
          : isLoading
            ? ""
            : firstMessage?.snippet || ""
      }
      threadId={threadId}
      messageId={messageId}
      labelIds={firstMessage?.labelIds}
      hideViewEmailButton={emailNotFound || !!error}
    />
  );
}
