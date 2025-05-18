import Link from "next/link";
import type {
  CreateRuleSchema,
  EnableColdEmailBlockerSchema,
  EnableReplyZeroSchema,
  UpdateAboutSchema,
  UpdateRuleSchema,
} from "@/utils/ai/assistant/chat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SparklesIcon, TrashIcon } from "lucide-react";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/automation/Rules";
import { toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";

export function ToolCard({ toolName, args }: { toolName: string; args: any }) {
  switch (toolName) {
    case "create_rule":
      return <CreatedRule args={args as CreateRuleSchema} />;
    case "update_rule":
      return <UpdatedRule args={args as UpdateRuleSchema} />;
    case "update_about":
      return <UpdateAbout args={args as UpdateAboutSchema} />;
    case "enable_cold_email_blocker":
      return (
        <EnableColdEmailBlocker args={args as EnableColdEmailBlockerSchema} />
      );
    case "enable_reply_zero":
      return <EnableReplyZero args={args as EnableReplyZeroSchema} />;
  }
}

function CreatedRule({ args }: { args: CreateRuleSchema }) {
  const conditionsArray = [
    args.condition.aiInstructions,
    args.condition.static,
  ].filter(Boolean);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          <strong>New Rule Created:</strong> {args.name}
        </h3>

        <Tooltip content="Delete Rule">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const yes = confirm("Are you sure you want to delete this rule?");
              if (yes) {
                // deleteRule(args.id);
                toastSuccess({ description: "The rule has been deleted." });
              }
            }}
          >
            <TrashIcon className="size-4" />
          </Button>
        </Tooltip>
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
  return <Card className="p-4">UpdatedRule</Card>;
}

function UpdateAbout({ args }: { args: UpdateAboutSchema }) {
  return <Card className="p-4">UpdateAbout</Card>;
}

function EnableColdEmailBlocker({
  args,
}: {
  args: EnableColdEmailBlockerSchema;
}) {
  return (
    <ToolWithLink href="/cold-email-blocker?tab=settings">
      Cold Email Blocking is now set to {args.action}
    </ToolWithLink>
  );
}

function EnableReplyZero({ args }: { args: EnableReplyZeroSchema }) {
  return (
    <ToolWithLink href="/reply-zero">
      Reply Zero is now {args.enabled ? "enabled" : "disabled"} and draft
      replies are now {args.draft_replies ? "enabled" : "disabled"}
    </ToolWithLink>
  );
}

function ToolWithLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Card className="flex items-center justify-between p-4">
      <p>{children}</p>
      <Button variant="outline" size="sm" asChild>
        <Link href={href} target="_blank">
          View
        </Link>
      </Button>
    </Card>
  );
}
