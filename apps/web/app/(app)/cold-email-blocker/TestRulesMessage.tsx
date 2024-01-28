"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { MessageText } from "@/components/Typography";
import { getGmailSearchUrl } from "@/utils/url";

export function TestRulesMessage(props: {
  from: string;
  userEmail: string;
  subject: string;
  snippet: string;
}) {
  return (
    <div className="min-w-0 break-words">
      <MessageText className="flex items-center">
        {props.from}{" "}
        <Link
          className="ml-2 hover:text-gray-900"
          href={getGmailSearchUrl(props.from, props.userEmail)}
          target="_blank"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </Link>
      </MessageText>
      <MessageText className="mt-1 font-bold">{props.subject}</MessageText>
      <MessageText className="mt-1">{props.snippet?.trim()}</MessageText>
    </div>
  );
}
