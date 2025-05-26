import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseAsString, useQueryState, useQueryStates } from "nuqs";
import type {
  CreateRuleSchema,
  UpdateAboutSchema,
  UpdateRuleConditionSchema,
  UpdateRuleActionsSchema,
  UpdateLearnedPatternsSchema,
  AddToKnowledgeBaseSchema,
  UpdateRuleConditionsResult,
  UpdateRuleActionsResult,
} from "@/utils/ai/assistant/chat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EyeIcon, SparklesIcon, TrashIcon, FileDiffIcon } from "lucide-react";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { deleteRuleAction } from "@/utils/actions/rule";
import { useAccount } from "@/providers/EmailAccountProvider";
import { ExpandableText } from "@/components/ExpandableText";

export function ToolCard({
  toolName,
  args,
  ruleId,
  result,
}: {
  toolName: string;
  args: any;
  ruleId?: string;
  result?: any;
}) {
  switch (toolName) {
    case "get_user_rules_and_settings":
      return <BasicInfo text="Read rules and settings" />;
    case "get_learned_patterns":
      return <BasicInfo text={`Read learned patterns for ${args.ruleName}`} />;
    case "create_rule":
      return <CreatedRule args={args as CreateRuleSchema} ruleId={ruleId} />;
    case "update_rule_conditions": {
      const conditionsResult = result as UpdateRuleConditionsResult;
      return (
        <UpdatedRuleConditions
          args={args as UpdateRuleConditionSchema}
          ruleId={ruleId || ""}
          originalConditions={conditionsResult?.originalConditions}
          updatedConditions={conditionsResult?.updatedConditions}
        />
      );
    }
    case "update_rule_actions": {
      const actionsResult = result as UpdateRuleActionsResult;
      return (
        <UpdatedRuleActions
          args={args as UpdateRuleActionsSchema}
          ruleId={ruleId || ""}
          originalActions={actionsResult?.originalActions}
          updatedActions={actionsResult?.updatedActions}
        />
      );
    }
    case "update_learned_patterns": {
      return (
        <UpdatedLearnedPatterns
          args={args as UpdateLearnedPatternsSchema}
          ruleId={ruleId || ""}
        />
      );
    }
    case "update_about":
      return <UpdateAbout args={args as UpdateAboutSchema} />;
    case "add_to_knowledge_base":
      return <AddToKnowledgeBase args={args as AddToKnowledgeBaseSchema} />;
    default:
      return null;
  }
}

function BasicInfo({ text }: { text: string }) {
  return (
    <Card className="p-2">
      <div className="text-sm">{text}</div>
    </Card>
  );
}

