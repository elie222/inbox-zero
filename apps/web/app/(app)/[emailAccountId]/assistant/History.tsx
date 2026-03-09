"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";
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
          {data.map((er) => {
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
                    createdAt={er.executedRules[0]?.createdAt}
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
  createdAt: Date;
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
        <DateCell createdAt={createdAt} />
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
