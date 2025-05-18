import { parseAsString, useQueryStates } from "nuqs";
import type {
  CreateRuleSchema,
  UpdateAboutSchema,
  UpdateRuleSchema,
} from "@/utils/ai/assistant/chat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EyeIcon, SparklesIcon, TrashIcon } from "lucide-react";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/automation/Rules";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { deleteRuleAction } from "@/utils/actions/rule";
import { useAccount } from "@/providers/EmailAccountProvider";

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
    case "create_rule":
      return <CreatedRule args={args as CreateRuleSchema} ruleId={ruleId} />;
    case "update_rule":
      return <UpdatedRule args={args as UpdateRuleSchema} />;
    case "update_about":
      return <UpdateAbout args={args as UpdateAboutSchema} />;
  }
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

  const [_, setRuleId] = useQueryStates({
    tab: parseAsString,
    ruleId: parseAsString,
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          <strong>{ruleId ? "New rule created:" : "Creating rule:"}</strong>{" "}
          {args.name}
        </h3>

        {ruleId && <RuleActions ruleId={ruleId} />}
      </div>

      <div className="space-y-2">
        {/* <h3 className="text-sm font-medium text-muted-foreground">
          Conditions
        </h3> */}
        <div className="rounded-md bg-muted p-2 text-sm">
          {args.condition.aiInstructions && (
            <div className="flex">
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

function UpdatedRule({ args }: { args: UpdateRuleSchema }) {
  const conditionsArray = [
    args.condition?.aiInstructions,
    args.condition?.static ? "static conditions" : undefined,
  ].filter(Boolean);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          <strong>Updated rule:</strong> {args.ruleName}
        </h3>

        <RuleActions ruleId={args.ruleName} />
      </div>

      {args.condition && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Updated Conditions
          </h3>
          <div className="rounded-md bg-muted p-2 text-sm">
            {args.condition.aiInstructions && (
              <div className="flex">
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
        </div>
      )}

      {args.actions && args.actions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Updated Actions
          </h3>
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
        </div>
      )}

      {args.learnedPatterns && args.learnedPatterns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Updated Learned Patterns
          </h3>
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
        </div>
      )}
    </Card>
  );
}

function UpdateAbout({ args }: { args: UpdateAboutSchema }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          <strong>Updated About Information</strong>
        </h3>
      </div>
      <div className="rounded-md bg-muted p-3 text-sm">{args.about}</div>
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
                await deleteRuleAction(emailAccountId, { id: ruleId });
                toastSuccess({
                  description: "The rule has been deleted.",
                });
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
