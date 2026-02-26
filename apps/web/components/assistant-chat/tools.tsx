import { useState } from "react";
import { useQueryState } from "nuqs";
import type {
  UpdateAboutTool,
  UpdateRuleConditionsTool,
  UpdateRuleConditionsOutput,
  UpdateRuleActionsTool,
  UpdateRuleActionsOutput,
  UpdateLearnedPatternsTool,
  AddToKnowledgeBaseTool,
  CreateRuleTool,
  ManageInboxTool,
} from "@/utils/ai/assistant/chat";
import { isDefined } from "@/utils/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronRightIcon,
  EyeIcon,
  SparklesIcon,
  TrashIcon,
  FileDiffIcon,
  ExternalLinkIcon,
  Loader2,
} from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { confirmAssistantEmailAction } from "@/utils/actions/assistant-chat";
import { deleteRuleAction } from "@/utils/actions/rule";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import { ExpandableText } from "@/components/ExpandableText";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { getEmailTerminology } from "@/utils/terminology";
import { formatShortDate } from "@/utils/date";
import { trimToNonEmptyString } from "@/utils/string";
import { getEmailSearchUrl, getEmailUrlForMessage } from "@/utils/url";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export type ThreadLookup = Map<
  string,
  { subject: string; from: string; snippet: string }
>;

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
  return undefined;
}

export function BasicToolInfo({ text }: { text: string }) {
  return (
    <ToolCard>
      <div className="text-sm">{text}</div>
    </ToolCard>
  );
}

