"use client";

import Link from "next/link";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { LoadingContent } from "@/components/LoadingContent";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/Badge";
import { RulesSelect } from "@/app/(app)/[emailAccountId]/assistant/RulesSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import { useExecutedRules } from "@/hooks/useExecutedRules";
import { useMessagesBatch } from "@/hooks/useMessagesBatch";
import { decodeSnippet } from "@/utils/gmail/decode";
import type { ParsedMessage } from "@/utils/types";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/DateCell";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getEmailUrlForMessage } from "@/utils/url";

type HistoryMessage =
  GetExecutedRulesResponse["results"][number]["messages"][number];

export function History() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId] = useQueryState("ruleId", parseAsString.withDefault("all"));

  const { data, isLoading, error } = useExecutedRules({ page, ruleId });
  const results = data?.results ?? [];
  const totalPages = data?.totalPages ?? 1;
  const messageIds = useMemo(
    () =>
      results.flatMap((thread) =>
        thread.messages.map((message) => message.messageId),
      ),
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
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(
    new Set(),
  );

  function toggleThread(threadId: string) {
    setExpandedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Rule</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((thread) => {
            const latestMessage = thread.messages[0];
            if (!latestMessage) return null;

            const message = messagesById[latestMessage.messageId];
            const isMessageLoading = !message && messagesLoading;
            const canExpand = thread.messages.length > 1;
            const isExpanded = expandedThreadIds.has(thread.threadId);

            return (
              <Fragment key={thread.threadId}>
                <TableRow>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {canExpand ? (
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="mt-1"
                          aria-label={
                            isExpanded ? "Collapse thread" : "Expand thread"
                          }
                          onClick={() => toggleThread(thread.threadId)}
                        >
                          <ChevronRightIcon
                            className={`size-4 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        </Button>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <EmailCell
                          message={message}
                          messageId={latestMessage.messageId}
                          threadId={thread.threadId}
                          userEmail={userEmail}
                          createdAt={latestMessage.executedRules[0]?.createdAt}
                          isMessageLoading={isMessageLoading}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {thread.messages.length > 1 && (
                            <Badge color="blue">
                              {thread.messages.length} messages handled
                            </Badge>
                          )}
                          {!latestMessage.executedRules[0]?.automated && (
                            <Badge color="yellow">Applied manually</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RuleCell
                      executedRules={latestMessage.executedRules}
                      message={message}
                      setInput={setInput}
                      isMessageLoading={isMessageLoading}
                    />
                  </TableCell>
                </TableRow>

                {isExpanded &&
                  thread.messages.map((threadMessage) => {
                    const innerMessage = messagesById[threadMessage.messageId];
                    const isInnerMessageLoading =
                      !innerMessage && messagesLoading;

                    return (
                      <TableRow
                        key={`${thread.threadId}-${threadMessage.messageId}`}
                        className="bg-muted/30 hover:bg-muted/50"
                      >
                        <TableCell className="pl-14">
                          <EmailCell
                            message={innerMessage}
                            messageId={threadMessage.messageId}
                            threadId={thread.threadId}
                            userEmail={userEmail}
                            createdAt={
                              threadMessage.executedRules[0]?.createdAt
                            }
                            isMessageLoading={isInnerMessageLoading}
                          />
                          {!threadMessage.executedRules[0]?.automated && (
                            <Badge color="yellow" className="mt-2">
                              Applied manually
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <RuleCell
                            executedRules={threadMessage.executedRules}
                            message={innerMessage}
                            setInput={setInput}
                            isMessageLoading={isInnerMessageLoading}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </Fragment>
            );
          })}
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
  createdAt,
  isMessageLoading,
}: {
  message?: ParsedMessage;
  threadId: string;
  messageId: string;
  userEmail: string;
  createdAt?: Date | string;
  isMessageLoading: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex items-center justify-between">
        <div className="font-semibold">
          {message ? (
            message.headers.from
          ) : isMessageLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <span className="text-muted-foreground">Email unavailable</span>
          )}
        </div>
        {createdAt && <DateCell createdAt={new Date(createdAt)} />}
      </div>
      <div className="mt-1 flex items-center font-medium">
        {message ? (
          <span>{message.headers.subject}</span>
        ) : isMessageLoading ? (
          <Skeleton className="h-4 w-64" />
        ) : (
          <span className="text-muted-foreground">Subject unavailable</span>
        )}
        <OpenInGmailButton
          messageId={messageId}
          threadId={threadId}
          userEmail={userEmail}
        />
        <ViewEmailButton
          threadId={threadId}
          messageId={messageId}
          size="xs"
          className="ml-2"
        />
      </div>
      <div className="mt-1 text-muted-foreground">
        {message ? (
          decodeSnippet(message.snippet)
        ) : isMessageLoading ? (
          <Skeleton className="h-4 w-80" />
        ) : (
          "Preview unavailable"
        )}
      </div>
    </div>
  );
}

function RuleCell({
  executedRules,
  message,
  setInput,
  isMessageLoading,
}: {
  executedRules: HistoryMessage["executedRules"];
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

function OpenInGmailButton({
  messageId,
  threadId,
  userEmail,
}: {
  messageId: string;
  threadId: string;
  userEmail: string;
}) {
  const { provider } = useAccount();

  if (!isGoogleProvider(provider)) {
    return null;
  }

  return (
    <Link
      href={getEmailUrlForMessage(messageId, threadId, userEmail, provider)}
      target="_blank"
      className="ml-2 text-muted-foreground hover:text-foreground"
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </Link>
  );
}

function mapMessagesById(messages: ParsedMessage[]) {
  return messages.reduce<Record<string, ParsedMessage>>((acc, message) => {
    acc[message.id] = message;
    return acc;
  }, {});
}
