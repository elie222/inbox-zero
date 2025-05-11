"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  ExternalLinkIcon,
  HammerIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/Input";
import { ButtonList } from "@/components/ButtonList";
import { toastError, toastSuccess } from "@/components/Toast";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reportAiMistakeAction, runRulesAction } from "@/utils/actions/ai-rule";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateRuleInstructionsBody,
  type UpdateRuleInstructionsBody,
} from "@/utils/actions/rule.validation";
import {
  reportAiMistakeBody,
  type ReportAiMistakeBody,
} from "@/utils/actions/ai-rule.validation";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Input } from "@/components/Input";
import { GroupItemType, type Rule } from "@prisma/client";
import { updateRuleInstructionsAction } from "@/utils/actions/rule";
import { Separator } from "@/components/ui/separator";
import { SectionDescription } from "@/components/Typography";
import { Badge } from "@/components/Badge";
import { ProcessResultDisplay } from "@/app/(app)/[emailAccountId]/automation/ProcessResultDisplay";
import { isReplyInThread } from "@/utils/thread";
import { isAIRule, isGroupRule, isStaticRule } from "@/utils/condition";
import { Loading, LoadingMiniSpinner } from "@/components/Loading";
import type { ParsedMessage } from "@/utils/types";
import {
  addGroupItemAction,
  deleteGroupItemAction,
} from "@/utils/actions/group";
import { useRules } from "@/hooks/useRules";
import type { CategoryMatch, GroupMatch } from "@/utils/ai/choose-rule/types";
import { GroupItemDisplay } from "@/app/(app)/[emailAccountId]/automation/group/ViewGroup";
import { cn } from "@/utils";
import { useCategories } from "@/hooks/useCategories";
import { CategorySelect } from "@/components/CategorySelect";
import { useModal } from "@/hooks/useModal";
import { ConditionType } from "@/utils/config";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

type ReportMistakeView = "select-expected-rule" | "ai-fix" | "manual-fix";

const NONE_RULE_ID = "__NONE__";

export function ReportMistake({
  message,
  result,
  isTest,
}: {
  message: ParsedMessage;
  result: RunRulesResult | null;
  isTest: boolean;
}) {
  const { data, isLoading, error } = useRules();
  const actualRule = result?.rule;

  const { isModalOpen, closeModal, setIsModalOpen } = useModal();

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HammerIcon className="mr-2 size-4" />
          Fix
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Improve Rules</DialogTitle>
        </DialogHeader>

        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <Content
              rules={data}
              message={message}
              result={result}
              actualRule={actualRule ?? null}
              isTest={isTest}
              onClose={closeModal}
            />
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}

