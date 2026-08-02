import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { capitalCase } from "capital-case";
import he from "he";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import {
  conditionTypesToString,
  describeStaticConditions,
  STATIC_CONDITION_CONNECTOR,
} from "@/utils/condition";
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
import { LearnedPatternsDialog } from "@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import type { LearnedPatternMatch } from "@/utils/ai/choose-rule/types";
import { ConditionType } from "@/utils/config";
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
  // A bare "No match found" reads as "your rules don't cover this", when the
  // real reason is often that thread-only rules never got evaluated. Surface
  // the count on the badge so it doesn't depend on hovering.
  const skippedThreadCount =
    result.selectionMetadata?.skippedThreadRuleNames?.length ?? 0;

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
            ? skippedThreadCount > 0
              ? `No match \u00b7 ${skippedThreadCount} skipped`
              : "No match found"
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
  const learnedPatternMatches = (result.matchReasons ?? []).filter(
    (matchReason): matchReason is LearnedPatternMatch =>
      matchReason.type === ConditionType.LEARNED_PATTERN,
  );

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

      {/* A learned pattern decides deterministically — the AI is never
          consulted, so rerunning returns the same rule until the pattern is
          removed. Without this callout that reads as "retest is broken". */}
      {!!rule && learnedPatternMatches.length > 0 && (
        <div className="mt-2 space-y-2 rounded-md border border-amber-600/40 bg-amber-500/5 p-2.5 text-sm">
          <div>
            Chosen by a learned pattern, not the AI:{" "}
            {learnedPatternMatches.map((match) => (
              <span key={match.groupItem.id} className="font-medium">
                {match.groupItem.type.toLowerCase()}: {match.groupItem.value}
              </span>
            ))}
            . Retesting will keep picking this rule until the pattern is
            removed.
          </div>
          <LearnedPatternsDialog
            ruleId={rule.id}
            groupId={learnedPatternMatches[0].group.id}
            label="Manage learned patterns"
          />
        </div>
      )}
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

      {(skippedThreadRuleNames.length > 0 ||
        learnedPatternExcludedRules.length > 0) && (
        <div className="mt-3 space-y-2">
          {/* Rules can be thread-skipped even when another rule matched, so
              this can't be gated on the SKIPPED status. */}
          {skippedThreadRuleNames.length > 0 && (
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
    | "from"
    | "to"
    | "subject"
    | "body"
    | "instructions"
    | "conditionalOperator"
    | "fromExclude"
    | "toExclude"
    | "subjectExclude"
    | "subjectMatchMode"
  >;
}) {
  // Described by the shared formatter. Hand-rolling this dropped the exclusion
  // flags, so a rule meaning "not from x" rendered as "From: x".
  const staticConditions = describeStaticConditions(rule);
  const operator =
    rule.conditionalOperator === LogicalOperator.AND ? "AND" : "OR";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {staticConditions.map((condition, index) => (
        <div key={condition.field} className="flex items-center gap-1.5">
          <MutedText>{condition.text}</MutedText>
          {index < staticConditions.length - 1 && (
            <Badge color="purple" className="text-xs">
              {STATIC_CONDITION_CONNECTOR}
            </Badge>
          )}
        </div>
      ))}

      {!!rule.instructions && (
        <div className="flex items-center gap-1.5">
          {staticConditions.length > 0 && (
            <Badge color="purple" className="text-xs">
              {operator}
            </Badge>
          )}
          <MutedText>{rule.instructions}</MutedText>
        </div>
      )}
    </div>
  );
}

export function getRuleResultReasonDisplay(reason: string): {
  reason: string;
  actionFailureMessages: string[];
} {
  const actionFailureMessages: string[] = [];
  const reasonLines: string[] = [];

  const plainText = stripHtmlTagsFromReason(he.decode(reason));

  for (const line of plainText.split(/\r?\n/)) {
    const trimmedLine = line.replace(/\s+/g, " ").trim();
    if (trimmedLine.startsWith("Action failures:")) {
      actionFailureMessages.push(
        ...getActionFailureMessages(
          trimmedLine.slice("Action failures:".length),
        ),
      );
    } else {
      reasonLines.push(trimmedLine);
    }
  }

  return {
    reason: reasonLines.join("\n").trim(),
    actionFailureMessages,
  };
}

function stripHtmlTagsFromReason(reason: string) {
  let plainText = "";

  for (let index = 0; index < reason.length; index++) {
    const char = reason[index];
    if (char !== "<") {
      plainText += char;
      continue;
    }

    const tagStart = index + (reason[index + 1] === "/" ? 2 : 1);
    const tagName = readTagName(reason, tagStart);
    if (!tagName) {
      plainText += char;
      continue;
    }

    const tagEnd = reason.indexOf(">", tagStart + tagName.length);
    if (tagEnd === -1) {
      plainText += char;
      continue;
    }

    if (BLOCK_REASON_TAGS.has(tagName)) plainText += " ";
    index = tagEnd;
  }

  return plainText;
}

const BLOCK_REASON_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

function readTagName(value: string, start: number) {
  let tagName = "";

  for (let index = start; index < value.length; index++) {
    const char = value[index]?.toLowerCase();
    if (!char) break;

    const isTagNameChar =
      (char >= "a" && char <= "z") ||
      (tagName.length > 0 && char >= "0" && char <= "9");
    if (!isTagNameChar) break;

    tagName += char;
  }

  return tagName;
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
