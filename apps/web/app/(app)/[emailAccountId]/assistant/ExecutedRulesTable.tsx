import Link from "next/link";
import { ExternalLinkIcon, EyeIcon } from "lucide-react";
import type { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ActionBadgeExpanded } from "@/components/PlanBadge";
import { Tooltip } from "@/components/Tooltip";
import { EmailDate } from "@/components/email-list/EmailDate";
import { getEmailUrlForMessage } from "@/utils/url";
import { HoverCard } from "@/components/HoverCard";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { conditionsToString, conditionTypesToString } from "@/utils/condition";
import { MessageText } from "@/components/Typography";
import type { ParsedMessage } from "@/utils/types";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { ExecutedRuleStatus } from "@prisma/client";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";

export function EmailCell({
  message,
  userEmail,
  createdAt,
}: {
  message: ParsedMessage;
  userEmail: string;
  createdAt: Date;
}) {
  const { id: messageId, threadId, headers, snippet } = message;
  const from = headers?.from || "";
  const subject = message.subject || headers?.subject || "";
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{from}</div>
        <DateCell createdAt={createdAt} />
      </div>
      <div className="mt-1 flex items-center font-medium">
        <span>{subject}</span>
        <OpenInGmailButton message={message} userEmail={userEmail} />
        <ViewEmailButton
          threadId={threadId}
          messageId={messageId}
          size="xs"
          className="ml-2"
        />
      </div>
      <div className="mt-1 text-muted-foreground">{decodeSnippet(snippet)}</div>
    </div>
  );
}

export function RuleCell({
  rule,
  status,
  reason,
  message,
  setInput,
}: {
  rule: PlanHistoryResponse["executedRules"][number]["rule"];
  status: ExecutedRuleStatus;
  reason?: string | null;
  message: ParsedMessage;
  setInput: (input: string) => void;
}) {
  const { ruleDialog, RuleDialogComponent } = useRuleDialog();

  return (
    <div className="flex items-center justify-end gap-2">
      <div>
        <HoverCard
          className="w-80"
          content={
            <div>
              <div className="flex justify-between font-medium">
                {rule ? (
                  <>
                    {rule.name}
                    <Badge color="blue">{conditionTypesToString(rule)}</Badge>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    {status === ExecutedRuleStatus.SKIPPED && (
                      <Badge color="yellow">Skipped</Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2">
                {rule ? conditionsToString(rule) : null}
              </div>
              <div className="mt-2">
                {!!rule && (
                  <Button
                    size="sm"
                    onClick={() => {
                      ruleDialog.onOpen({ ruleId: rule.id });
                    }}
                  >
                    View Rule
                  </Button>
                )}
              </div>
              {!!reason && (
                <div className="mt-4 space-y-2 bg-muted p-2 rounded-md">
                  <div className="font-medium">
                    Reason for choosing this rule:
                  </div>
                  <MessageText>{reason}</MessageText>
                </div>
              )}
            </div>
          }
        >
          <Badge color={rule ? "green" : "yellow"}>
            {rule
              ? rule.name
              : status === ExecutedRuleStatus.SKIPPED
                ? "Skipped"
                : `Unknown rule. Status: ${status}`}
            <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
          </Badge>
        </HoverCard>
      </div>
      <FixWithChat
        setInput={setInput}
        message={message}
        result={{ rule, reason }}
      />
      <RuleDialogComponent />
    </div>
  );
}

export function ActionItemsCell({
  actionItems,
  provider,
}: {
  actionItems: PlanHistoryResponse["executedRules"][number]["actionItems"];
  provider: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {actionItems.map((item) => (
        <ActionBadgeExpanded key={item.id} action={item} provider={provider} />
      ))}
    </div>
  );
}

export function DateCell({ createdAt }: { createdAt: Date }) {
  return (
    <div className="whitespace-nowrap">
      <Tooltip content={new Date(createdAt).toLocaleString()}>
        <EmailDate date={new Date(createdAt)} />
      </Tooltip>
    </div>
  );
}

function OpenInGmailButton({
  message,
  userEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
}) {
  const { provider } = useAccount();

  if (!isGoogleProvider(provider)) {
    return null;
  }

  return (
    <Link
      href={getEmailUrlForMessage(message, provider, userEmail)}
      target="_blank"
      className="ml-2 text-muted-foreground hover:text-foreground"
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </Link>
  );
}