function CreatedRule({
  args,
  ruleId,
}: {
  args: CreateRuleSchema;
  ruleId?: string;
}) {
  const conditionsArray = [
    args.condition.aiInstructions,
    args.condition.static,
  ].filter(Boolean);

  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={
          <>
            <strong>{ruleId ? "New rule created:" : "Creating rule:"}</strong>{" "}
            {args.name}
          </>
        }
        actions={ruleId && <RuleActions ruleId={ruleId} />}
      />

      <div className="space-y-2">
        <div className="rounded-md bg-muted p-2 text-sm">
          {args.condition.aiInstructions && (
            <div className="flex items-center">
              <SparklesIcon className="mr-2 size-5" />
              {args.condition.aiInstructions}
            </div>
          )}
          {conditionsArray.length > 1 && (
            <div className="my-2 font-mono text-xs">
              {args.condition.conditionalOperator || "AND"}
            </div>
          )}
          {args.condition.static && (
            <div className="mt-1">
              <span className="font-medium">Static Conditions:</span>
              <ul className="mt-1 list-inside list-disc">
                {args.condition.static.from && (
                  <li>From: {args.condition.static.from}</li>
                )}
                {args.condition.static.to && (
                  <li>To: {args.condition.static.to}</li>
                )}
                {args.condition.static.subject && (
                  <li>Subject: {args.condition.static.subject}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Actions</h3>
        <ActionBadges
          actions={args.actions.map((action, i) => ({
            id: i.toString(),
            type: action.type,
            label: action.fields?.label,
          }))}
        />
      </div>
    </Card>
  );
}

function UpdatedRuleConditions({
  args,
  ruleId,
  originalConditions,
  updatedConditions,
}: {
  args: UpdateRuleConditionSchema;
  ruleId: string;
  originalConditions?: UpdateRuleConditionsResult["originalConditions"];
  updatedConditions?: UpdateRuleConditionsResult["updatedConditions"];
}) {
  const [showChanges, setShowChanges] = useState(false);

  const staticConditions =
    args.condition.static?.from ||
    args.condition.static?.to ||
    args.condition.static?.subject
      ? args.condition.static
      : null;

  const conditionsArray = [
    args.condition.aiInstructions,
    staticConditions,
  ].filter(Boolean);

  const hasChanges =
    originalConditions &&
    updatedConditions &&
    originalConditions.aiInstructions !== updatedConditions.aiInstructions;

  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Updated Conditions</>}
        actions={
          <div className="flex items-center gap-1">
            {hasChanges && (
              <DiffToggleButton
                showChanges={showChanges}
                onToggle={() => setShowChanges(!showChanges)}
              />
            )}
            <RuleActions ruleId={ruleId} />
          </div>
        }
      />

      <div className="rounded-md bg-muted p-2 text-sm">
        {args.condition.aiInstructions && (
          <div className="flex items-center">
            <SparklesIcon className="mr-2 size-5" />
            {args.condition.aiInstructions}
          </div>
        )}
        {conditionsArray.length > 1 && (
          <div className="my-2 font-mono text-xs">
            {args.condition.conditionalOperator || "AND"}
          </div>
        )}
        {args.condition.static && (
          <div className="mt-1">
            <span className="font-medium">Static Conditions:</span>
            <ul className="mt-1 list-inside list-disc">
              {args.condition.static.from && (
                <li>From: {args.condition.static.from}</li>
              )}
              {args.condition.static.to && (
                <li>To: {args.condition.static.to}</li>
              )}
              {args.condition.static.subject && (
                <li>Subject: {args.condition.static.subject}</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {hasChanges && (
        <CollapsibleDiff
          showChanges={showChanges}
          title="Instructions:"
          originalText={originalConditions?.aiInstructions || undefined}
          updatedText={updatedConditions?.aiInstructions || undefined}
        />
      )}
    </Card>
  );
}

function UpdatedRuleActions({
  args,
  ruleId,
  originalActions,
  updatedActions,
}: {
  args: UpdateRuleActionsSchema;
  ruleId: string;
  originalActions?: UpdateRuleActionsResult["originalActions"];
  updatedActions?: UpdateRuleActionsResult["updatedActions"];
}) {
  const [showChanges, setShowChanges] = useState(false);

  // Check if actions have changed by comparing serialized versions
  const hasChanges =
    originalActions &&
    updatedActions &&
    JSON.stringify(originalActions) !== JSON.stringify(updatedActions);

  const formatActions = (actions: any[]) => {
    return actions
      .map((action) => {
        const parts = [`Type: ${action.type}`];
        if (action.fields?.label) parts.push(`Label: ${action.fields.label}`);
        if (action.fields?.content)
          parts.push(`Content: ${action.fields.content}`);
        if (action.fields?.to) parts.push(`To: ${action.fields.to}`);
        if (action.fields?.cc) parts.push(`CC: ${action.fields.cc}`);
        if (action.fields?.bcc) parts.push(`BCC: ${action.fields.bcc}`);
        if (action.fields?.subject)
          parts.push(`Subject: ${action.fields.subject}`);
        if (action.fields?.webhookUrl)
          parts.push(`Webhook: ${action.fields.webhookUrl}`);
        return parts.join(", ");
      })
      .join("\n");
  };

  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Updated Actions</>}
        actions={
          <div className="flex items-center gap-1">
            {hasChanges && (
              <DiffToggleButton
                showChanges={showChanges}
                onToggle={() => setShowChanges(!showChanges)}
              />
            )}
            <RuleActions ruleId={ruleId} />
          </div>
        }
      />

      <div className="space-y-2">
        {args.actions.map((actionItem, i) => {
          if (!actionItem) return null;

          return (
            <div key={i} className="rounded-md bg-muted p-2 text-sm">
              <div className="font-medium capitalize">
                {actionItem.type.toLowerCase().replace("_", " ")}
              </div>
              {actionItem.fields && (
                <div className="mt-1">
                  <ul className="list-inside list-disc">
                    {actionItem.fields.label && (
                      <li>Label: {actionItem.fields.label}</li>
                    )}
                    {actionItem.fields.content && (
                      <li>
                        Content:{" "}
                        <span className="font-mono text-xs">
                          {actionItem.fields.content}
                        </span>
                      </li>
                    )}
                    {actionItem.fields.to && (
                      <li>To: {actionItem.fields.to}</li>
                    )}
                    {actionItem.fields.cc && (
                      <li>CC: {actionItem.fields.cc}</li>
                    )}
                    {actionItem.fields.bcc && (
                      <li>BCC: {actionItem.fields.bcc}</li>
                    )}
                    {actionItem.fields.subject && (
                      <li>Subject: {actionItem.fields.subject}</li>
                    )}
                    {actionItem.fields.webhookUrl && (
                      <li>Webhook URL: {actionItem.fields.webhookUrl}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasChanges && (
        <CollapsibleDiff
          showChanges={showChanges}
          title="Actions:"
          originalText={formatActions(originalActions || [])}
          updatedText={formatActions(updatedActions || [])}
        />
      )}
    </Card>
  );
}

function UpdatedLearnedPatterns({
  args,
  ruleId,
}: {
  args: UpdateLearnedPatternsSchema;
  ruleId: string;
}) {
  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Updated Learned Patterns</>}
        actions={<RuleActions ruleId={ruleId} />}
      />

      <div className="space-y-2">
        {args.learnedPatterns.map((pattern, i) => {
          if (!pattern) return null;

          return (
            <div key={i} className="rounded-md bg-muted p-2 text-sm">
              {pattern.include &&
                Object.values(pattern.include).some(Boolean) && (
                  <div className="mb-1">
                    <span className="font-medium">Include:</span>
                    <ul className="mt-1 list-inside list-disc">
                      {pattern.include.from && (
                        <li>From: {pattern.include.from}</li>
                      )}
                      {pattern.include.subject && (
                        <li>Subject: {pattern.include.subject}</li>
                      )}
                    </ul>
                  </div>
                )}
              {pattern.exclude &&
                Object.values(pattern.exclude).some(Boolean) && (
                  <div>
                    <span className="font-medium">Exclude:</span>
                    <ul className="mt-1 list-inside list-disc">
                      {pattern.exclude.from && (
                        <li>From: {pattern.exclude.from}</li>
                      )}
                      {pattern.exclude.subject && (
                        <li>Subject: {pattern.exclude.subject}</li>
                      )}
                    </ul>
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function UpdateAbout({ args }: { args: UpdateAboutSchema }) {
  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader title={<>Updated About Information</>} />
      <div className="rounded-md bg-muted p-3 text-sm">{args.about}</div>
    </Card>
  );
}

function AddToKnowledgeBase({ args }: { args: AddToKnowledgeBaseSchema }) {
  const [_, setTab] = useQueryState("tab");

  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Added to Knowledge Base</>}
        actions={
          <Button variant="link" onClick={() => setTab("rules")}>
            View Knowledge Base
          </Button>
        }
      />
      <div className="rounded-md bg-muted p-3 text-sm">
        <div className="font-medium">{args.title}</div>
        <ExpandableText text={args.content} />
      </div>
    </Card>
  );
}

function RuleActions({ ruleId }: { ruleId: string }) {
  const { emailAccountId } = useAccount();
  const [_, setRuleId] = useQueryStates({
    tab: parseAsString,
    ruleId: parseAsString,
  });

  return (
    <div className="flex items-center gap-1">
      <Tooltip content="View Rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setRuleId({ ruleId, tab: "rule" })}
        >
          <EyeIcon className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete Rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={async () => {
            const yes = confirm("Are you sure you want to delete this rule?");
            if (yes) {
              try {
                const result = await deleteRuleAction(emailAccountId, {
                  id: ruleId,
                });
                if (result?.serverError) {
                  toastError({ description: result.serverError });
                } else {
                  toastSuccess({
                    description: "The rule has been deleted.",
                  });
                }
              } catch (error) {
                toastError({ description: "Failed to delete rule." });
              }
            }
          }}
        >
          <TrashIcon className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

// Common Components

function ToolCardHeader({
  title,
  actions,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-cal text-lg">{title}</h3>
      {actions}
    </div>
  );
}

function DiffToggleButton({
  showChanges,
  onToggle,
}: {
  showChanges: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip content={showChanges ? "Hide Changes" : "Show Changes"}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggle}
      >
        <FileDiffIcon className="size-4" />
      </Button>
    </Tooltip>
  );
}

function CollapsibleDiff({
  showChanges,
  title,
  originalText,
  updatedText,
}: {
  showChanges: boolean;
  title: string;
  originalText?: string;
  updatedText?: string;
}) {
  return (
    <AnimatePresence>
      {showChanges && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {title}
            </div>
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm">
              {originalText && (
                <div className="mb-2 rounded bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  <span className="mr-2 text-red-500">-</span>
                  {originalText}
                </div>
              )}
              {updatedText && (
                <div className="rounded bg-green-50 px-2 py-1 text-green-800 dark:bg-green-950/30 dark:text-green-200">
                  <span className="mr-2 text-green-500">+</span>
                  {updatedText}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
