import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import type { PendingExecutedRules } from "@/app/api/user/planned/route";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ActionBadgeExpanded } from "@/components/PlanBadge";
import { Tooltip } from "@/components/Tooltip";
import { EmailDate } from "@/components/email-list/EmailDate";
import { getGmailUrl } from "@/utils/url";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationLink,
  PaginationNext,
} from "@/components/ui/pagination";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { conditionsToString, conditionTypesToString } from "@/utils/condition";
import { MessageText } from "@/components/Typography";

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

export function RuleCell({
  rule,
  reason,
}: {
  rule: PendingExecutedRules["executedRules"][number]["rule"];
  reason?: string | null;
}) {
  if (!rule) return null;

  return (
    <HoverCard
      className="w-80"
      content={
        <div>
          <div className="flex justify-between font-medium">
            {rule.name}
            <Badge>{conditionTypesToString(rule)}</Badge>
          </div>
          <div className="mt-2">{conditionsToString(rule)}</div>
          <div className="mt-2">
            <Button variant="outline" size="sm">
              View
            </Button>
          </div>
          {!!reason && (
            <div className="mt-4 space-y-2">
              <div className="font-medium">
                AI reason for choosing this rule:
              </div>
              <MessageText>{reason}</MessageText>
            </div>
          )}
        </div>
      }
    >
      <Link href={`/automation/rule/${rule.id}`}>{rule.name}</Link>
    </HoverCard>
  );
}

export function ActionItemsCell({
  actionItems,
}: {
  actionItems: PendingExecutedRules["executedRules"][number]["actionItems"];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {actionItems.map((item) => (
        <ActionBadgeExpanded key={item.id} action={item} />
      ))}
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
      type="button"
      className="ml-2 text-gray-700 hover:text-gray-900"
      onClick={() => {
        window.open(getGmailUrl(messageId, userEmail), "_blank");
      }}
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </button>
  );
}

export function TablePagination({ totalPages }: { totalPages: number }) {
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get("page") || "1");
  const hrefForPage = useCallback(
    (value: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", value.toString());
      const asString = params.toString();
      return asString ? `?${asString}` : "";
    },
    [searchParams],
  );

  if (totalPages <= 1) return null;

  return (
    <div className="m-4">
      <Pagination className="justify-end">
        <PaginationContent>
          {page > 1 && (
            <PaginationItem>
              <PaginationPrevious href={hrefForPage(page - 1)} />
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationLink href={hrefForPage(page)}>{page}</PaginationLink>
          </PaginationItem>
          {page < totalPages && (
            <PaginationItem>
              <PaginationNext href={hrefForPage(page + 1)} />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </div>
  );
}