function Content({
  rules,
  message,
  result,
  actualRule,
  isTest,
  onClose,
}: {
  rules: RulesResponse;
  message: ParsedMessage;
  result: RunRulesResult | null;
  actualRule: Rule | null;
  isTest: boolean;
  onClose: () => void;
}) {
  const [fixedInstructions, setFixedInstructions] = useState<{
    ruleId: string;
    fixedInstructions: string;
  }>();
  const fixedInstructionsRule = useMemo(
    () => rules.find((rule) => rule.id === fixedInstructions?.ruleId),
    [rules, fixedInstructions],
  );

  const [expectedRuleId, setExpectedRuleId] = useState<string | null>(null);
  const expectedRule = useMemo(
    () => rules.find((rule) => rule.id === expectedRuleId),
    [rules, expectedRuleId],
  );

  const [viewStack, setViewStack] = useState<ReportMistakeView[]>([
    "select-expected-rule",
  ]);
  const view = useMemo(() => viewStack[viewStack.length - 1], [viewStack]);

  const onSetView = useCallback((newView: ReportMistakeView) => {
    setViewStack((stack) => [...stack, newView]);
  }, []);

  const onBack = useCallback(() => {
    setViewStack((stack) => {
      if (stack.length <= 1) return stack;
      const newStack = stack.slice(0, -1);
      return newStack;
    });
  }, []);

  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    reportAiMistakeAction.bind(null, emailAccountId),
  );

  const onSelectExpectedRule = useCallback(
    async (expectedRuleId: string | null) => {
      setExpectedRuleId(expectedRuleId);

      const expectedRule = rules.find((rule) => rule.id === expectedRuleId);

      // if AI rule, then use AI to suggest a fix
      const isEitherAIRule =
        (expectedRule && isAIRule(expectedRule)) ||
        (actualRule && isAIRule(actualRule));

      if (isEitherAIRule) {
        onSetView("ai-fix");
        const response = await executeAsync({
          actualRuleId: result?.rule?.id,
          expectedRuleId: expectedRule?.id,
          message: {
            from: message.headers.from,
            subject: message.headers.subject,
            snippet: message.snippet,
            textHtml: message.textHtml || null,
            textPlain: message.textPlain || null,
          },
        });

        if (response?.serverError) {
          toastError({
            title: "Error reporting mistake",
            description: response.serverError,
          });
        } else {
          if (response?.data?.ruleId) {
            setFixedInstructions({
              ruleId: response.data.ruleId,
              fixedInstructions: response.data.fixedInstructions,
            });
          } else {
            toastError({
              title: "Error reporting mistake",
              description:
                "No rule ID returned. Please contact support if this persists.",
            });
          }
        }
      } else {
        // if not AI rule, then show the manual fix view
        onSetView("manual-fix");
      }
    },
    [message, result?.rule?.id, onSetView, actualRule, rules, executeAsync],
  );

  if (view === "select-expected-rule") {
    return (
      <RuleMismatch
        result={result}
        emailAccountId={emailAccountId}
        onSelectExpectedRuleId={onSelectExpectedRule}
        rules={rules}
      />
    );
  }

  if (
    expectedRule &&
    !expectedRule.runOnThreads &&
    isReplyInThread(message.id, message.threadId)
  ) {
    return (
      <ThreadSettingsMismatchMessage
        expectedRuleId={expectedRule.id}
        emailAccountId={emailAccountId}
        onBack={onBack}
      />
    );
  }

  const groupMatch = result?.matchReasons?.find(
    (reason) => reason.type === ConditionType.GROUP,
  );
  if (groupMatch) {
    return (
      <GroupMismatchRemove
        groupMatch={groupMatch}
        ruleId={expectedRule?.id || actualRule?.id!}
        onBack={onBack}
        onClose={onClose}
      />
    );
  }

  const isExpectedGroupRule = !!(expectedRule && isGroupRule(expectedRule));
  if (isExpectedGroupRule) {
    return (
      <GroupMismatchAdd
        ruleId={expectedRule?.id}
        groupId={expectedRule?.groupId}
        groupName={expectedRule?.group?.name || ""}
        message={message}
        onBack={onBack}
        onClose={onClose}
      />
    );
  }

  const isExpectedStaticRule = !!(expectedRule && isStaticRule(expectedRule));
  const isActualStaticRule = !!(actualRule && isStaticRule(actualRule));

  if (isExpectedStaticRule || isActualStaticRule) {
    return (
      <StaticMismatch
        emailAccountId={emailAccountId}
        ruleId={expectedRule?.id || actualRule?.id!}
        isExpectedStaticRule={isExpectedStaticRule}
        onBack={onBack}
      />
    );
  }

  const categoryMatch = result?.matchReasons?.find(
    (reason) => reason.type === ConditionType.CATEGORY,
  );
  if (categoryMatch) {
    return (
      <CategoryMismatch
        categoryMatch={categoryMatch}
        ruleId={expectedRule?.id || actualRule?.id!}
        message={message}
        onBack={onBack}
        onClose={onClose}
      />
    );
  }

  if (view === "ai-fix") {
    return (
      <AIFixView
        emailAccountId={emailAccountId}
        loadingAiFix={isExecuting}
        fixedInstructions={fixedInstructions ?? null}
        fixedInstructionsRule={fixedInstructionsRule ?? null}
        message={message}
        isTest={isTest}
        onBack={onBack}
        onReject={() => onSetView("manual-fix")}
      />
    );
  }

  if (view === "manual-fix") {
    return (
      <ManualFixView
        actualRule={actualRule}
        expectedRule={expectedRule}
        message={message}
        result={result}
        isTest={isTest}
        onBack={onBack}
        emailAccountId={emailAccountId}
      />
    );
  }

  const exhaustiveCheck: never = view;
  return exhaustiveCheck;
}