function CollapsibleToolCard({
  summary,
  children,
  initialOpen = false,
}: {
  summary: string;
  children: React.ReactNode;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <Card className="p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm">
          <ChevronRightIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          {summary}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-2">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function SearchInboxResult({ output }: { output: unknown }) {
  const totalReturned = getOutputField<number>(output, "totalReturned") || 0;
  const queryUsed = getOutputField<string | null>(output, "queryUsed");
  const summary = getOutputField<{
    total: number;
    unread: number;
    byCategory: Record<string, number>;
  }>(output, "summary");
  const messages = getOutputField<
    Array<{
      messageId: string;
      subject: string;
      from: string;
      snippet: string;
      date: string;
      isUnread: boolean;
    }>
  >(output, "messages");

  return (
    <CollapsibleToolCard summary={`Searched inbox (${totalReturned} messages)`}>
      {queryUsed && (
        <div className="text-xs text-muted-foreground">
          Query: <span className="font-mono">{queryUsed}</span>
        </div>
      )}

      {summary && summary.unread > 0 && (
        <div className="text-xs text-muted-foreground">
          {summary.unread} unread
        </div>
      )}

      {messages && messages.length > 0 && (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.messageId}
              className="rounded-md bg-muted px-3 py-2 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate ${msg.isUnread ? "font-semibold" : ""}`}
                >
                  {msg.from}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatShortDate(new Date(msg.date), { lowercase: true })}
                </span>
              </div>
              <div className="truncate text-muted-foreground">
                {msg.subject}
              </div>
              {msg.snippet && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground/70">
                  {msg.snippet}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleToolCard>
  );
}

export function ManageInboxResult({
  input,
  output,
  threadIds,
  threadLookup,
  isInProgress = false,
}: {
  input?: ManageInboxTool["input"];
  output: unknown;
  threadIds?: string[];
  threadLookup: ThreadLookup;
  isInProgress?: boolean;
}) {
  const { provider, userEmail } = useAccount();
  const outputAction = getOutputField<string>(output, "action");
  const action = parseManageInboxAction(input?.action || outputAction);
  const successCount = getOutputField<number>(output, "successCount");
  const requestedCount = getOutputField<number>(output, "requestedCount");
  const sendersCount = getOutputField<number>(output, "sendersCount");
  const failedCount = getOutputField<number>(output, "failedCount");
  const senders = getOutputField<string[]>(output, "senders");
  const read =
    input?.action === "mark_read_threads"
      ? input.read !== false
      : getOutputField<boolean>(output, "read");
  const labelApplied =
    input?.action === "archive_threads"
      ? Boolean(input.labelId)
      : Boolean(getOutputField<string>(output, "labelId"));
  const actionLabel = getManageInboxActionLabel({
    action,
    read,
    labelApplied,
    inProgress: isInProgress,
  });
  const completedCount =
    action === "bulk_archive_senders"
      ? (sendersCount ?? senders?.length)
      : (successCount ?? requestedCount);
  const countLabel = action === "bulk_archive_senders" ? "sender" : "item";

  const summaryText =
    typeof completedCount === "number"
      ? `${actionLabel} (${completedCount} ${countLabel}${completedCount === 1 ? "" : "s"})`
      : actionLabel;

  const resolvedThreads = threadIds
    ?.map((id) => threadLookup.get(id))
    .filter(isDefined);

  return (
    <CollapsibleToolCard summary={summaryText} initialOpen={isInProgress}>
      <div className="space-y-1 text-sm">
        {isInProgress && (
          <div className="text-xs text-muted-foreground">
            Processing senders now...
          </div>
        )}

        {typeof failedCount === "number" && failedCount > 0 && (
          <div className="text-xs text-red-500">Failed: {failedCount}</div>
        )}

        {resolvedThreads && resolvedThreads.length > 0 && (
          <div className="space-y-1">
            {resolvedThreads.map((thread, i) => (
              <div key={i} className="rounded-md bg-muted px-3 py-2 text-sm">
                <div className="truncate">{thread.from}</div>
                <div className="truncate text-muted-foreground">
                  {thread.subject}
                </div>
              </div>
            ))}
          </div>
        )}

        {senders && senders.length > 0 && (
          <div className="space-y-1">
            {senders.map((sender) => (
              <div
                key={sender}
                className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-xs"
              >
                <span className="truncate">{sender}</span>
                <a
                  href={getEmailSearchUrl(sender, userEmail, provider)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`View ${sender} in ${
                    provider === "microsoft" ? "Outlook" : "Gmail"
                  }`}
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </CollapsibleToolCard>
  );
}

type PendingEmailActionType = "send_email" | "reply_email" | "forward_email";

type EmailConfirmationResult = {
  actionType: PendingEmailActionType;
  messageId?: string | null;
  threadId?: string | null;
  to?: string | null;
  subject?: string | null;
  confirmedAt: string;
};

export function ReadEmailResult({ output }: { output: unknown }) {
  const { provider, userEmail } = useAccount();
  const subject = getOutputField<string>(output, "subject");
  const from = getOutputField<string>(output, "from");
  const to = getOutputField<string>(output, "to");
  const date = getOutputField<string>(output, "date");
  const content = getOutputField<string>(output, "content");
  const messageId = getOutputField<string>(output, "messageId");
  const threadId = getOutputField<string>(output, "threadId");
  const attachments = getOutputField<Array<unknown>>(output, "attachments");
  const externalUrl = getExternalMessageUrl({
    messageId,
    threadId,
    userEmail,
    provider,
  });

  return (
    <CollapsibleToolCard
      summary={`Read email${subject ? `: ${subject}` : ""}`}
      initialOpen={false}
    >
      <div className="space-y-2 text-sm">
        {from && <ToolDetailRow label="From" value={from} />}
        {to && <ToolDetailRow label="To" value={to} />}
        {date && (
          <ToolDetailRow
            label="Date"
            value={formatShortDate(new Date(date), { lowercase: true })}
          />
        )}
        {Array.isArray(attachments) && attachments.length > 0 && (
          <ToolDetailRow
            label="Attachments"
            value={`${attachments.length} file${attachments.length === 1 ? "" : "s"}`}
          />
        )}
        {content && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Content
            </div>
            <div className="rounded-md bg-muted p-2 text-xs">
              <ExpandableText text={content} />
            </div>
          </div>
        )}
        {externalUrl && (
          <ToolExternalLink href={externalUrl}>
            Open in {provider === "microsoft" ? "Outlook" : "Gmail"}
          </ToolExternalLink>
        )}
      </div>
    </CollapsibleToolCard>
  );
}

export function SendEmailResult({
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  output: unknown;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  return (
    <EmailActionResult
      actionType="send_email"
      output={output}
      chatMessageId={chatMessageId}
      toolCallId={toolCallId}
      disableConfirm={disableConfirm}
    />
  );
}

export function ReplyEmailResult({
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  output: unknown;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  return (
    <EmailActionResult
      actionType="reply_email"
      output={output}
      chatMessageId={chatMessageId}
      toolCallId={toolCallId}
      disableConfirm={disableConfirm}
    />
  );
}

export function ForwardEmailResult({
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  output: unknown;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  return (
    <EmailActionResult
      actionType="forward_email"
      output={output}
      chatMessageId={chatMessageId}
      toolCallId={toolCallId}
      disableConfirm={disableConfirm}
    />
  );
}

function EmailActionResult({
  actionType,
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  actionType: PendingEmailActionType;
  output: unknown;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  const { emailAccountId, provider, userEmail } = useAccount();
  const { chatId } = useChat();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationResultOverride, setConfirmationResultOverride] =
    useState<EmailConfirmationResult | null>(null);

  const pendingAction = getOutputField<Record<string, unknown>>(
    output,
    "pendingAction",
  );
  const reference = getOutputField<Record<string, unknown>>(
    output,
    "reference",
  );
  const requiresConfirmation =
    getOutputField<boolean>(output, "requiresConfirmation") === true;
  const confirmationState =
    getOutputField<string>(output, "confirmationState") || "pending";
  const parsedConfirmationResult = parseConfirmationResult(
    getOutputField<unknown>(output, "confirmationResult"),
  );
  const confirmationResult =
    confirmationResultOverride || parsedConfirmationResult;
  const isProcessing = confirmationState === "processing";
  const isChatBusy = disableConfirm;
  const isConfirmed =
    confirmationState === "confirmed" ||
    Boolean(confirmationResult) ||
    (!requiresConfirmation &&
      getOutputField<boolean>(output, "success") === true);

  const to = getPendingOrOutputString({
    pendingAction,
    output,
    key: "to",
  });
  const cc = getPendingString(pendingAction, "cc");
  const bcc = getPendingString(pendingAction, "bcc");
  const from = getPendingString(pendingAction, "from");
  const subject = getPendingOrOutputString({
    pendingAction,
    output,
    key: "subject",
  });
  const referenceFrom = getPendingString(reference, "from");
  const referenceSubject = getPendingString(reference, "subject");
  const displaySubject = subject || referenceSubject;
  const body = getActionBodyText({ actionType, pendingAction });

  const messageId =
    confirmationResult?.messageId ||
    getOutputField<string>(output, "messageId") ||
    getPendingString(reference, "messageId");
  const threadId =
    confirmationResult?.threadId ||
    getOutputField<string>(output, "threadId") ||
    getPendingString(reference, "threadId");
  const externalUrl = getExternalMessageUrl({
    messageId,
    threadId,
    userEmail,
    provider,
  });
  const summary = getEmailActionSummary({
    actionType,
    isConfirmed,
    isProcessing,
    to: confirmationResult?.to || to,
  });

  return (
    <CollapsibleToolCard summary={summary} initialOpen={!isConfirmed}>
      <div className="space-y-2 text-sm">
        {from && <ToolDetailRow label="From" value={from} />}
        {to && <ToolDetailRow label="To" value={to} />}
        {cc && <ToolDetailRow label="CC" value={cc} />}
        {bcc && <ToolDetailRow label="BCC" value={bcc} />}
        {displaySubject && (
          <ToolDetailRow label="Subject" value={displaySubject} />
        )}
        {referenceFrom && actionType !== "send_email" && (
          <ToolDetailRow label="Original From" value={referenceFrom} />
        )}
        {body && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Message
            </div>
            <div className="rounded-md bg-muted p-2 text-xs">
              <div className="break-words whitespace-pre-wrap">{body}</div>
            </div>
          </div>
        )}

        {isConfirmed && confirmationResult?.confirmedAt && (
          <div className="text-xs text-muted-foreground">
            Confirmed{" "}
            {formatShortDate(new Date(confirmationResult.confirmedAt))}
          </div>
        )}

        {(externalUrl || (requiresConfirmation && !isConfirmed)) && (
          <div className="flex flex-wrap items-center gap-2">
            {externalUrl && (
              <ToolExternalLink href={externalUrl}>
                Open in {provider === "microsoft" ? "Outlook" : "Gmail"}
              </ToolExternalLink>
            )}

            {requiresConfirmation && !isConfirmed && (
              <Button
                size="sm"
                className="w-fit"
                disabled={isConfirming || isProcessing || isChatBusy}
                onClick={async () => {
                  setIsConfirming(true);
                  try {
                    if (!chatId) {
                      toastError({
                        description: "Could not confirm this email action.",
                      });
                      return;
                    }

                    const result = await confirmAssistantEmailAction(
                      emailAccountId,
                      {
                        chatId,
                        chatMessageId,
                        toolCallId,
                        actionType,
                      },
                    );

                    if (result?.serverError) {
                      toastError({ description: result.serverError });
                      return;
                    }

                    const confirmationResult = parseConfirmationResult(
                      result?.data?.confirmationResult,
                    );
                    if (!confirmationResult) {
                      toastError({
                        description: "Could not confirm this email action.",
                      });
                      return;
                    }

                    setConfirmationResultOverride(confirmationResult);
                    toastSuccess({
                      description: getAssistantEmailSuccessMessage(actionType),
                    });
                  } catch {
                    toastError({
                      description: "Could not confirm this email action.",
                    });
                  } finally {
                    setIsConfirming(false);
                  }
                }}
              >
                {isProcessing ? (
                  "Sending..."
                ) : isConfirming ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Sending...
                  </>
                ) : isChatBusy ? (
                  "Wait for response..."
                ) : (
                  "Send"
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </CollapsibleToolCard>
  );
}

export function CreatedRuleToolCard({
  args,
  ruleId,
}: {
  args: CreateRuleTool["input"];
  ruleId?: string;
}) {
  const conditionsArray = [
    args.condition.aiInstructions,
    args.condition.static,
  ].filter(Boolean);

  return (
    <ToolCard>
      <ToolCardHeader
        title={
          <>
            {ruleId ? "New rule created:" : "Creating rule:"} {args.name}
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
        <div className="space-y-2">
          {args.actions.map((action, i) => (
            <div key={i} className="rounded-md bg-muted p-2 text-sm">
              <div className="font-medium capitalize">
                {action.type.toLowerCase().replace("_", " ")}
              </div>
              {action.fields && renderActionFields(action.fields)}
            </div>
          ))}
        </div>
      </div>
    </ToolCard>
  );
}

export function UpdatedRuleConditions({
  args,
  ruleId,
  originalConditions,
  updatedConditions,
}: {
  args: UpdateRuleConditionsTool["input"];
  ruleId: string;
  originalConditions?: UpdateRuleConditionsOutput["originalConditions"];
  updatedConditions?: UpdateRuleConditionsOutput["updatedConditions"];
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
    <ToolCard>
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
    </ToolCard>
  );
}

export function UpdatedRuleActions({
  args,
  ruleId,
  originalActions,
  updatedActions,
}: {
  args: UpdateRuleActionsTool["input"];
  ruleId: string;
  originalActions?: UpdateRuleActionsOutput["originalActions"];
  updatedActions?: UpdateRuleActionsOutput["updatedActions"];
}) {
  const { provider } = useAccount();
  const [showChanges, setShowChanges] = useState(false);

  // Check if actions have changed by comparing serialized versions
  const hasChanges =
    originalActions &&
    updatedActions &&
    JSON.stringify(originalActions) !== JSON.stringify(updatedActions);

  const formatActions = <
    T extends { type: string; fields: Record<string, string | null> },
  >(
    actions: T[],
  ) => {
    return actions
      .map((action) => {
        const parts = [`Type: ${action.type}`];
        if (action.fields?.label)
          parts.push(
            `${getEmailTerminology(provider).label.action}: ${action.fields.label}`,
          );
        if (action.fields?.content)
          parts.push(`Content: ${action.fields.content}`);
        if (action.fields?.to) parts.push(`To: ${action.fields.to}`);
        if (action.fields?.cc) parts.push(`CC: ${action.fields.cc}`);
        if (action.fields?.bcc) parts.push(`BCC: ${action.fields.bcc}`);
        if (action.fields?.subject)
          parts.push(`Subject: ${action.fields.subject}`);
        if (action.fields?.webhookUrl || action.fields?.url)
          parts.push(
            `Webhook: ${action.fields.webhookUrl || action.fields.url}`,
          );
        return parts.join(", ");
      })
      .join("\n");
  };

  return (
    <ToolCard>
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
              {actionItem.fields && renderActionFields(actionItem.fields)}
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
    </ToolCard>
  );
}

export function UpdatedLearnedPatterns({
  args,
  ruleId,
}: {
  args: UpdateLearnedPatternsTool["input"];
  ruleId: string;
}) {
  return (
    <ToolCard>
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
    </ToolCard>
  );
}

export function UpdateAbout({ args }: { args: UpdateAboutTool["input"] }) {
  return (
    <ToolCard>
      <ToolCardHeader title={<>Updated About Information</>} />
      <div className="rounded-md bg-muted p-3 text-sm">{args.about}</div>
    </ToolCard>
  );
}

export function AddToKnowledgeBase({
  args,
}: {
  args: AddToKnowledgeBaseTool["input"];
}) {
  const [_, setTab] = useQueryState("tab");

  return (
    <ToolCard>
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
    </ToolCard>
  );
}

function RuleActions({ ruleId }: { ruleId: string }) {
  const { emailAccountId } = useAccount();
  const ruleDialog = useDialogState<{ ruleId: string }>();

  return (
    <>
      {/* Don't use tooltips as they force scroll to bottom */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => ruleDialog.onOpen({ ruleId })}
        >
          <EyeIcon className="size-4" />
        </Button>
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
              } catch {
                toastError({ description: "Failed to delete rule." });
              }
            }
          }}
        >
          <TrashIcon className="size-4" />
        </Button>
      </div>

      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        editMode={false}
      />
    </>
  );
}

function ToolCard({ children }: { children: React.ReactNode }) {
  return <Card className="space-y-3 p-4">{children}</Card>;
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
      <h3 className="font-title text-lg">{title}</h3>
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
  if (!showChanges) return null;

  return (
    <div className="overflow-hidden">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-sm overflow-auto max-h-96">
          {originalText && (
            <div className="mb-2 rounded bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/30 dark:text-red-200 whitespace-pre-wrap break-words overflow-auto max-h-48">
              <span className="mr-2 text-red-500">-</span>
              {originalText}
            </div>
          )}
          {updatedText && (
            <div className="rounded bg-green-50 px-2 py-1 text-green-800 dark:bg-green-950/30 dark:text-green-200 whitespace-pre-wrap break-words overflow-auto max-h-48">
              <span className="mr-2 text-green-500">+</span>
              {updatedText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to render action fields
function renderActionFields(fields: {
  label?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  url?: string | null;
  webhookUrl?: string | null;
}) {
  const fieldEntries = [];

  // Only add fields that have actual values
  if (fields.label) fieldEntries.push(["Label", fields.label]);
  if (fields.subject) fieldEntries.push(["Subject", fields.subject]);
  if (fields.to) fieldEntries.push(["To", fields.to]);
  if (fields.cc) fieldEntries.push(["CC", fields.cc]);
  if (fields.bcc) fieldEntries.push(["BCC", fields.bcc]);
  if (fields.content) fieldEntries.push(["Content", fields.content]);
  if (fields.url || fields.webhookUrl)
    fieldEntries.push(["URL", fields.url || fields.webhookUrl]);

  if (fieldEntries.length === 0) return null;

  return (
    <div className="mt-1">
      <ul className="list-inside list-disc">
        {fieldEntries.map(([key, value]) => (
          <li key={key}>
            {key}:{" "}
            {key === "Content" ? (
              <span className="font-mono text-xs">{value}</span>
            ) : (
              value
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type ManageInboxAction =
  | "archive_threads"
  | "mark_read_threads"
  | "bulk_archive_senders";

function parseManageInboxAction(
  action: string | undefined,
): ManageInboxAction | undefined {
  if (
    action === "archive_threads" ||
    action === "mark_read_threads" ||
    action === "bulk_archive_senders"
  ) {
    return action;
  }

  return undefined;
}

function getManageInboxActionLabel({
  action,
  read,
  labelApplied,
  inProgress,
}: {
  action: ManageInboxAction | undefined;
  read?: boolean;
  labelApplied: boolean;
  inProgress?: boolean;
}) {
  if (action === "bulk_archive_senders") {
    return inProgress ? "Bulk archiving senders" : "Bulk archived senders";
  }
  if (action === "archive_threads") {
    if (inProgress) {
      return labelApplied
        ? "Archiving and labeling emails"
        : "Archiving emails";
    }
    return labelApplied ? "Archived and labeled emails" : "Archived emails";
  }
  if (action === "mark_read_threads") {
    if (inProgress) {
      return read === false
        ? "Marking emails as unread"
        : "Marking emails as read";
    }
    return read === false ? "Marked emails as unread" : "Marked emails as read";
  }
  return "Updated emails";
}

function ToolDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}

function ToolExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {children}
      <ExternalLinkIcon className="size-3.5" />
    </a>
  );
}

function parseConfirmationResult(
  value: unknown,
): EmailConfirmationResult | null {
  if (!isRecord(value)) return null;

  const actionType = asPendingEmailActionType(value.actionType);
  const confirmedAt = asString(value.confirmedAt);
  if (!actionType || !confirmedAt) return null;

  return {
    actionType,
    confirmedAt,
    messageId: asString(value.messageId) || null,
    threadId: asString(value.threadId) || null,
    to: asString(value.to) || null,
    subject: asString(value.subject) || null,
  };
}

function getPendingString(
  source: Record<string, unknown> | undefined,
  key: string,
) {
  if (!source) return undefined;
  return trimToNonEmptyString(source[key]);
}

function getPendingOrOutputString({
  pendingAction,
  output,
  key,
}: {
  pendingAction?: Record<string, unknown>;
  output: unknown;
  key: string;
}) {
  return (
    getPendingString(pendingAction, key) || getOutputField<string>(output, key)
  );
}

function getActionBodyText({
  actionType,
  pendingAction,
}: {
  actionType: PendingEmailActionType;
  pendingAction?: Record<string, unknown>;
}) {
  if (!pendingAction) return undefined;

  if (actionType === "send_email") {
    const messageHtml = getPendingString(pendingAction, "messageHtml");
    if (!messageHtml) return undefined;
    return htmlToText(messageHtml);
  }

  return getPendingString(pendingAction, "content");
}

function getEmailActionSummary({
  actionType,
  isConfirmed,
  isProcessing,
  to,
}: {
  actionType: PendingEmailActionType;
  isConfirmed: boolean;
  isProcessing: boolean;
  to?: string | null;
}) {
  if (isProcessing) {
    if (actionType === "send_email") return "Sending email...";
    if (actionType === "reply_email") return "Sending reply...";
    return "Forwarding email...";
  }

  if (!isConfirmed) {
    if (actionType === "send_email") return "Email ready to send";
    if (actionType === "reply_email") return "Reply ready to send";
    return "Forward ready to send";
  }

  if (actionType === "send_email") return `Sent email${to ? ` to ${to}` : ""}`;
  if (actionType === "reply_email") return "Sent reply";
  return `Forwarded email${to ? ` to ${to}` : ""}`;
}

function getAssistantEmailSuccessMessage(actionType: PendingEmailActionType) {
  if (actionType === "send_email") return "Email sent.";
  if (actionType === "reply_email") return "Reply sent.";
  return "Email forwarded.";
}

function getExternalMessageUrl({
  messageId,
  threadId,
  userEmail,
  provider,
}: {
  messageId?: string;
  threadId?: string;
  userEmail?: string | null;
  provider?: string;
}) {
  const resolvedMessageId = messageId || threadId;
  const resolvedThreadId = threadId || messageId;
  if (!resolvedMessageId || !resolvedThreadId) return null;

  return getEmailUrlForMessage(
    resolvedMessageId,
    resolvedThreadId,
    userEmail,
    provider,
  );
}

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asPendingEmailActionType(
  value: unknown,
): PendingEmailActionType | null {
  if (
    value === "send_email" ||
    value === "reply_email" ||
    value === "forward_email"
  ) {
    return value;
  }
  return null;
}

function asString(value: unknown): string | null {
  return trimToNonEmptyString(value) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
