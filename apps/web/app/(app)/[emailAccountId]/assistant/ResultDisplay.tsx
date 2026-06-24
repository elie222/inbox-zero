import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { capitalCase } from "capital-case";
import he from "he";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import { conditionTypesToString } from "@/utils/condition";
import {
  ActionType,
  ExecutedRuleStatus,
  LogicalOperator,
} from "@/generated/prisma/enums";
import type { Rule } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { MessageText, MutedText } from "@/components/Typography";
import { EyeIcon } from "lucide-react";
import { useRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { ThreadSkipHint } from "@/app/(app)/[emailAccountId]/assistant/ThreadSkipHint";
import { LearnedPatternExclusionHint } from "@/app/(app)/[emailAccountId]/assistant/LearnedPatternExclusionHint";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import {
  getActionDisplay,
  getActionIcon,
  getVisibleActions,
} from "@/utils/action-display";
import { getActionColor } from "@/components/PlanBadge";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ResultsDisplay({
  results,
  showFullContent = false,
}: {
  results: RunRulesResult[];
  showFullContent?: boolean;
}) {
  const groupedResults = groupBy(results, (result) =>
    result.createdAt.toString(),
  );

  const sortedBatches = sortBy(
    Object.entries(groupedResults),
    ([, batchResults]) => {
      const createdAt = batchResults[0]?.createdAt;
      return createdAt ? -new Date(createdAt) : 0; // Negative for descending order
    },
  );

  return (
    <div className="flex flex-col gap-2">
      {sortedBatches.map(([date, batchResults], batchIndex) => (
        <div key={date}>
          {batchIndex === 1 && sortedBatches.length > 1 && (
            <div className="my-1 text-xs text-muted-foreground">Previous:</div>
          )}
          <div
            className={showFullContent ? "flex flex-col gap-4" : "flex gap-1"}
          >
            {batchResults.map((result, resultIndex) => (
              <ResultDisplay
                key={`${date}-${resultIndex}`}
                result={result}
                showFullContent={showFullContent}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultDisplay({
  result,
  showFullContent = false,
}: {
  result: RunRulesResult;
  showFullContent?: boolean;
}) {
  const { rule, status } = result;

  if (showFullContent) {
    return (
      <div className="w-full">
        <ResultDisplayContent result={result} />
      </div>
    );
  }

  return (
    <HoverCard
      content={<ResultDisplayContent result={result} />}
      className="w-max min-w-64 max-w-[min(32rem,calc(100vw-2rem))] overflow-visible"
    >
      <Badge color={rule ? "green" : "red"} className="whitespace-nowrap">
        {rule
          ? rule.name
          : status === ExecutedRuleStatus.SKIPPED
            ? "No match found"
            : capitalCase(status)}
        <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
      </Badge>
    </HoverCard>
  );
}

export function ResultDisplayContent({ result }: { result: RunRulesResult }) {
  const { rule, status, reason } = result;
  const reasonDisplay = getRuleResultReasonDisplay(reason ?? "");
  const skippedThreadRuleNames =
    result.selectionMetadata?.skippedThreadRuleNames ?? [];
  const learnedPatternExcludedRules =
    result.selectionMetadata?.learnedPatternExcludedRules ?? [];

  const { ruleDialog, RuleDialogComponent } = useRuleDialog();
  const { provider } = useAccount();

  return (
    <div>
      <div className="flex justify-between font-medium">
        {rule ? (
          <>
            {rule.name}
            <Badge color="blue">{conditionTypesToString(rule)}</Badge>
          </>
        ) : (
          status === ExecutedRuleStatus.SKIPPED && "No match found"
        )}
      </div>
      <div className="mt-2">
        {rule ? <PrettyConditions rule={rule} /> : null}
      </div>
      <div className="mt-2">
        {!!rule && (
          <Button
            size="sm"
            onClick={() => {
              ruleDialog.onOpen({ ruleId: rule.id });
            }}
          >
            View matching rule
          </Button>
        )}
      </div>

      <div className="mt-2">
        {result.actionItems?.length ? (
          <>
            <div className="font-medium text-sm mb-1">Actions:</div>
            <Actions
              actions={
                result.actionItems?.map((action) => ({
                  id: action.id,
                  type: action.type,
                  label: action.label,
                  folderName: action.folderName,
                  content: action.content,
                  to: action.to,
                  subject: action.subject,
                  cc: action.cc,
                  bcc: action.bcc,
                  url: action.url,
                })) || []
              }
              provider={provider}
              labels={[]}
            />
          </>
        ) : (
          <div className="text-muted-foreground text-sm">No actions taken</div>
        )}
      </div>

      {(status === ExecutedRuleStatus.SKIPPED ||
        learnedPatternExcludedRules.length > 0) && (
        <div className="mt-3 space-y-2">
          {status === ExecutedRuleStatus.SKIPPED && (
            <ThreadSkipHint skippedThreadRuleNames={skippedThreadRuleNames} />
          )}
          {learnedPatternExcludedRules.length > 0 && (
            <LearnedPatternExclusionHint
              learnedPatternExcludedRules={learnedPatternExcludedRules}
            />
          )}
        </div>
      )}

      {(!!reasonDisplay.reason ||
        reasonDisplay.actionFailureMessages.length > 0) && (
        <div className="mt-4 space-y-2 bg-muted p-2 rounded-md">
          <div className="font-medium text-sm">
            Reason for choosing this rule:
          </div>
          {!!reasonDisplay.reason && (
            <MessageText className="whitespace-pre-wrap break-words">
              {reasonDisplay.reason}
            </MessageText>
          )}
          {reasonDisplay.actionFailureMessages.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-sm">Action issues:</div>
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700 dark:text-foreground">
                {reasonDisplay.actionFailureMessages.map((message) => (
                  <li key={message} className="break-words">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <RuleDialogComponent />
    </div>
  );
}

function Actions({
  actions,
  provider,
  labels,
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    subject?: string | null;
    cc?: string | null;
    bcc?: string | null;
    url?: string | null;
  }[];
  provider: string;
  labels: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="flex flex-col gap-2 flex-wrap">
      {getVisibleActions(actions).map((action) => {
        const Icon = getActionIcon(action.type);
        const fields = [
          { key: "to", value: action.to },
          { key: "cc", value: action.cc },
          { key: "bcc", value: action.bcc },
          { key: "subject", value: action.subject },
          { key: "content", value: action.content },
          { key: "url", value: action.url },
        ].filter((field) => field.value);

        return (
          <div key={action.id} className="flex flex-col gap-1">
            <Badge
              color={getActionColor(action.type)}
              className="w-fit text-nowrap"
            >
              <Icon className="size-3 mr-1.5" />
              {getActionDisplay(action, provider, labels)}
            </Badge>
            {fields.length > 0 && (
              <div className="ml-1 space-y-0.5 text-sm text-muted-foreground">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="whitespace-pre-wrap break-all"
                  >
                    <span className="font-medium capitalize">{field.key}:</span>{" "}
                    {field.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrettyConditions({
  rule,
}: {
  rule: Pick<
    Rule,
    "from" | "to" | "subject" | "body" | "instructions" | "conditionalOperator"
  >;
}) {
  const conditions: string[] = [];

  // Static conditions - grouped with commas
  const staticConditions: string[] = [];
  if (rule.from) staticConditions.push(`From: ${rule.from}`);
  if (rule.subject) staticConditions.push(`Subject: "${rule.subject}"`);
  if (rule.to) staticConditions.push(`To: ${rule.to}`);
  if (rule.body) staticConditions.push(`Body: "${rule.body}"`);
  if (staticConditions.length) conditions.push(staticConditions.join(", "));

  // AI condition
  if (rule.instructions) conditions.push(rule.instructions);

  const operator =
    rule.conditionalOperator === LogicalOperator.AND ? "AND" : "OR";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conditions.map((condition, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <MutedText>{condition}</MutedText>
          {index < conditions.length - 1 && (
            <Badge color="purple" className="text-xs">
              {operator}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

export function getRuleResultReasonDisplay(reason: string): {
  reason: string;
  actionFailureMessages: string[];
} {
  const actionFailureMessages: string[] = [];
  const reasonLines: string[] = [];

  for (const line of he.decode(reason).split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("Action failures:")) {
      actionFailureMessages.push(
        ...getActionFailureMessages(
          trimmedLine.slice("Action failures:".length),
        ),
      );
    } else {
      reasonLines.push(line);
    }
  }

  return {
    reason: reasonLines.join("\n").trim(),
    actionFailureMessages,
  };
}

function getActionFailureMessages(failures: string): string[] {
  return failures
    .split(",")
    .map((failure) => failure.trim())
    .filter(Boolean)
    .map((failure) => {
      const separatorIndex = failure.indexOf(":");
      if (separatorIndex === -1) return getActionFailureMessage(failure, "");

      return getActionFailureMessage(
        failure.slice(0, separatorIndex),
        failure.slice(separatorIndex + 1),
      );
    });
}

const ACTION_FAILURE_MESSAGES: Partial<
  Record<ActionType, { fallback: string; codes: Record<string, string> }>
> = {
  [ActionType.DRAFT_MESSAGING_CHANNEL]: {
    fallback: "The draft reply action could not be completed.",
    codes: {
      MESSAGING_DELIVERY_FAILED:
        "The draft reply could not be sent to the messaging channel.",
      MISSING_MESSAGING_CHANNEL:
        "The draft reply action needs a messaging channel.",
    },
  },
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: {
    fallback: "The messaging channel notification could not be completed.",
    codes: {
      MESSAGING_DELIVERY_FAILED:
        "The messaging channel notification could not be sent.",
      MISSING_MESSAGING_CHANNEL:
        "The messaging channel notification needs a channel.",
    },
  },
  [ActionType.NOTIFY_SENDER]: {
    fallback: "The sender notification could not be completed.",
    codes: {
      RESEND_NOT_CONFIGURED:
        "The sender notification could not be sent because email sending is not configured.",
      MISSING_SENDER_EMAIL:
        "The sender notification could not be sent because the sender email could not be found.",
      SEND_FAILED: "The sender notification could not be sent.",
    },
  },
};

function getActionFailureMessage(actionType: string, errorCode: string) {
  const entry = ACTION_FAILURE_MESSAGES[actionType as ActionType];
  if (!entry) return "An action could not be completed.";
  return entry.codes[errorCode] ?? entry.fallback;
}