function AIFixView({
  emailAccountId,
  loadingAiFix,
  fixedInstructions,
  fixedInstructionsRule,
  message,
  isTest,
  onBack,
  onReject,
}: {
  emailAccountId: string;
  loadingAiFix: boolean;
  fixedInstructions: {
    ruleId: string;
    fixedInstructions: string;
  } | null;
  fixedInstructionsRule: Rule | null;
  message: ParsedMessage;
  isTest: boolean;
  onBack: () => void;
  onReject: () => void;
}) {
  if (loadingAiFix) {
    return (
      <div className="flex flex-col items-center justify-center space-y-1">
        <SectionDescription>Suggesting a fix...</SectionDescription>
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fixedInstructionsRule?.instructions ? (
        <div className="space-y-2">
          <ProcessResultDisplay
            result={{ rule: fixedInstructionsRule }}
            emailAccountId={emailAccountId}
          />
          <Instructions
            label="Original:"
            instructions={fixedInstructionsRule?.instructions}
          />
        </div>
      ) : (
        <p className="text-sm">No rule found for the fixed instructions.</p>
      )}

      {fixedInstructions?.ruleId && (
        <SuggestedFix
          message={message}
          ruleId={fixedInstructions.ruleId}
          fixedInstructions={fixedInstructions.fixedInstructions}
          onReject={onReject}
          showRerunButton
          isTest={isTest}
        />
      )}

      <BackButton onBack={onBack} />
    </div>
  );
}

function RuleMismatch({
  result,
  rules,
  emailAccountId,
  onSelectExpectedRuleId,
}: {
  result: RunRulesResult | null;
  rules: RulesResponse;
  emailAccountId: string;
  onSelectExpectedRuleId: (ruleId: string | null) => void;
}) {
  return (
    <div>
      <Label name="matchedRule" label="Matched:" />
      <div className="mt-1">
        {result ? (
          <ProcessResultDisplay
            result={result}
            emailAccountId={emailAccountId}
          />
        ) : (
          <p>No rule matched</p>
        )}
      </div>
      <div className="mt-4">
        <ButtonList
          title="Which rule did you expect it to match?"
          emptyMessage="You haven't created any rules yet!"
          items={[{ id: NONE_RULE_ID, name: "None" }, ...rules].filter(
            (rule) => rule.id !== (result?.rule?.id || NONE_RULE_ID),
          )}
          onSelect={onSelectExpectedRuleId}
        />
      </div>
    </div>
  );
}

function ThreadSettingsMismatchMessage({
  expectedRuleId,
  emailAccountId,
  onBack,
}: {
  expectedRuleId: string;
  emailAccountId: string;
  onBack: () => void;
}) {
  return (
    <div>
      <SectionDescription>
        This rule didn't match because the message is part of a thread, but this
        rule is set to not run on threads.
      </SectionDescription>
      <div className="mt-2 flex gap-2">
        <BackButton onBack={onBack} />
        <EditRuleButton
          ruleId={expectedRuleId}
          emailAccountId={emailAccountId}
        />
      </div>
    </div>
  );
}

