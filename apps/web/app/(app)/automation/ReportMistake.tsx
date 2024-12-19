"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  HammerIcon,
  SparklesIcon,
} from "lucide-react";
import useSWR from "swr";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import type { TestResult } from "@/utils/ai/choose-rule/run-rules";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reportAiMistakeAction, testAiAction } from "@/utils/actions/ai-rule";
import type { MessagesResponse } from "@/app/api/google/messages/route";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  reportAiMistakeBody,
  updateRuleInstructionsBody,
  type UpdateRuleInstructionsBody,
  type ReportAiMistakeBody,
} from "@/utils/actions/validation";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Input } from "@/components/Input";
import type { Rule } from "@prisma/client";
import { updateRuleInstructionsAction } from "@/utils/actions/rule";
import { Separator } from "@/components/ui/separator";
import { SectionDescription } from "@/components/Typography";
import { Badge } from "@/components/Badge";
import { TestResultDisplay } from "@/app/(app)/automation/TestRules";
import { isReplyInThread } from "@/utils/thread";
import { isAIRule } from "@/utils/condition";

const NONE_RULE_ID = "__NONE__";

export function ReportMistake({
  message,
  result,
}: {
  message: MessagesResponse["messages"][number];
  result: TestResult | null;
}) {
  const { data, isLoading, error } = useSWR<RulesResponse, { error: string }>(
    "/api/user/rules",
  );
  const [correctRuleId, setCorrectRuleId] = useState<string | null>(null);
  const incorrectRule = result?.rule;
  const correctRule = useMemo(
    () => data?.find((rule) => rule.id === correctRuleId),
    [data, correctRuleId],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HammerIcon className="mr-2 size-4" />
          Fix
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Improve Rules</DialogTitle>
          {/* <DialogDescription>
            Explain what went wrong and our AI will suggest a fix.
          </DialogDescription> */}
        </DialogHeader>

        {correctRuleId ? (
          correctRule?.runOnThreads ? (
            <ImproveRules
              incorrectRule={incorrectRule}
              correctRule={correctRule}
              message={message}
              result={result}
              correctRuleId={correctRuleId}
              setCorrectRuleId={setCorrectRuleId}
            />
          ) : (
            <ImproveRulesOrShowThreadMessage
              incorrectRule={incorrectRule}
              correctRule={correctRule}
              message={message}
              result={result}
              correctRuleId={correctRuleId}
              setCorrectRuleId={setCorrectRuleId}
              threadId={message.threadId}
            />
          )
        ) : (
          <RuleMismatch
            result={result}
            setCorrectRuleId={setCorrectRuleId}
            data={data}
            isLoading={isLoading}
            error={error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleMismatch({
  result,
  setCorrectRuleId,
  data,
  isLoading,
  error,
}: {
  result: TestResult | null;
  setCorrectRuleId: (ruleId: string | null) => void;
  data?: RulesResponse;
  isLoading: boolean;
  error?: { error: string };
}) {
  return (
    <div>
      <Label name="matchedRule" label="Matched:" />
      <div className="mt-1">
        {result ? (
          <TestResultDisplay result={result} />
        ) : (
          <p>No rule matched</p>
        )}
      </div>
      <div className="mt-4">
        <Label name="ruleId" label="Which rule did you expect it to match?" />
      </div>
      <LoadingContent loading={isLoading} error={error}>
        <div className="mt-1 flex flex-col gap-1">
          {[{ id: NONE_RULE_ID, name: "None" }, ...(data || [])]
            .filter((rule) => rule.id !== (result?.rule?.id || NONE_RULE_ID))
            .map((rule) => (
              <Button
                key={rule.id}
                variant="outline"
                onClick={() => setCorrectRuleId(rule.id)}
              >
                {rule.name}
              </Button>
            ))}
        </div>
      </LoadingContent>
    </div>
  );
}

interface ImproveRulesProps {
  incorrectRule?: Rule | null;
  correctRule?: Rule | null;
  message: MessagesResponse["messages"][number];
  result: TestResult | null;
  correctRuleId: string | null;
  setCorrectRuleId: (ruleId: string | null) => void;
}

/**
 * If the rule is set to only run on threads, then check if this message is part of a thread.
 * If it is, then that's the reason we had a mismatch, and not because of the AI instructions.
 */
function ImproveRulesOrShowThreadMessage({
  threadId,
  ...props
}: ImproveRulesProps & { threadId: string }) {
  const isThread = isReplyInThread(props.message.id, threadId);

  if (isThread) {
    return (
      <div>
        <SectionDescription>
          This rule didn't match because the message is part of a thread, but
          this rule is set to not run on threads.
        </SectionDescription>
        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            onClick={() => props.setCorrectRuleId(null)}
          >
            <ArrowLeftIcon className="mr-2 size-4" />
            Back
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/automation/rule/${props.correctRuleId}`}
              target="_blank"
            >
              <ExternalLinkIcon className="mr-2 size-4" />
              Edit Rule
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <ImproveRules {...props} />;
}

function ImproveRules({
  incorrectRule,
  correctRule,
  message,
  result,
  correctRuleId,
  setCorrectRuleId,
}: ImproveRulesProps) {
  const [checking, setChecking] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>();

  return (
    <>
      <>
        {result && <TestResultDisplay result={result} prefix="Matched: " />}
        {incorrectRule && (
          <>
            {isAIRule(incorrectRule) ? (
              <RuleForm rule={incorrectRule} />
            ) : (
              <div>
                <p className="text-sm">
                  {incorrectRule.name} is not an AI rule.
                </p>
                <Button variant="link" asChild className="mt-2">
                  <Link href={`/automation/rule/${incorrectRule.id}`}>
                    Edit
                  </Link>
                </Button>
              </div>
            )}
            <Separator />
          </>
        )}
      </>
      {correctRule && (
        <>
          <Badge color="green">Expected: {correctRule.name}</Badge>
          {isAIRule(correctRule) ? (
            <RuleForm rule={correctRule} />
          ) : (
            <div>
              <p className="text-sm">{correctRule.name} is not an AI rule.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href={`/automation/rule/${correctRule.id}`}>Edit</Link>
              </Button>
            </div>
          )}
          <Separator />
        </>
      )}
      <SectionDescription>Or fix with AI:</SectionDescription>
      <AIFixForm
        message={message}
        result={result}
        correctRuleId={correctRuleId}
      />
      <Separator />

      <Button
        loading={checking}
        onClick={async () => {
          setChecking(true);

          const result = await testAiAction({
            messageId: message.id,
            threadId: message.threadId,
          });
          if (isActionError(result)) {
            toastError({
              title: "There was an error testing the email",
              description: result.error,
            });
          } else {
            setTestResult(result);
          }
          setChecking(false);
        }}
      >
        <SparklesIcon className="mr-2 size-4" />
        Rerun Test
      </Button>

      {testResult && (
        <div className="flex items-center gap-2">
          <SectionDescription>Test Result:</SectionDescription>
          <TestResultDisplay result={testResult} />
        </div>
      )}

      <Button variant="outline" onClick={() => setCorrectRuleId(null)}>
        <ArrowLeftIcon className="mr-2 size-4" />
        Back
      </Button>
    </>
  );
}

function RuleForm({
  rule,
}: {
  rule: Pick<Rule, "id" | "instructions"> & { instructions: string };
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateRuleInstructionsBody>({
    resolver: zodResolver(updateRuleInstructionsBody),
    defaultValues: {
      id: rule.id,
      instructions: rule.instructions,
    },
  });

  const updateRule: SubmitHandler<UpdateRuleInstructionsBody> = useCallback(
    async (data) => {
      const response = await updateRuleInstructionsAction(data);

      if (isActionError(response)) {
        toastError({
          title: "Error updating rule",
          description: response.error,
        });
      } else {
        toastSuccess({ description: "Rule updated!" });
      }
    },
    [],
  );

  return (
    <form onSubmit={handleSubmit(updateRule)} className="space-y-4">
      <Input
        type="text"
        autosizeTextarea
        rows={2}
        name="instructions"
        label="Adjust the instructions"
        placeholder="Updated instructions"
        registerProps={register("instructions")}
        error={errors.instructions}
      />
      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}

function AIFixForm({
  message,
  result,
  correctRuleId,
}: {
  message: MessagesResponse["messages"][number];
  result: TestResult | null;
  correctRuleId: string | null;
}) {
  const [fixedInstructions, setFixedInstructions] = useState<{
    ruleId: string;
    fixedInstructions: string;
  }>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReportAiMistakeBody>({
    resolver: zodResolver(reportAiMistakeBody),
    defaultValues: {
      incorrectRuleId: result?.rule?.id,
      correctRuleId: correctRuleId === NONE_RULE_ID ? undefined : correctRuleId,
      email: {
        from: message.headers.from,
        subject: message.headers.subject,
        snippet: message.snippet,
        textHtml: message.textHtml || null,
        textPlain: message.textPlain || null,
      },
    },
  });

  if (Object.keys(errors).length > 0) {
    console.error("Errors:", errors);
  }

  const reportMistake: SubmitHandler<ReportAiMistakeBody> = useCallback(
    async (data) => {
      const response = await reportAiMistakeAction(data);

      if (isActionError(response)) {
        toastError({
          title: "Error reporting mistake",
          description: response.error,
        });
      } else {
        toastSuccess({
          description: `This is the updated rule: ${response.fixedInstructions}`,
        });

        if (response.ruleId) {
          setFixedInstructions({
            ruleId: response.ruleId,
            fixedInstructions: response.fixedInstructions,
          });
        } else {
          toastError({
            title: "Error reporting mistake",
            description:
              "No rule ID returned. Please contact support if this persists.",
          });
        }
      }
    },
    [],
  );

  return (
    <div>
      <form onSubmit={handleSubmit(reportMistake)} className="space-y-4">
        <Input
          type="text"
          autosizeTextarea
          rows={2}
          name="explanation"
          label="Explanation"
          placeholder="Optional: What was incorrect about this response?"
          registerProps={register("explanation")}
          error={errors.explanation}
        />
        <Button type="submit" loading={isSubmitting}>
          Fix with AI
        </Button>
      </form>

      {fixedInstructions && (
        <SuggestedFix
          ruleId={fixedInstructions.ruleId}
          fixedInstructions={fixedInstructions.fixedInstructions}
        />
      )}
    </div>
  );
}

function SuggestedFix({
  ruleId,
  fixedInstructions,
}: {
  ruleId: string;
  fixedInstructions: string;
}) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <div className="mt-4">
      <p className="text-sm">Suggested fix:</p>
      <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-sm">
        {fixedInstructions}
      </div>
      <Button
        className="mt-4"
        loading={isSaving}
        onClick={async () => {
          setIsSaving(true);
          const res = await updateRuleInstructionsAction({
            id: ruleId,
            instructions: fixedInstructions,
          });

          if (isActionError(res)) {
            toastError({ description: res.error });
          } else {
            toastSuccess({ description: "Rule updated!" });
          }
          setIsSaving(false);
        }}
      >
        Save
      </Button>
    </div>
  );
}
