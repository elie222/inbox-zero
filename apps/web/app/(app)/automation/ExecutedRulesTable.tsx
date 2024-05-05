import { PendingExecutedRules } from "@/app/api/user/planned/route";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ActionBadgeExpanded } from "@/components/PlanBadge";
import { Tooltip } from "@/components/Tooltip";
import { EmailDate } from "@/components/email-list/EmailDate";
import { getGmailUrl } from "@/utils/url";
import { ExternalLinkIcon } from "lucide-react";

export function EmailCell({
  from,
  subject,
  snippet,
  messageId,
  userEmail,
}: {
  from: string;
  subject: string;
  snippet: string;
  messageId: string;
  userEmail: string;
}) {
  // use regex to find first letter
  const firstLetter = from.match(/[a-zA-Z]/)?.[0] || "-";

  return (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback>{firstLetter}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col justify-center">
        <div className="font-semibold">{from}</div>
        <div className="mt-1 flex items-center font-medium">
          {subject}{" "}
          <OpenInGmailButton messageId={messageId} userEmail={userEmail} />
        </div>
        <div className="mt-1 text-muted-foreground">
          {decodeSnippet(snippet)}
        </div>
      </div>
    </div>
  );
}

export function ActionItemsCell({
  rule,
  actionItems,
}: {
  rule: PendingExecutedRules[number]["rule"];
  actionItems: PendingExecutedRules[number]["actionItems"];
}) {
  return (
    <div>
      <div className="font-medium">{rule?.name}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {actionItems.map((item) => (
          <ActionBadgeExpanded key={item.id} action={item} />
        ))}
      </div>
    </div>
  );
}

export function DateCell({ createdAt }: { createdAt: Date }) {
  return (
    <div className="whitespace-nowrap">
      <Tooltip content={new Date(createdAt).toLocaleString()}>
        <EmailDate date={new Date(createdAt)} />
      </Tooltip>
    </div>
  );
}

function OpenInGmailButton({
  messageId,
  userEmail,
}: {
  messageId: string;
  userEmail: string;
}) {
  return (
    <button
      className="ml-2 text-gray-700 hover:text-gray-900"
      onClick={() => {
        window.open(getGmailUrl(messageId, userEmail), "_blank");
      }}
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </button>
  );
}