function GroupMismatchAdd({
  groupId,
  groupName,
  message,
  ruleId,
  onBack,
  onClose,
}: {
  groupId: string;
  groupName: string;
  message: ParsedMessage;
  ruleId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    addGroupItemAction.bind(null, emailAccountId),
  );

  return (
    <div>
      <SectionDescription>
        Suggested fix: Add this email to the {groupName} group.
      </SectionDescription>

      <div className="mt-2">
        <div
          className={cn(
            "mt-2 rounded-md border p-2 text-sm",
            "border-green-200 bg-green-50",
          )}
        >
          <GroupItemDisplay
            item={{ type: GroupItemType.FROM, value: message.headers.from }}
          />
        </div>

        <Button
          className="mt-2"
          loading={isExecuting}
          onClick={() => {
            toast.promise(
              async () => {
                const result = await executeAsync({
                  groupId,
                  type: GroupItemType.FROM,
                  value: message.headers.from,
                });

                if (result?.serverError) throw new Error(result.serverError);
                onClose();
              },
              {
                loading: "Adding to group...",
                success: "Added to group",
                error: (error) => `Failed to add to group: ${error.message}`,
              },
            );
          }}
        >
          Add to {groupName} group
        </Button>
      </div>

      <div className="mt-2 flex gap-2">
        <BackButton onBack={onBack} />
        <EditRuleButton ruleId={ruleId} emailAccountId={emailAccountId} />
      </div>
    </div>
  );
}

function GroupMismatchRemove({
  groupMatch,
  ruleId,
  onBack,
  onClose,
}: {
  groupMatch: GroupMatch;
  ruleId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    deleteGroupItemAction.bind(null, emailAccountId),
  );

  return (
    <div>
      <SectionDescription>
        Suggested fix: Remove this email from the {groupMatch.group.name} group.
      </SectionDescription>

      <div
        className={cn(
          "mt-2 rounded-md border p-2 text-sm",
          groupMatch.groupItem
            ? "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50",
        )}
      >
        <GroupItemDisplay item={groupMatch.groupItem} />
      </div>

      <Button
        className="mt-2"
        loading={isExecuting}
        Icon={TrashIcon}
        onClick={async () => {
          toast.promise(
            async () => {
              const groupItemId = groupMatch.groupItem.id;
              if (!groupItemId) {
                throw new Error("Learned pattern not found");
              }
              const result = await executeAsync({
                id: groupItemId,
              });
              if (result?.serverError) throw new Error(result.serverError);
              onClose();
            },
            {
              loading: "Removing learned pattern...",
              success: "Removed learned pattern",
              error: (error) =>
                `Failed to remove learned pattern: ${error.message}`,
            },
          );
        }}
      >
        Remove learned pattern
      </Button>

      <div className="mt-2 flex gap-2">
        <BackButton onBack={onBack} />
        <EditRuleButton ruleId={ruleId} emailAccountId={emailAccountId} />
      </div>
    </div>
  );
}

