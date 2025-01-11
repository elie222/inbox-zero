"use client";

import { ExternalLinkIcon, EyeIcon } from "lucide-react";
import Link from "next/link";
import { MessageText } from "@/components/Typography";
import { getGmailUrl } from "@/utils/url";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Button } from "@/components/ui/button";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";

export function TestRulesMessage({
  from,
  userEmail,
  subject,
  snippet,
  threadId,
  messageId,
}: {
  from: string;
  userEmail: string;
  subject: string;
  snippet: string;
  threadId: string;
  messageId: string;
}) {
  const { showEmail } = useDisplayedEmail();

  return (
    <div className="min-w-0 break-words">
      <MessageText className="flex items-center">
        {from}{" "}
        <Link
          className="ml-2 hover:text-gray-900"
          href={getGmailUrl(messageId, userEmail)}
          target="_blank"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </Link>
        <Button
          className="ml-1"
          variant="outline"
          size="xs"
          onClick={() => showEmail({ threadId, messageId })}
        >
          <EyeIcon className="h-4 w-4" />
          <span className="sr-only">View email</span>
        </Button>
      </MessageText>
      <MessageText className="mt-1 font-bold">{subject}</MessageText>
      <MessageText className="mt-1">
        {decodeSnippet(snippet).trim()}
      </MessageText>
    </div>
  );
}
