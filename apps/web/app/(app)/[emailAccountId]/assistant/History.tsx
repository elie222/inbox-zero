"use client";

import { Fragment, useMemo } from "react";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { format, isToday, isYesterday } from "date-fns";
import { LoadingContent } from "@/components/LoadingContent";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/Badge";
import { RulesSelect } from "@/app/(app)/[emailAccountId]/assistant/RulesSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import { useExecutedRules } from "@/hooks/useExecutedRules";
import { useMessagesBatch } from "@/hooks/useMessagesBatch";
import type { ParsedMessage } from "@/utils/types";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";

type ExecutedRuleResult = GetExecutedRulesResponse["results"][number];

export function History() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId] = useQueryState("ruleId", parseAsString.withDefault("all"));

  const { data, isLoading, error } = useExecutedRules({ page, ruleId });
  const results = data?.results ?? [];
  const totalPages = data?.totalPages ?? 1;
  const messageIds = useMemo(
    () => results.map((result) => result.messageId),
    [results],
  );
  const { data: messagesData, isLoading: isMessagesLoading } = useMessagesBatch(
    {
      ids: messageIds,
    },
  );
  const messages = messagesData?.messages ?? [];
  const messagesById = useMemo(() => mapMessagesById(messages), [messages]);

  return (
    <>
      <RulesSelect />
      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          {results.length ? (
            <HistoryTable
              data={results}
              totalPages={totalPages}
              messagesById={messagesById}
              messagesLoading={isMessagesLoading}
            />
          ) : (
            <AlertBasic
              title="No history"
              description={
                ruleId === "all"
                  ? "No emails have been processed yet."
                  : "No emails have been processed for this rule."
              }
            />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

function HistoryTable({
  data,
  totalPages,
  messagesById,
  messagesLoading,
}: {
  data: GetExecutedRulesResponse["results"];
  totalPages: number;
  messagesById: Record<string, ParsedMessage>;
  messagesLoading: boolean;
}) {
  const { userEmail } = useAccount();
  const { setInput } = useChat();
  const groups = useMemo(() => groupByDate(data), [data]);

  return (
    <div>
      <Table>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={2}
                  className="bg-muted/40 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {formatDateGroupLabel(group.date)}
                </TableCell>
              </TableRow>
              {group.items.map((er) => {
                const message = messagesById[er.messageId];
                const isMessageLoading = !message && messagesLoading;

                return (
                  <TableRow key={er.messageId}>
                    <TableCell>
                      <EmailCell
                        message={message}
                        messageId={er.messageId}
                        threadId={er.threadId}
                        userEmail={userEmail}
                        isMessageLoading={isMessageLoading}
                      />
                      {!er.executedRules[0]?.automated && (
                        <Badge color="yellow" className="mt-2">
                          Applied manually
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <RuleCell
                        executedRules={er.executedRules}
                        message={message}
                        setInput={setInput}
                        isMessageLoading={isMessageLoading}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}

function EmailCell({
  message,
  threadId,
  messageId,
  userEmail,
  isMessageLoading,
}: {
  message?: ParsedMessage;
  threadId: string;
  messageId: string;
  userEmail: string;
  isMessageLoading: boolean;
}) {
  if (message) {
    return (
      <EmailMessageCell
        sender={message.headers.from}
        subject={message.headers.subject}
        snippet={message.snippet}
        userEmail={userEmail}
        threadId={threadId}
        messageId={messageId}
        labelIds={message.labelIds}
      />
    );
  }

  if (isMessageLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-4 w-80" />
      </div>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">Email unavailable</span>
  );
}

function RuleCell({
  executedRules,
  message,
  setInput,
  isMessageLoading,
}: {
  executedRules: GetExecutedRulesResponse["results"][number]["executedRules"];
  message?: ParsedMessage;
  setInput: (input: string) => void;
  isMessageLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div>
        <ResultsDisplay results={executedRules} />
      </div>
      {message ? (
        <FixWithChat
          setInput={setInput}
          message={message}
          results={executedRules}
        />
      ) : isMessageLoading ? (
        <Skeleton className="h-9 w-16" />
      ) : (
        <Button variant="outline" size="sm" disabled>
          Fix
        </Button>
      )}
    </div>
  );
}

function mapMessagesById(messages: ParsedMessage[]) {
  return messages.reduce<Record<string, ParsedMessage>>((acc, message) => {
    acc[message.id] = message;
    return acc;
  }, {});
}

function groupByDate(items: ExecutedRuleResult[]) {
  const groups: {
    key: string;
    date: Date | null;
    items: ExecutedRuleResult[];
  }[] = [];
  for (const item of items) {
    const createdAt = item.executedRules[0]?.createdAt;
    const date = createdAt ? new Date(createdAt) : null;
    const key = date ? format(date, "yyyy-MM-dd") : "unknown";
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, date, items: [item] });
    }
  }
  return groups;
}

function formatDateGroupLabel(date: Date | null) {
  if (!date) return "Unknown date";
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (date.getFullYear() === new Date().getFullYear()) {
    return format(date, "EEEE, MMM d");
  }
  return format(date, "EEEE, MMM d, yyyy");
}
