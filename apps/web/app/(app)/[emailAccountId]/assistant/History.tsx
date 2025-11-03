"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { LoadingContent } from "@/components/LoadingContent";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";
import { AlertBasic } from "@/components/Alert";
import { Card } from "@/components/ui/card";
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

  return (
    <>
      <RulesSelect />
      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          {data?.results.length ? (
            <HistoryTable data={data.results} totalPages={data.totalPages} />
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
}: {
  data: GetExecutedRulesResponse["results"];
  totalPages: number;
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
          {data.map((er) => (
            <TableRow key={er.message.id}>
              <TableCell>
                <EmailCell
                  from={er.message.headers.from}
                  subject={er.message.headers.subject}
                  snippet={er.message.snippet}
                  threadId={er.message.threadId}
                  messageId={er.message.id}
                  userEmail={userEmail}
                  createdAt={er.executedRules[0]?.createdAt}
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
                  message={er.message}
                  setInput={setInput}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}

function EmailCell({
  from,
  subject,
  snippet,
  threadId,
  messageId,
  userEmail,
  createdAt,
}: {
  from: string;
  subject: string;
  snippet: string;
  threadId: string;
  messageId: string;
  userEmail: string;
  createdAt: Date;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{from}</div>
        <DateCell createdAt={createdAt} />
      </div>
      <div className="mt-1 flex items-center font-medium">
        <span>{subject}</span>
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
      <div className="mt-1 text-muted-foreground">{decodeSnippet(snippet)}</div>
    </div>
  );
}

function RuleCell({
  executedRules,
  message,
  setInput,
}: {
  executedRules: GetExecutedRulesResponse["results"][number]["executedRules"];
  message: ParsedMessage;
  setInput: (input: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div>
        <ResultsDisplay results={executedRules} />
      </div>
      <FixWithChat
        setInput={setInput}
        message={message}
        results={executedRules}
      />
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