function CategoryMismatch({
  categoryMatch,
  message,
  ruleId,
  onBack,
  onClose,
}: {
  categoryMatch: CategoryMatch;
  message: ParsedMessage;
  ruleId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { categories, isLoading } = useCategories();
  const { emailAccountId } = useAccount();

  return (
    <div>
      <SectionDescription>
        This email matched because{" "}
        <strong className="font-semibold text-blue-700">
          {message.headers.from}
        </strong>{" "}
        was part of the{" "}
        <strong className="font-semibold text-blue-700">
          {categoryMatch.category.name}
        </strong>{" "}
        sender category.
      </SectionDescription>

      <div className="mb-1 mt-4">
        <Label name="category" label="Change category" />
      </div>

      {isLoading ? (
        <LoadingMiniSpinner />
      ) : (
        <CategorySelect
          emailAccountId={emailAccountId}
          sender={message.headers.from}
          senderCategory={categoryMatch.category}
          categories={categories || []}
          onSuccess={onClose}
        />
      )}

      <div className="mt-2 flex gap-2">
        <BackButton onBack={onBack} />
        <EditRuleButton ruleId={ruleId} emailAccountId={emailAccountId} />
      </div>
    </div>
  );
}

// TODO: Could auto fix the static rule for the user
function StaticMismatch({
  emailAccountId,
  ruleId,
  isExpectedStaticRule,
  onBack,
}: {
  emailAccountId: string;
  ruleId: string;
  isExpectedStaticRule: boolean;
  onBack: () => void;
}) {
  return (
    <div>
      <SectionDescription>
        {isExpectedStaticRule
          ? // Case 1: User expected this static rule to match, but it didn't
            " The rule you expected it to match is set to match static conditions, but this message doesn't match any of the static conditions."
          : // Case 2: User didn't expect this static rule to match, but it did
            "This email matched because of static conditions in the rule. To prevent it from matching, you'll need to remove or adjust the matching conditions in the rule settings."}
      </SectionDescription>
      <div className="mt-2 flex gap-2">
        <BackButton onBack={onBack} />
        <EditRuleButton ruleId={ruleId} emailAccountId={emailAccountId} />
      </div>
    </div>
  );
}

function ManualFixView({
  actualRule,
  expectedRule,
  message,
  result,
  onBack,
  isTest,
  emailAccountId,
}: {
  actualRule?: Rule | null;
  expectedRule?: Rule | null;
  message: ParsedMessage;
  result: RunRulesResult | null;
  onBack: () => void;
  isTest: boolean;
  emailAccountId: string;
}) {
  return (
    <>
      <>
        {result && (
          <ProcessResultDisplay
            result={result}
            prefix="Matched: "
            emailAccountId={emailAccountId}
          />
        )}
        {actualRule && (
          <>
            {isAIRule(actualRule) ? (
              <RuleForm rule={actualRule} />
            ) : (
              <EditRuleButton
                ruleId={actualRule.id}
                emailAccountId={emailAccountId}
              />
            )}
            <Separator />
          </>
        )}
      </>
      {expectedRule && (
        <>
          <Badge color="green">Expected: {expectedRule.name}</Badge>
          {isAIRule(expectedRule) ? (
            <RuleForm rule={expectedRule} />
          ) : (
            <EditRuleButton
              ruleId={expectedRule.id}
              emailAccountId={emailAccountId}
            />
          )}
          <Separator />
        </>
      )}

      {expectedRule && isAIRule(expectedRule) && (
        <>
          <SectionDescription>Or fix with AI:</SectionDescription>
          <AIFixForm
            message={message}
            result={result}
            expectedRuleId={expectedRule.id}
            isTest={isTest}
          />
          <Separator />
        </>
      )}
      <RerunButton message={message} isTest={isTest} />
      <BackButton onBack={onBack} />
    </>
  );
}

function RuleForm({
  rule,
}: {
  rule: Pick<Rule, "id" | "instructions"> & { instructions: string };
}) {
  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    updateRuleInstructionsAction.bind(null, emailAccountId),
    {
      onSuccess() {
        toastSuccess({ description: "Rule updated!" });
      },
      onError(result) {
        toastError({
          description: `Error updating rule. ${result.error.serverError || ""}`,
        });
      },
    },
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateRuleInstructionsBody>({
    resolver: zodResolver(updateRuleInstructionsBody),
    defaultValues: {
      id: rule.id,
      instructions: rule.instructions,
    },
  });

  const updateRule: SubmitHandler<UpdateRuleInstructionsBody> = useCallback(
    async (data) => {
      const response = await executeAsync(data);
    },
    [executeAsync],
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
      <Button type="submit" loading={isExecuting}>
        Save
      </Button>
    </form>
  );
}

function AIFixForm({
  message,
  result,
  expectedRuleId,
  isTest,
}: {
  message: ParsedMessage;
  result: RunRulesResult | null;
  expectedRuleId: string | null;
  isTest: boolean;
}) {
  const [fixedInstructions, setFixedInstructions] = useState<{
    ruleId: string;
    fixedInstructions: string;
  }>();

  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    reportAiMistakeAction.bind(null, emailAccountId),
    {
      onSuccess(result) {
        toastSuccess({
          description: `This is the updated rule: ${result?.data?.fixedInstructions}`,
        });

        if (result?.data?.ruleId) {
          setFixedInstructions({
            ruleId: result.data.ruleId,
            fixedInstructions: result.data.fixedInstructions,
          });
        } else {
          toastError({
            title: "Error reporting mistake",
            description:
              "No rule ID returned. Please contact support if this persists.",
          });
        }
      },
      onError(result) {
        toastError({
          description: `Error reporting mistake. ${result.error.serverError || ""}`,
        });
      },
    },
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportAiMistakeBody>({
    resolver: zodResolver(reportAiMistakeBody),
    defaultValues: {
      actualRuleId: result?.rule?.id,
      expectedRuleId:
        expectedRuleId === NONE_RULE_ID ? undefined : expectedRuleId,
      message: {
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

  return (
    <div>
      <form onSubmit={handleSubmit(executeAsync)} className="space-y-2">
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
        <Button type="submit" loading={isExecuting}>
          Fix with AI
        </Button>
      </form>

      {fixedInstructions && (
        <SuggestedFix
          message={message}
          ruleId={fixedInstructions.ruleId}
          fixedInstructions={fixedInstructions.fixedInstructions}
          onReject={() => setFixedInstructions(undefined)}
          showRerunButton={false}
          isTest={isTest}
        />
      )}
    </div>
  );
}

function SuggestedFix({
  message,
  ruleId,
  fixedInstructions,
  onReject,
  showRerunButton,
  isTest,
}: {
  message: ParsedMessage;
  ruleId: string;
  fixedInstructions: string;
  onReject: () => void;
  showRerunButton: boolean;
  isTest: boolean;
}) {
  const [accepted, setAccepted] = useState(false);

  const { emailAccountId } = useAccount();
  const { executeAsync, isExecuting } = useAction(
    updateRuleInstructionsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Rule updated!" });
      },
      onError: (error) => {
        toastError({
          description: error.error.serverError ?? "An error occurred",
        });
      },
    },
  );

  return (
    <div className="mt-4">
      <Instructions label="Suggested fix:" instructions={fixedInstructions} />

      {accepted ? (
        showRerunButton && (
          <div className="mt-2">
            <RerunButton message={message} isTest={isTest} />
          </div>
        )
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            loading={isExecuting}
            onClick={async () => {
              await executeAsync({
                id: ruleId,
                instructions: fixedInstructions,
              });
              setAccepted(true);
            }}
          >
            <CheckIcon className="mr-2 size-4" />
            Accept
          </Button>
          <Button variant="outline" loading={isExecuting} onClick={onReject}>
            <XIcon className="mr-2 size-4" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function Instructions({
  label,
  instructions,
}: {
  label: string;
  instructions: string;
}) {
  return (
    <div>
      <p className="text-sm">{label}</p>
      <div className="mt-2 rounded border border-border bg-muted p-2 text-sm">
        {instructions}
      </div>
    </div>
  );
}

function RerunButton({
  message,
  isTest,
}: {
  message: ParsedMessage;
  isTest: boolean;
}) {
  const [result, setResult] = useState<RunRulesResult>();

  const { emailAccountId } = useAccount();
  const { execute, isExecuting } = useAction(
    runRulesAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        setResult(result?.data);
      },
      onError: (error) => {
        toastError({
          title: "There was an error testing the email",
          description: error.error.serverError ?? "An error occurred",
        });
      },
    },
  );

  return (
    <>
      <Button
        loading={isExecuting}
        onClick={() => {
          execute({
            messageId: message.id,
            threadId: message.threadId,
            isTest,
          });
        }}
      >
        <SparklesIcon className="mr-2 size-4" />
        Rerun
      </Button>

      {result && (
        <div className="mt-2 flex items-center gap-2">
          <SectionDescription>Result:</SectionDescription>
          <ProcessResultDisplay
            result={result}
            emailAccountId={emailAccountId}
          />
        </div>
      )}
    </>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onBack}>
      <ArrowLeftIcon className="mr-2 size-4" />
      Back
    </Button>
  );
}

function EditRuleButton({
  ruleId,
  emailAccountId,
}: {
  ruleId: string;
  emailAccountId: string;
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={prefixPath(emailAccountId, `/automation/rule/${ruleId}`)}
        target="_blank"
      >
        <ExternalLinkIcon className="mr-2 size-4" />
        Edit Rule
      </Link>
    </Button>
  );
}
