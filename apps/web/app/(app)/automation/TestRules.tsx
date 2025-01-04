"use client";

import { useCallback, useState, useRef, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { capitalCase } from "capital-case";
import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  SparklesIcon,
  PenSquareIcon,
  PauseIcon,
  EyeIcon,
  ExternalLinkIcon,
  ChevronsDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { SlideOverSheet } from "@/components/SlideOverSheet";
import type { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { TestRulesMessage } from "@/app/(app)/cold-email-blocker/TestRulesMessage";
import {
  testAiAction,
  testAiCustomContentAction,
} from "@/utils/actions/ai-rule";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { CardContent } from "@/components/ui/card";
import { isActionError } from "@/utils/error";
import type { TestResult } from "@/utils/ai/choose-rule/run-rules";
import { SearchForm } from "@/components/SearchForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReportMistake } from "@/app/(app)/automation/ReportMistake";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import {
  isAIRule,
  isCategoryRule,
  isGroupRule,
  isStaticRule,
} from "@/utils/condition";
import { BulkRunRules } from "@/app/(app)/automation/BulkRunRules";

type Message = MessagesResponse["messages"][number];

export function TestRules(props: { disabled?: boolean }) {
  return (
    <SlideOverSheet
      title="Test Rules"
      description="Test how your rules perform against real emails."
      content={
        <div className="mt-4">
          <TestRulesContent testMode />
        </div>
      }
    >
      <Button variant="outline" disabled={props.disabled}>
        <BookOpenCheckIcon className="mr-2 h-4 w-4" />
        Test Rules
      </Button>
    </SlideOverSheet>
  );
}

export function TestRulesContent({ testMode }: { testMode: boolean }) {
  const [searchQuery, setSearchQuery] = useQueryState("search");
  const [showCustomForm, setShowCustomForm] = useQueryState(
    "custom",
    parseAsBoolean.withDefault(false),
  );

  const { data, isLoading, isValidating, error, setSize } =
    useSWRInfinite<MessagesResponse>((_index, previousPageData) => {
      const pageToken = previousPageData?.nextPageToken;
      if (previousPageData && !pageToken) return null;

      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (pageToken) params.set("pageToken", pageToken);
      const paramsString = params.toString();
      return `/api/google/messages${paramsString ? `?${paramsString}` : ""}`;
    });

  const onLoadMore = () => {
    setSize((size) => size + 1);
  };

  const messages = useMemo(
    () => data?.flatMap((page) => page.messages) || [],
    [data],
  );

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
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const onRun = useCallback(async (message: Message) => {
    setIsRunning((prev) => ({ ...prev, [message.id]: true }));

    const result = await testAiAction({ messageId: message.id });
    if (isActionError(result)) {
      toastError({
        title: "There was an error testing the email",
        description: result.error,
      });
    } else {
      setResults((prev) => ({ ...prev, [message.id]: result }));
    }
    setIsRunning((prev) => ({ ...prev, [message.id]: false }));
  }, []);

  const handleTestAll = async () => {
    handleStart();

    for (const message of messages) {
      if (!isRunningAllRef.current) break;
      if (results[message.id]) continue;
      await onRun(message);
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
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-6 pb-4">
        <div className="flex items-center gap-2">
          {isRunningAll ? (
            <Button onClick={handleStop} variant="outline">
              <PauseIcon className="mr-2 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleTestAll}>
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
          <SearchForm onSearch={setSearchQuery} />
        </div>
      </div>

      {hasAiRules && showCustomForm && testMode && (
        <div className="mt-2">
          <CardContent>
            <TestRulesForm />
          </CardContent>
          <Separator />
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {messages.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No emails found
          </div>
        ) : (
          <>
            <Table>
              <TableBody>
                {messages.map((message) => (
                  <TestRulesContentRow
                    key={message.id}
                    message={message}
                    userEmail={email!}
                    isRunning={isRunning[message.id]}
                    result={results[message.id]}
                    onRun={() => onRun(message)}
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

type TestRulesInputs = { message: string };

const TestRulesForm = () => {
  const [testResult, setTestResult] = useState<TestResult | undefined>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestRulesInputs>();

  const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(async (data) => {
    const result = await testAiCustomContentAction({ content: data.message });
    if (isActionError(result)) {
      toastError({
        title: "Error testing email",
        description: result.error,
      });
    } else {
      setTestResult(result);
    }
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="message"
          placeholder="Paste in email content or write your own. e.g. Receipt from Stripe for $49"
          registerProps={register("message", { required: true })}
          error={errors.message}
        />
        <Button type="submit" loading={isSubmitting}>
          <SparklesIcon className="mr-2 h-4 w-4" />
          Test Rules
        </Button>
      </form>
      {testResult && (
        <div className="mt-4">
          <TestResultDisplay result={testResult} />
        </div>
      )}
    </div>
  );
};

function TestRulesContentRow({
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
  result: TestResult;
  onRun: () => void;
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
          <TestRulesMessage
            from={message.headers.from}
            subject={message.headers.subject}
            snippet={message.snippet?.trim() || ""}
            userEmail={userEmail}
            messageId={message.id}
          />
          <div className="ml-4 flex gap-1">
            {result ? (
              <>
                <div className="flex max-w-xs items-center whitespace-nowrap">
                  <TestResultDisplay result={result} />
                </div>
                <ReportMistake result={result} message={message} />
              </>
            ) : (
              <Button variant="default" loading={isRunning} onClick={onRun}>
                {!isRunning && <SparklesIcon className="mr-2 h-4 w-4" />}
                {testMode ? "Test" : "Run"}
              </Button>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TestResultDisplay({
  result,
  prefix,
}: {
  result: TestResult;
  prefix?: string;
}) {
  if (!result) return null;

  if (!result.rule) {
    return (
      <HoverCard
        className="w-auto max-w-3xl"
        content={
          <Alert variant="destructive" className="bg-white">
            <AlertTitle>No rule matched</AlertTitle>
            <AlertDescription className="space-y-2">
              <div>
                This email does not match any of the rules you have set.
              </div>
              <div>
                <strong>Reason:</strong> {result.reason || "No reason provided"}
              </div>
            </AlertDescription>
          </Alert>
        }
      >
        <Badge color="red">
          {prefix ? prefix : ""}No rule matched
          <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
        </Badge>
      </HoverCard>
    );
  }

  const MAX_LENGTH = 280;

  const aiGeneratedContent = result.actionItems?.map((action, i) => (
    <div
      key={i}
      className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-900">
        {capitalCase(action.type)}
      </div>
      {Object.entries(action)
        .filter(
          ([key, value]) =>
            value &&
            ["label", "subject", "content", "to", "cc", "bcc", "url"].includes(
              key,
            ),
        )
        .map(([key, value]) => (
          <div key={key} className="flex text-sm text-gray-800">
            <span className="min-w-16 font-medium text-gray-600">
              {capitalCase(key)}:
            </span>
            <span className="ml-2 max-h-40 flex-1 overflow-y-auto">
              {value}
            </span>
          </div>
        ))}
    </div>
  ));

  return (
    <HoverCard
      className="w-auto max-w-5xl"
      content={
        <Alert variant="blue" className="max-w-prose bg-white">
          <CheckCircle2Icon className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            Matched rule "{result.rule.name}"
            <Link
              href={`/automation/rule/${result.rule.id}`}
              target="_blank"
              className="ml-1.5"
            >
              <span className="sr-only">View rule</span>
              <ExternalLinkIcon className="size-3.5 opacity-70" />
            </Link>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            {isAIRule(result.rule) && (
              <div className="text-sm">
                <span className="font-medium">AI Instructions: </span>
                {result.rule.instructions.substring(0, MAX_LENGTH)}
                {result.rule.instructions.length >= MAX_LENGTH && "..."}
              </div>
            )}
            {!!aiGeneratedContent?.length && (
              <div className="space-y-3">{aiGeneratedContent}</div>
            )}
            {!!result.reason && (
              <div className="border-l-2 border-blue-200 pl-3 text-sm">
                <span className="font-medium">Reason: </span>
                {result.reason}
              </div>
            )}
          </AlertDescription>
        </Alert>
      }
    >
      <Badge color="green">
        {prefix ? prefix : ""}
        {result.rule.name}
        <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
      </Badge>
    </HoverCard>
  );
}
