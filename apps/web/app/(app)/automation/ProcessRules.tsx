"use client";

import { useCallback, useState, useRef, useMemo } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import {
  BookOpenCheckIcon,
  SparklesIcon,
  PenSquareIcon,
  PauseIcon,
  ChevronsDownIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import type { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { runRulesAction } from "@/utils/actions/ai-rule";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { CardContent } from "@/components/ui/card";
import { isActionError } from "@/utils/error";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { SearchForm } from "@/components/SearchForm";
import { ReportMistake } from "@/app/(app)/automation/ReportMistake";
import { Badge } from "@/components/Badge";
import {
  isAIRule,
  isCategoryRule,
  isGroupRule,
  isStaticRule,
} from "@/utils/condition";
import { BulkRunRules } from "@/app/(app)/automation/BulkRunRules";
import { cn } from "@/utils";
import { TestCustomEmailForm } from "@/app/(app)/automation/TestCustomEmailForm";
import { ProcessResultDisplay } from "@/app/(app)/automation/ProcessResultDisplay";
import { Tooltip } from "@/components/Tooltip";

type Message = MessagesResponse["messages"][number];

export function ProcessRulesContent({ testMode }: { testMode: boolean }) {
  const [searchQuery, setSearchQuery] = useQueryState("search");
  const [showCustomForm, setShowCustomForm] = useQueryState(
    "custom",
    parseAsBoolean.withDefault(false),
  );

  const { data, isLoading, isValidating, error, setSize, mutate } =
    useSWRInfinite<MessagesResponse>((_index, previousPageData) => {
      const pageToken = previousPageData?.nextPageToken;
      if (previousPageData && !pageToken) return null;

      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (pageToken) params.set("pageToken", pageToken);
      const paramsString = params.toString();
      return `/api/google/messages${paramsString ? `?${paramsString}` : ""}`;
    });

  const onLoadMore = () => setSize((size) => size + 1);

  // filter out messages in same thread
  // only keep the most recent message in each thread
  const messages = useMemo(() => {
    const threadIds = new Set();
    const messages = data?.flatMap((page) => page.messages) || [];
    return messages.filter((message) => {
      // works because messages are sorted by date descending
      if (threadIds.has(message.threadId)) return false;
      threadIds.add(message.threadId);
      return true;
    });
  }, [data]);

  const { data: rules } = useSWR<RulesResponse>("/api/user/rules");
  const session = useSession();
  const email = session.data?.user.email;

  // only show test rules form if we have an AI rule. this form won't match group/static rules which will confuse users
  const hasAiRules = rules?.some(
    (rule) =>
      isAIRule(rule) &&
      !isGroupRule(rule) &&
      !isStaticRule(rule) &&
      !isCategoryRule(rule),
  );

  const isRunningAllRef = useRef(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [currentPageLimit, setCurrentPageLimit] = useState(testMode ? 1 : 10);
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RunRulesResult>>({});
  const handledThreadsRef = useRef(new Set<string>());

  const onRun = useCallback(
    async (message: Message, rerun?: boolean) => {
      setIsRunning((prev) => ({ ...prev, [message.id]: true }));

      const result = await runRulesAction({
        messageId: message.id,
        threadId: message.threadId,
        isTest: testMode,
        rerun,
      });
      if (isActionError(result)) {
        toastError({
          title: "There was an error processing the email",
          description: result.error,
        });
      } else {
        setResults((prev) => ({ ...prev, [message.id]: result }));
      }
      setIsRunning((prev) => ({ ...prev, [message.id]: false }));
    },
    [testMode],
  );

  const handleRunAll = async () => {
    handleStart();

    // Increment the page limit each time we run
    setCurrentPageLimit((prev) => prev + (testMode ? 1 : 10));

    for (let page = 0; page < currentPageLimit; page++) {
      // Get current data, only fetch if we don't have this page yet
      let currentData = data;
      if (!currentData?.[page]) {
        await setSize((size) => size + 1);
        currentData = await mutate();
      }

      const currentBatch = currentData?.[page]?.messages || [];

      for (const message of currentBatch) {
        if (!isRunningAllRef.current) break;
        if (results[message.id]) continue;
        if (handledThreadsRef.current.has(message.threadId)) continue;
        await onRun(message);
        handledThreadsRef.current.add(message.threadId);
      }

      // Check if we got new data in the last request
      const lastPage = currentData?.[page];
      if (!lastPage?.nextPageToken || !isRunningAllRef.current) break;
    }

    handleStop();
  };

  const handleStart = () => {
    setIsRunningAll(true);
    isRunningAllRef.current = true;
  };

  const handleStop = () => {
    isRunningAllRef.current = false;
    setIsRunningAll(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-6 pb-4">
        <div className="flex items-center gap-2">
          {isRunningAll ? (
            <Button onClick={handleStop} variant="outline">
              <PauseIcon className="mr-2 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleRunAll}>
              <BookOpenCheckIcon className="mr-2 h-4 w-4" />
              {testMode ? "Test All" : "Run on All"}
            </Button>
          )}

          {!testMode && <BulkRunRules />}
        </div>

        <div className="flex items-center gap-2">
          {hasAiRules && testMode && (
            <Button
              variant="ghost"
              onClick={() => setShowCustomForm((show) => !show)}
            >
              <PenSquareIcon className="mr-2 h-4 w-4" />
              Custom
            </Button>
          )}
          <SearchForm
            defaultQuery={searchQuery || undefined}
            onSearch={setSearchQuery}
          />
        </div>
      </div>

      {hasAiRules && showCustomForm && testMode && (
        <div className="mt-2">
          <CardContent>
            <TestCustomEmailForm />
          </CardContent>
          <Separator />
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {messages.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No emails found
          </div>
        ) : (
          <>
            <Table>
              <TableBody>
                {messages.map((message) => (
                  <ProcessRulesRow
                    key={message.id}
                    message={message}
                    userEmail={email!}
                    isRunning={isRunning[message.id]}
                    result={results[message.id]}
                    onRun={(rerun) => onRun(message, rerun)}
                    testMode={testMode}
                  />
                ))}
              </TableBody>
            </Table>

            <div className="mx-4 mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={onLoadMore}
                loading={isValidating}
              >
                {!isValidating && <ChevronsDownIcon className="mr-2 size-4" />}
                Load More
              </Button>
            </div>
          </>
        )}
      </LoadingContent>
    </div>
  );
}

function ProcessRulesRow({
  message,
  userEmail,
  isRunning,
  result,
  onRun,
  testMode,
}: {
  message: Message;
  userEmail: string;
  isRunning: boolean;
  result: RunRulesResult;
  onRun: (rerun?: boolean) => void;
  testMode: boolean;
}) {
  return (
    <TableRow
      className={
        isRunning ? "animate-pulse bg-blue-50 dark:bg-blue-950/20" : undefined
      }
    >
      <TableCell>
        <div className="flex items-center justify-between">
          <EmailMessageCell
            sender={message.headers.from}
            subject={message.headers.subject}
            snippet={message.snippet}
            userEmail={userEmail}
            threadId={message.threadId}
            messageId={message.id}
          />
          <div className="ml-4 flex items-center gap-1">
            {result ? (
              <>
                <div className="flex max-w-xs flex-col justify-center gap-0.5 whitespace-nowrap">
                  {result.existing && (
                    <Badge color="yellow">Already processed</Badge>
                  )}
                  <ProcessResultDisplay result={result} />
                </div>
                <ReportMistake
                  result={result}
                  message={message}
                  isTest={testMode}
                />
                <Tooltip content={testMode ? "Retest" : "Rerun"}>
                  <Button
                    variant="outline"
                    disabled={isRunning}
                    onClick={() => onRun(true)}
                  >
                    <RefreshCcwIcon
                      className={cn("size-4", isRunning && "animate-spin")}
                    />
                    <span className="sr-only">{testMode ? "Test" : "Run"}</span>
                  </Button>
                </Tooltip>
              </>
            ) : (
              <Button
                variant="default"
                loading={isRunning}
                onClick={() => onRun()}
              >
                {!isRunning && <SparklesIcon className="mr-2 size-4" />}
                {testMode ? "Test" : "Run"}
              </Button>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
