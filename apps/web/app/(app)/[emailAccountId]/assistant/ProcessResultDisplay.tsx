"use client";

import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { capitalCase } from "capital-case";
import { CheckCircle2Icon, EyeIcon, ExternalLinkIcon } from "lucide-react";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import { isAIRule } from "@/utils/condition";
import { ActionType } from "@prisma/client";
import { useRuleDialog } from "./RuleDialog";

export function ProcessResultDisplay({
  results,
  prefix,
}: {
  results: RunRulesResult[];
  prefix?: string;
}) {
  const { ruleDialog, RuleDialogComponent } = useRuleDialog();

  if (!results.length) return null;

  if (results.length === 1 && results[0].rule === null) {
    const result = results[0];
    return (
      <HoverCard
        className="w-auto max-w-3xl"
        content={
          <Alert variant="destructive" className="bg-background">
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

  const handleViewRule = (ruleId: string) => {
    ruleDialog.onOpen({ ruleId });
  };

  const groupedResults = groupBy(results, (result) => {
    return result.createdAt.toString();
  });

  const sortedBatches = sortBy(Object.entries(groupedResults), ([date]) => {
    return -new Date(date).getTime(); // Negative for descending order
  });

  return (
    <div className="flex flex-col gap-2">
      {sortedBatches.map(([date, batchResults]) => (
        <div key={date} className="flex gap-1">
          {batchResults.map((result, resultIndex) => (
            <HoverCard
              key={`${date}-${resultIndex}`}
              className="w-auto max-w-5xl"
              content={
                <ActionSummaryCard
                  result={result}
                  onViewRule={handleViewRule}
                />
              }
            >
              <Badge color="green">
                {prefix ? prefix : ""}
                {result.rule?.name}
                <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
              </Badge>
            </HoverCard>
          ))}
        </div>
      ))}
      <RuleDialogComponent />
    </div>
  );
}

function ActionSummaryCard({
  result,
  onViewRule,
}: {
  result: RunRulesResult;
  onViewRule: (ruleId: string) => void;
}) {
  const MAX_LENGTH = 280;

  const aiGeneratedContent = result.actionItems
    ?.filter((action) => action.type !== ActionType.DIGEST)
    .map((action, i) => (
      <div
        key={i}
        className="space-y-2 rounded-md border border-border bg-muted p-3"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {capitalCase(action.type)}
        </div>
        {Object.entries(action)
          .filter(
            ([key, value]) =>
              value &&
              [
                "label",
                "subject",
                "content",
                "to",
                "cc",
                "bcc",
                "url",
              ].includes(key),
          )
          .map(([key, value]) => (
            <div key={key} className="flex text-sm text-foreground">
              <span className="min-w-16 font-medium text-muted-foreground">
                {capitalCase(key)}:
              </span>
              <span className="ml-2 max-h-40 flex-1 overflow-y-auto">
                {value}
              </span>
            </div>
          ))}
      </div>
    ));

  if (!result.rule) return null;

  return (
    <Alert variant="blue" className="max-w-prose bg-background">
      <CheckCircle2Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        Matched rule "{result.rule.name}"
        <button
          onClick={() => onViewRule(result.rule!.id)}
          className="ml-1.5"
          type="button"
        >
          <span className="sr-only">View rule</span>
          <ExternalLinkIcon className="size-3.5 opacity-70" />
        </button>
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
  );
}
