import { parseAsString, useQueryState, useQueryStates } from "nuqs";
import type {
  CreateRuleSchema,
  UpdateAboutSchema,
  UpdateRuleConditionSchema,
  UpdateRuleActionsSchema,
  UpdateLearnedPatternsSchema,
  AddToKnowledgeBaseSchema,
} from "@/utils/ai/assistant/chat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EyeIcon, SparklesIcon, TrashIcon } from "lucide-react";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/automation/Rules";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { deleteRuleAction } from "@/utils/actions/rule";
import { useAccount } from "@/providers/EmailAccountProvider";
import { ExpandableText } from "@/components/ExpandableText";

export function ToolCard({
  toolName,
  args,
  ruleId,
}: {
  toolName: string;
  args: any;
  ruleId?: string;
}) {
  switch (toolName) {
    case "get_user_rules_and_settings":
      return <BasicInfo text="Read rules and settings" />;
    case "create_rule":
      return <CreatedRule args={args as CreateRuleSchema} ruleId={ruleId} />;
    case "update_rule_conditions":
      return (
        <UpdatedRuleConditions
          args={args as UpdateRuleConditionSchema}
          ruleId={ruleId || ""}
        />
      );
    case "update_rule_actions":
      return (
        <UpdatedRuleActions
          args={args as UpdateRuleActionsSchema}
          ruleId={ruleId || ""}
        />
      );
    case "update_learned_patterns":
      return (
        <UpdatedLearnedPatterns
          args={args as UpdateLearnedPatternsSchema}
          ruleId={ruleId || ""}
        />
      );
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
        {/* <h3 className="text-sm font-medium text-muted-foreground">
          Conditions
        </h3> */}
        <div className="rounded-md bg-muted p-2 text-sm">
          {args.condition.aiInstructions && (
            <div className="flex items-center">
              <SparklesIcon className="mr-2 size-6" />
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

        {/* <div className="space-y-2">
          {args.actions.map((action, i) => (
            <div key={i} className="bg-muted p-2 rounded-md text-sm">
              <div className="font-medium capitalize">
                {action.type.toLowerCase().replace("_", " ")}
              </div>
              {action.fields &&
                Object.entries(action.fields).filter(([_, value]) => value)
                  .length > 0 && (
                  <div className="mt-1">
                    <ul className="list-disc list-inside">
                      {action.fields.label && (
                        <li>Label: {action.fields.label}</li>
                      )}
                      {action.fields.to && <li>To: {action.fields.to}</li>}
                      {action.fields.cc && <li>CC: {action.fields.cc}</li>}
                      {action.fields.bcc && <li>BCC: {action.fields.bcc}</li>}
                      {action.fields.subject && (
                        <li>Subject: {action.fields.subject}</li>
                      )}
                      {action.fields.content && (
                        <li>
                          Content:{" "}
                          <span className="font-mono text-xs">
                            {action.fields.content}
                          </span>
                        </li>
                      )}
                      {action.fields.webhookUrl && (
                        <li>Webhook URL: {action.fields.webhookUrl}</li>
                      )}
                    </ul>
                  </div>
                )}
            </div>
          ))}
        </div> */}
      </div>
    </Card>
  );
}

function UpdatedRuleConditions({
  args,
  ruleId,
}: {
  args: UpdateRuleConditionSchema;
  ruleId: string;
}) {
  const conditionsArray = [
    args.condition.aiInstructions,
    args.condition.static,
  ].filter(Boolean);

  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Updated Conditions</>}
        actions={<RuleActions ruleId={ruleId} />}
      />

      <div className="rounded-md bg-muted p-2 text-sm">
        {args.condition.aiInstructions && (
          <div className="flex items-center">
            <SparklesIcon className="mr-2 size-6" />
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
              {args.condition.static.body && (
                <li>Body: {args.condition.static.body}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function UpdatedRuleActions({
  args,
  ruleId,
}: {
  args: UpdateRuleActionsSchema;
  ruleId: string;
}) {
  return (
    <Card className="space-y-3 p-4">
      <ToolCardHeader
        title={<>Updated Actions</>}
        actions={<RuleActions ruleId={ruleId} />}
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
          size="icon"
          onClick={() => setRuleId({ ruleId, tab: "rule" })}
        >
          <EyeIcon className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Delete Rule">
        <Button
          variant="ghost"
          size="icon"
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
