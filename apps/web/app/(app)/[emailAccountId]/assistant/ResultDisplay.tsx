import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { capitalCase } from "capital-case";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import { conditionTypesToString } from "@/utils/condition";
import {
  type ActionType,
  ExecutedRuleStatus,
  type Rule,
  LogicalOperator,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { MessageText } from "@/components/Typography";
import { EyeIcon } from "lucide-react";
import { useRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { sortActionsByPriority } from "@/utils/action-sort";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { getActionColor } from "@/components/PlanBadge";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ResultsDisplay({ results }: { results: RunRulesResult[] }) {
  const groupedResults = groupBy(results, (result) => {
    return result.createdAt.toString();
  });

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
          <div className="flex gap-1">
            {batchResults.map((result, resultIndex) => (
              <ResultDisplay key={`${date}-${resultIndex}`} result={result} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultDisplay({ result }: { result: RunRulesResult }) {
  const { rule, status } = result;

  return (
    <HoverCard content={<ResultDisplayContent result={result} />}>
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
            <div className="font-medium text-sm mb-1">Actions taken:</div>
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

      {!!reason && (
        <div className="mt-4 space-y-2 bg-muted p-2 rounded-md">
          <div className="font-medium text-sm">
            Reason for choosing this rule:
          </div>
          <MessageText>{reason}</MessageText>
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
      {sortActionsByPriority(actions).map((action) => {
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
              <div className="ml-1 text-sm text-muted-foreground space-y-0.5">
                {fields.map((field) => (
                  <div key={field.key}>
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
          <span className="text-sm text-muted-foreground">{condition}</span>
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
