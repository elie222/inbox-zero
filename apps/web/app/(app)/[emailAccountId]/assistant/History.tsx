"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
              key={`${page}-${ruleId}`}
              ruleId={ruleId}
              data={results}
              totalPages={totalPages}
              messagesById={messagesById}
              messagesLoading={isMessagesLoading}
            />
          ) : (
            <AlertBasic
              title={t`No history`}
              description={
                ruleId === "all"
                  ? t`No emails have been processed yet.`
                  : t`No emails have been processed for this rule.`
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
  ruleId,
  totalPages,
  messagesById,
  messagesLoading,
}: {
  data: GetExecutedRulesResponse["results"];
  ruleId: string;
  totalPages: number;
  messagesById: Record<string, ParsedMessage>;
  messagesLoading: boolean;
}) {
  const { i18n } = useLingui();
  const groups = useMemo(() => groupByDate(data), [data]);

  return (
    <div>
      <Table className="max-sm:block">
        <TableBody className="max-sm:block">
          {groups.map((group) => (
            <Fragment key={group.key}>
              <TableRow className="hover:bg-transparent max-sm:block">
                <TableCell
                  colSpan={2}
                  className="max-sm:block bg-muted/40 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {formatDateGroupLabel(group.date, i18n)}
                </TableCell>
              </TableRow>
              {group.items.map((er) => (
                <HistoryThread
                  key={er.threadId}
                  result={er}
                  ruleId={ruleId}
                  message={messagesById[er.messageId]}
                  messagesLoading={messagesLoading}
                />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}

function HistoryThread({
  result,
  ruleId,
  message,
  messagesLoading,
}: {
  result: ExecutedRuleResult;
  ruleId: string;
  message?: ParsedMessage;
  messagesLoading: boolean;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <HistoryMessageRow
        result={result}
        message={message}
        messagesLoading={messagesLoading}
        leading={
          result.messageCount > 1 ? (
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={
                expanded ? t`Collapse conversation` : t`Expand conversation`
              }
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronRightIcon
                className={expanded ? "size-4 rotate-90" : "size-4"}
              />
            </Button>
          ) : undefined
        }
        messageCount={result.messageCount}
      />
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30 max-sm:block">
          <TableCell colSpan={2} className="pl-10 max-sm:block max-sm:pl-4">
            <ThreadHistory
              threadId={result.threadId}
              latestMessageId={result.messageId}
              ruleId={ruleId}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ThreadHistory({
  threadId,
  latestMessageId,
  ruleId,
}: {
  threadId: string;
  latestMessageId: string;
  ruleId: string;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useExecutedRules({
    page,
    ruleId,
    threadId,
    excludeMessageId: latestMessageId,
  });
  const results = data?.results ?? [];
  const ids = results.map((result) => result.messageId);
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
  } = useMessagesBatch({ ids });
  const messagesById = mapMessagesById(messagesData?.messages ?? []);

  return (
    <LoadingContent loading={isLoading} error={error || messagesError}>
      {data && (
        <>
          <Table className="max-sm:block">
            <TableBody className="max-sm:block">
              {results.map((result) => (
                <HistoryMessageRow
                  key={result.messageId}
                  result={result}
                  message={messagesById[result.messageId]}
                  messagesLoading={messagesLoading}
                />
              ))}
            </TableBody>
          </Table>
          {data.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-2 py-2 sm:flex-nowrap">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <Trans>Previous messages</Trans>
              </Button>
              <span className="text-sm text-muted-foreground">
                <Trans>
                  Page {page} of {data.totalPages}
                </Trans>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                <Trans>Next messages</Trans>
              </Button>
            </div>
          )}
        </>
      )}
    </LoadingContent>
  );
}

function HistoryMessageRow({
  result,
  message,
  messagesLoading,
  leading,
  messageCount,
}: {
  result: ExecutedRuleResult;
  message?: ParsedMessage;
  messagesLoading: boolean;
  leading?: React.ReactNode;
  messageCount?: number;
}) {
  const { userEmail } = useAccount();
  const { setInput } = useChat();
  const { i18n } = useLingui();
  const isMessageLoading = !message && messagesLoading;
  return (
    <TableRow className="max-sm:flex max-sm:flex-col">
      <TableCell className="max-sm:pb-2">
        <div className="flex items-start gap-2">
          {leading}
          <div className="min-w-0 flex-1">
            <EmailCell
              message={message}
              messageId={result.messageId}
              threadId={result.threadId}
              userEmail={userEmail}
              isMessageLoading={isMessageLoading}
            />
            {messageCount === undefined &&
              result.executedRules[0]?.createdAt && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {i18n.date(new Date(result.executedRules[0].createdAt), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            <div className="mt-2 flex flex-wrap gap-2">
              {messageCount && messageCount > 1 ? (
                <Badge color="blue">
                  <Plural
                    value={messageCount}
                    one="# message handled"
                    other="# messages handled"
                  />
                </Badge>
              ) : null}
              {!result.executedRules[0]?.automated && (
                <Badge color="yellow">
                  <Trans>Applied manually</Trans>
                </Badge>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-sm:pt-0">
        <RuleCell
          executedRules={result.executedRules}
          message={message}
          setInput={setInput}
          isMessageLoading={isMessageLoading}
        />
      </TableCell>
    </TableRow>
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
    <span className="text-sm text-muted-foreground">
      <Trans>Email unavailable</Trans>
    </span>
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
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
      <div className="min-w-0">
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
          <Trans>Fix</Trans>
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

function formatDateGroupLabel(date: Date | null, i18n: I18n) {
  if (!date) return i18n._(msg`Unknown date`);
  if (isToday(date)) return i18n._(msg`Today`);
  if (isYesterday(date)) return i18n._(msg`Yesterday`);
  if (date.getFullYear() === new Date().getFullYear()) {
    return i18n.date(date, { weekday: "long", month: "short", day: "numeric" });
  }
  return i18n.date(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
