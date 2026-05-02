import { useState } from "react";
import { useQueryState } from "nuqs";
import type { AddToKnowledgeBaseTool } from "@/utils/ai/assistant/tools/rules/add-to-knowledge-base-tool";
import type { CreateRuleTool } from "@/utils/ai/assistant/tools/rules/create-rule-tool";
import type { UpdatePersonalInstructionsTool } from "@/utils/ai/assistant/tools/rules/update-personal-instructions-tool";
import type { UpdateLearnedPatternsTool } from "@/utils/ai/assistant/tools/rules/update-learned-patterns-tool";
import type {
  UpdateRuleActionsOutput,
  UpdateRuleActionsTool,
} from "@/utils/ai/assistant/tools/rules/update-rule-actions-tool";
import type {
  UpdateRuleConditionsOutput,
  UpdateRuleConditionsTool,
} from "@/utils/ai/assistant/tools/rules/update-rule-conditions-tool";
import type {
  UpdateRuleOutput,
  UpdateRuleTool,
} from "@/utils/ai/assistant/tools/rules/update-rule-tool";
import type {
  UpdateRuleStateOutput,
  UpdateRuleStateTool,
} from "@/utils/ai/assistant/tools/rules/update-rule-state-tool";
import type { ManageInboxTool } from "@/utils/ai/assistant/chat-inbox-tools";
import { cn } from "@/utils";
import { isDefined } from "@/utils/types";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallbackColor } from "@/components/ui/avatar";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  TrashIcon,
  ExternalLinkIcon,
  Loader2,
  PencilIcon,
  CopyIcon,
  CheckIcon,
  SendIcon,
} from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import {
  confirmAssistantCreateRule,
  confirmAssistantEmailAction,
  confirmAssistantSaveMemory,
} from "@/utils/actions/assistant-chat";
import { deleteRuleAction, toggleRuleAction } from "@/utils/actions/rule";
import { useAction } from "next-safe-action/hooks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import { ExpandableText } from "@/components/ExpandableText";
import {
  EmailLookupProvider,
  type EmailLookup,
} from "@/components/assistant-chat/email-lookup-context";
import { InlineEmailCard } from "@/components/assistant-chat/inline-email-card";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useDialogState } from "@/hooks/useDialogState";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/Badge";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { getActionColor } from "@/components/PlanBadge";
import type { ActionType } from "@/generated/prisma/enums";
import { formatShortDate } from "@/utils/date";
import { trimToNonEmptyString } from "@/utils/string";
import { getEmailSearchUrl, getEmailUrlForOptionalMessage } from "@/utils/url";
import {
  isManageInboxAction,
  type ManageInboxAction,
} from "@/utils/ai/assistant/manage-inbox-actions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RuleSummaryCard,
  RuleSummaryCardHeader,
  RuleSummaryLabel,
  RuleSummaryRow,
} from "@/components/assistant-chat/rule-summary-card";
import { getPendingEmailSubjectPrefix } from "@/components/assistant-chat/helpers";

export type ThreadLookup = EmailLookup;

function getOutputField<T>(output: unknown, field: string): T | undefined {
  if (typeof output === "object" && output !== null && field in output) {
    return (output as Record<string, unknown>)[field] as T;
  }
}

export function BasicToolInfo({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground">{text}</div>;
}

function SubtleToolCollapsible({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md border p-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollapsibleToolCard({
  title,
  badge,
  description,
  children,
  initialOpen = false,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className={cn("px-4 py-3.5", open && "border-b")}>
            <div className="flex items-center gap-3">
              <ChevronRightIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-90",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium leading-snug">{title}</h3>
                  {badge}
                </div>
                {description && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 px-4 py-3.5">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function SearchInboxResult({ output }: { output: unknown }) {
  const error = getOutputField<string | null>(output, "error");
  const queryUsed = getOutputField<string | null>(output, "queryUsed");
  const messages = getOutputField<
    Array<{
      messageId: string;
      threadId: string;
      subject: string;
      from: string;
      snippet: string;
      date: string;
      isUnread: boolean;
    }>
  >(output, "messages");

  return (
    <SubtleToolCollapsible title="Search Inbox">
      {queryUsed && (
        <ToolDetailRow
          label="Query"
          value={<span className="font-mono text-xs">{queryUsed}</span>}
        />
      )}
      {error && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Search results were unavailable for that request.</p>
          <p className="text-xs">{error}</p>
        </div>
      )}
      {messages && messages.length > 0 && <ToolEmailRows emails={messages} />}
    </SubtleToolCollapsible>
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
      ? Boolean(input.label)
      : Boolean(getOutputField<string>(output, "labelId"));
  const actionLabel = getManageInboxActionLabel({
    action,
    read,
    labelApplied,
    inProgress: isInProgress,
  });
  const isSenderAction =
    action === "bulk_archive_senders" || action === "unsubscribe_senders";
  const completedCount = isSenderAction
    ? (sendersCount ?? senders?.length)
    : (successCount ?? requestedCount);
  const countLabel = isSenderAction ? "sender" : "item";

  const resolvedThreads = threadIds
    ? threadIds
        .map((threadId) => {
          const thread = threadLookup.get(threadId);
          if (!thread) return;
          return { threadId, ...thread };
        })
        .filter(isDefined)
    : undefined;

  return (
    <CollapsibleToolCard
      title={actionLabel}
      badge={
        typeof completedCount === "number" ? (
          <Badge
            color={failedCount ? "yellow" : isInProgress ? "blue" : "green"}
            className="text-[10px]"
          >
            {completedCount} {countLabel}
            {completedCount === 1 ? "" : "s"}
          </Badge>
        ) : undefined
      }
      initialOpen={isInProgress}
    >
      {isInProgress && (
        <ToolPanel className="border-blue-200 bg-blue-50/60 text-blue-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
          <div className="text-sm">Processing senders now.</div>
        </ToolPanel>
      )}

      {typeof failedCount === "number" && failedCount > 0 && (
        <ToolPanel className="border-red-200 bg-red-50/60 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          <div className="text-sm">
            Failed on {failedCount} {countLabel}
            {failedCount === 1 ? "" : "s"}.
          </div>
        </ToolPanel>
      )}

      {resolvedThreads && resolvedThreads.length > 0 && (
        <div className="-mx-4 -my-3.5">
          <ToolEmailRows emails={resolvedThreads} />
        </div>
      )}

      {senders && senders.length > 0 && (
        <ToolSection label="Senders">
          <div className="space-y-2">
            {senders.map((sender) => (
              <ToolPanel
                key={sender}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate text-sm text-foreground">
                  {sender}
                </span>
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
              </ToolPanel>
            ))}
          </div>
        </ToolSection>
      )}
    </CollapsibleToolCard>
  );
}

export function ManageSenderCategoryResult({ output }: { output: unknown }) {
  const { provider, userEmail } = useAccount();
  const category = getOutputField<{ id: string | null; name: string }>(
    output,
    "category",
  );
  const sendersCount = getOutputField<number>(output, "sendersCount") ?? 0;
  const senders = getOutputField<string[]>(output, "senders") ?? [];
  const categoryName = category?.name?.trim() || "Category";

  if (senders.length === 0) {
    return (
      <BasicToolInfo text={`No senders to archive in "${categoryName}"`} />
    );
  }

  const hiddenCount = Math.max(sendersCount - senders.length, 0);

  return (
    <CollapsibleToolCard
      title={`Archived "${categoryName}" category`}
      badge={
        <Badge color="green" className="text-[10px]">
          {sendersCount} sender{sendersCount === 1 ? "" : "s"}
        </Badge>
      }
    >
      <ToolSection label="Senders">
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {senders.map((sender) => (
            <ToolPanel
              key={sender}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate text-sm text-foreground">
                {sender}
              </span>
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
            </ToolPanel>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="text-xs text-muted-foreground">
            + {hiddenCount} more sender{hiddenCount === 1 ? "" : "s"} not shown
          </div>
        )}
      </ToolSection>
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
  const externalUrl = getExternalMessageUrl({
    messageId,
    threadId,
    userEmail,
    provider,
  });
  const formattedDate = date
    ? formatShortDate(new Date(date), { lowercase: true })
    : null;

  return (
    <SubtleToolCollapsible title="Read Email">
      <div className="space-y-3 text-sm">
        {(subject || from || to || formattedDate) && (
          <div className="space-y-1">
            {subject && (
              <div className="text-sm font-medium leading-snug text-foreground">
                {subject}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {from && <InlineMetadataItem label="From" value={from} />}
              {to && <InlineMetadataItem label="To" value={to} />}
              {formattedDate && (
                <InlineMetadataItem label="Date" value={formattedDate} />
              )}
            </div>
          </div>
        )}
        {content && (
          <ToolPanel className="text-sm leading-relaxed">
            <ExpandableText text={content} />
          </ToolPanel>
        )}
        {externalUrl && (
          <ToolExternalLink href={externalUrl}>
            Open in {provider === "microsoft" ? "Outlook" : "Gmail"}
          </ToolExternalLink>
        )}
      </div>
    </SubtleToolCollapsible>
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
  const { chatId, persistedMessageIds } = useChat();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationResultOverride, setConfirmationResultOverride] =
    useState<EmailConfirmationResult | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const isPersistedMessage = persistedMessageIds.has(chatMessageId);
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
  const subject = getPendingOrOutputString({
    pendingAction,
    output,
    key: "subject",
  });
  const referenceFrom = getPendingString(reference, "from");
  const recipient =
    to || (actionType === "reply_email" ? referenceFrom : undefined);
  const referenceSubject = getPendingString(reference, "subject");
  const displaySubject = subject || referenceSubject;
  const body = getActionBodyText({ actionType, pendingAction });
  const [editedBody, setEditedBody] = useState(body || "");

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

  const actionLabel = getEmailActionLabel(actionType);
  const recipientInitial = recipient ? recipient.charAt(0).toUpperCase() : "?";
  const providerName = provider === "microsoft" ? "Outlook" : "Gmail";

  const handleCopy = () => {
    navigator.clipboard.writeText(editedBody || body || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    setIsConfirming(true);
    try {
      if (!chatId) {
        toastError({ description: "Could not confirm this email action." });
        return;
      }

      const hasEdits = editedBody && editedBody !== body;
      const input = {
        chatId,
        toolCallId,
        actionType,
        ...(hasEdits ? { contentOverride: editedBody } : {}),
      };

      const result = await confirmAssistantEmailAction(emailAccountId, input);

      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      const parsed = parseConfirmationResult(result?.data?.confirmationResult);
      if (!parsed) {
        toastError({ description: "Could not confirm this email action." });
        return;
      }

      setConfirmationResultOverride(parsed);
      toastSuccess({
        description: getAssistantEmailSuccessMessage(actionType),
      });
    } catch {
      toastError({ description: "Could not confirm this email action." });
    } finally {
      setIsConfirming(false);
    }
  };

  const sentLabel = isConfirmed
    ? getEmailActionSentLabel(actionType)
    : actionLabel;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b px-4 py-3.5">
        <Avatar className="size-8">
          <AvatarFallbackColor content={recipientInitial} className="text-xs" />
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">
            {sentLabel ? `${sentLabel} ` : ""}
            {recipient}
          </div>
          {cc && (
            <div className="mt-0.5 text-xs text-muted-foreground">CC: {cc}</div>
          )}
          {bcc && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              BCC: {bcc}
            </div>
          )}
        </div>
        {isConfirmed && (
          <div className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckIcon className="size-3.5" />
            Sent
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {displaySubject && (
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <FieldLabel>Subject</FieldLabel>
            <span className="truncate text-sm font-medium text-foreground">
              {getPendingEmailSubjectPrefix(actionType)}
              {displaySubject}
            </span>
          </div>
        )}

        <div className="px-4 py-3.5">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="min-h-[140px] resize-y text-sm leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditedBody(body || "");
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setIsEditing(false)}>
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {editedBody || body}
            </div>
          )}
        </div>
      </CardContent>

      {!isEditing && (
        <CardFooter className="flex items-center justify-between border-t px-4 py-3">
          <div className="flex items-center gap-1">
            {!isConfirmed && requiresConfirmation && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={() => setIsEditing(true)}
              >
                <PencilIcon className="size-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 gap-1.5 text-xs ${
                copied ? "text-green-600" : "text-muted-foreground"
              }`}
              onClick={handleCopy}
            >
              {copied ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              <span className="hidden sm:inline">
                {copied ? "Copied" : "Copy"}
              </span>
            </Button>
            {externalUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                asChild
              >
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-3.5" />
                  <span className="hidden sm:inline">
                    Open in {providerName}
                  </span>
                </a>
              </Button>
            )}
          </div>

          {!isConfirmed && requiresConfirmation && (
            <Button
              onClick={handleSend}
              disabled={isConfirming || isProcessing || isChatBusy}
              size="sm"
              className="gap-2"
            >
              {isProcessing ? (
                "Sending..."
              ) : isConfirming ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : !isPersistedMessage ? (
                "Saving..."
              ) : (
                <>
                  <SendIcon className="hidden size-3.5 sm:inline" />
                  Send
                </>
              )}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export function CreatedRuleToolCard({
  args,
  ruleId,
  preview,
}: {
  args: CreateRuleTool["input"];
  ruleId?: string;
  preview?: boolean;
}) {
  const conditionText = buildConditionText(args.condition);

  return (
    <RuleSummaryCard
      title={args.name}
      actions={
        <>
          {ruleId && <RuleActions ruleId={ruleId} />}
          {preview && <RuleActionsPreview />}
        </>
      }
    >
      <RuleSummaryRow label="When">
        <p>{conditionText}</p>
      </RuleSummaryRow>

      <RuleSummaryRow label="Then">
        <ActionBadgeList actions={args.actions} />
      </RuleSummaryRow>
    </RuleSummaryCard>
  );
}

export function PendingCreateRuleToolCard({
  args,
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  args: CreateRuleTool["input"];
  output: unknown;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { chatId } = useChat();
  const [isConfirming, setIsConfirming] = useState(false);
  const [ruleIdOverride, setRuleIdOverride] = useState<string | null>(null);

  const riskMessages =
    getOutputField<string[]>(output, "riskMessages")?.filter(Boolean) ?? [];
  const confirmationState =
    getOutputField<string>(output, "confirmationState") || "pending";
  const isProcessing = confirmationState === "processing";
  const ruleIdFromOutput = getOutputField<string>(output, "ruleId");
  const ruleId = ruleIdOverride || ruleIdFromOutput;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      if (!chatId) {
        toastError({ description: "Could not create this rule." });
        return;
      }

      const input = { chatId, chatMessageId, toolCallId };
      const result = await confirmAssistantCreateRule(emailAccountId, input);

      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      const createdId = result?.data?.ruleId;
      if (!createdId) {
        toastError({ description: "Could not create this rule." });
        return;
      }

      setRuleIdOverride(createdId);
      toastSuccess({ description: "Rule created and enabled." });
    } catch {
      toastError({ description: "Could not create this rule." });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <PendingCreateRuleCardContent
      args={args}
      disableConfirm={disableConfirm}
      isConfirming={isConfirming}
      isProcessing={isProcessing}
      onConfirm={handleConfirm}
      riskMessages={riskMessages}
      ruleId={ruleId}
    />
  );
}

export function PendingCreateRulePreviewCard({
  args,
  riskMessages,
}: {
  args: CreateRuleTool["input"];
  riskMessages: string[];
}) {
  return (
    <PendingCreateRuleCardContent
      args={args}
      disableConfirm
      isConfirming={false}
      isProcessing={false}
      onConfirm={() => {}}
      riskMessages={riskMessages}
    />
  );
}

export function PendingSaveMemoryToolCard({
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
  const { emailAccountId } = useAccount();
  const { chatId } = useChat();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedAtOverride, setConfirmedAtOverride] = useState<string | null>(
    null,
  );
  const [deduplicatedOverride, setDeduplicatedOverride] = useState<
    boolean | null
  >(null);

  const content = getOutputField<string>(output, "content") || "";
  const reason = getOutputField<string>(output, "reason");
  const requiresConfirmation =
    getOutputField<boolean>(output, "requiresConfirmation") === true;
  const confirmationState =
    getOutputField<string>(output, "confirmationState") || "pending";
  const confirmationResult = getOutputField<Record<string, unknown>>(
    output,
    "confirmationResult",
  );
  const isProcessing = confirmationState === "processing";
  const confirmedAt =
    confirmedAtOverride ||
    (typeof confirmationResult?.confirmedAt === "string"
      ? confirmationResult.confirmedAt
      : null);
  const deduplicated =
    deduplicatedOverride ??
    (typeof confirmationResult?.deduplicated === "boolean"
      ? confirmationResult.deduplicated
      : false);
  const isConfirmed = confirmationState === "confirmed" || Boolean(confirmedAt);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      if (!chatId) {
        toastError({ description: "Could not save this memory." });
        return;
      }

      const input = { chatId, chatMessageId, toolCallId };
      const result = await confirmAssistantSaveMemory(emailAccountId, input);

      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      const confirmationResult = result?.data?.confirmationResult;
      if (!confirmationResult?.confirmedAt) {
        toastError({ description: "Could not save this memory." });
        return;
      }

      setConfirmedAtOverride(confirmationResult.confirmedAt);
      setDeduplicatedOverride(Boolean(confirmationResult.deduplicated));
      toastSuccess({
        description: confirmationResult.deduplicated
          ? "Memory was already saved."
          : "Memory saved.",
      });
    } catch {
      toastError({ description: "Could not save this memory." });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Save memory</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isConfirmed
                ? deduplicated
                  ? "Already saved in memory"
                  : "Saved for future conversations"
                : "Pending confirmation"}
            </p>
          </div>
          {confirmedAt && (
            <Badge color={deduplicated ? "gray" : "green"} className="text-xs">
              {deduplicated ? "Already saved" : "Saved"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 py-3.5">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          {content}
        </div>
        {reason && !isConfirmed && (
          <p className="text-xs text-muted-foreground">{reason}</p>
        )}
      </CardContent>

      {!isConfirmed && requiresConfirmation && (
        <CardFooter className="justify-end border-t px-4 py-3">
          <Button
            onClick={handleConfirm}
            disabled={disableConfirm || isConfirming || isProcessing}
            size="sm"
            className="gap-2"
          >
            {isProcessing ? (
              "Saving..."
            ) : isConfirming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Confirm save"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function PendingCreateRuleCardContent({
  args,
  disableConfirm,
  isConfirming,
  isProcessing,
  onConfirm,
  riskMessages,
  ruleId,
}: {
  args: CreateRuleTool["input"];
  disableConfirm: boolean;
  isConfirming: boolean;
  isProcessing: boolean;
  onConfirm: () => void;
  riskMessages: string[];
  ruleId?: string;
}) {
  if (ruleId) {
    return <CreatedRuleToolCard args={args} ruleId={ruleId} />;
  }

  return (
    <div className="space-y-3">
      <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangleIcon className="size-4 text-amber-600" />
        <AlertTitle>Review before enabling</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            This rule can send email automatically. Review it before enabling.
          </p>
          {riskMessages.length === 1 ? (
            <p className="text-muted-foreground">{riskMessages[0]}</p>
          ) : riskMessages.length > 1 ? (
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              {riskMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      </Alert>

      <CreatedRuleToolCard args={args} preview />

      <div className="flex justify-end">
        <Button
          onClick={onConfirm}
          disabled={isConfirming || isProcessing || disableConfirm}
          size="sm"
          className="gap-2"
        >
          {isProcessing ? (
            "Creating..."
          ) : isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create & enable rule"
          )}
        </Button>
      </div>
    </div>
  );
}

export function UpdatedRuleConditions({
  args,
  ruleId,
  originalConditions,
  updatedConditions,
  actions,
  preview,
}: {
  args: UpdateRuleConditionsTool["input"];
  ruleId: string;
  originalConditions?: UpdateRuleConditionsOutput["originalConditions"];
  updatedConditions?: UpdateRuleConditionsOutput["updatedConditions"];
  actions?: Array<{ type: string; fields?: RuleActionFields | null }>;
  preview?: boolean;
}) {
  const hasChanges =
    originalConditions &&
    updatedConditions &&
    originalConditions.aiInstructions !== updatedConditions.aiInstructions;

  const conditionText = buildConditionText(args.condition);

  return (
    <Card>
      <RuleToolCardHeader
        title={args.ruleName}
        actions={
          preview ? <RuleActionsPreview /> : <RuleActions ruleId={ruleId} />
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        <div className="flex gap-4 text-sm">
          <FieldLabel className="pt-0.5">When</FieldLabel>
          <p>{conditionText}</p>
        </div>

        {actions && actions.length > 0 && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">Then</FieldLabel>
            <ActionBadgeList actions={actions} />
          </div>
        )}

        {hasChanges && (
          <ViewChangesCollapsible>
            <CollapsibleDiffContent
              title="Instructions:"
              originalText={originalConditions?.aiInstructions || undefined}
              updatedText={updatedConditions?.aiInstructions || undefined}
            />
          </ViewChangesCollapsible>
        )}
      </CardContent>
    </Card>
  );
}

export function UpdatedRuleActions({
  args,
  ruleId,
  originalActions,
  updatedActions,
  condition,
  preview,
}: {
  args: UpdateRuleActionsTool["input"];
  ruleId: string;
  originalActions?: UpdateRuleActionsOutput["originalActions"];
  updatedActions?: UpdateRuleActionsOutput["updatedActions"];
  condition?: {
    aiInstructions?: string | null;
    static?: {
      from?: string | null;
      to?: string | null;
      subject?: string | null;
    } | null;
    conditionalOperator?: string | null;
  };
  preview?: boolean;
}) {
  const hasChanges =
    originalActions &&
    updatedActions &&
    JSON.stringify(originalActions) !== JSON.stringify(updatedActions);

  const conditionText = condition ? buildConditionText(condition) : null;

  return (
    <Card>
      <RuleToolCardHeader
        title={args.ruleName}
        actions={
          preview ? <RuleActionsPreview /> : <RuleActions ruleId={ruleId} />
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        {conditionText && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">When</FieldLabel>
            <p>{conditionText}</p>
          </div>
        )}

        <div className="flex gap-4 text-sm">
          <FieldLabel className="pt-0.5">Then</FieldLabel>
          <ActionBadgeList actions={args.actions} />
        </div>

        {hasChanges && (
          <ViewChangesCollapsible>
            <CollapsibleDiffContent
              title="Actions:"
              originalText={formatActionsForDiff(originalActions || [])}
              updatedText={formatActionsForDiff(updatedActions || [])}
            />
          </ViewChangesCollapsible>
        )}
      </CardContent>
    </Card>
  );
}

export function UpdatedRule({
  args,
  output,
  preview,
}: {
  args: UpdateRuleTool["input"];
  output: UpdateRuleOutput;
  preview?: boolean;
}) {
  const ruleId = output.ruleId;
  const title = output.updatedName || args.updates.name || args.ruleName;
  const conditionText = args.updates.condition
    ? buildConditionText(args.updates.condition)
    : null;
  const actions = args.updates.actions;

  return (
    <Card>
      <RuleToolCardHeader
        title={title}
        actions={
          preview ? (
            <RuleActionsPreview />
          ) : ruleId ? (
            <RuleActions ruleId={ruleId} />
          ) : null
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        {args.updates.name && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">Name</FieldLabel>
            <p>{args.updates.name}</p>
          </div>
        )}

        {conditionText && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">When</FieldLabel>
            <p>{conditionText}</p>
          </div>
        )}

        {args.updates.enabled !== undefined && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">Status</FieldLabel>
            <p>{args.updates.enabled ? "Enabled" : "Disabled"}</p>
          </div>
        )}

        {actions && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">Then</FieldLabel>
            <ActionBadgeList actions={actions} />
          </div>
        )}

        {output.originalName &&
          output.updatedName &&
          output.originalName !== output.updatedName && (
            <ViewChangesCollapsible>
              <CollapsibleDiffContent
                title="Name:"
                originalText={output.originalName}
                updatedText={output.updatedName}
              />
            </ViewChangesCollapsible>
          )}
      </CardContent>
    </Card>
  );
}

export function UpdatedLearnedPatterns({
  args,
  ruleId,
  preview,
}: {
  args: UpdateLearnedPatternsTool["input"];
  ruleId: string;
  preview?: boolean;
}) {
  const actions = preview ? (
    <Tooltip content="Edit rule">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground"
      >
        <PencilIcon className="size-4" />
      </Button>
    </Tooltip>
  ) : (
    <LearnedPatternsActions ruleId={ruleId} />
  );

  return (
    <Card>
      <RuleToolCardHeader title={args.ruleName} actions={actions} />

      <CardContent className="space-y-3 px-4 py-3.5">
        {args.learnedPatterns.map((pattern, i) => {
          if (!pattern) return null;
          const includeParts = formatPatternParts(pattern.include);
          const excludeParts = formatPatternParts(pattern.exclude);
          if (!includeParts && !excludeParts) return null;

          return (
            <ToolPanel key={i} className="space-y-2">
              {includeParts && (
                <ToolDetailRow label="Include" value={includeParts} />
              )}
              {excludeParts && (
                <ToolDetailRow label="Exclude" value={excludeParts} />
              )}
            </ToolPanel>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function UpdatedRuleState({
  args,
  output,
  preview,
}: {
  args: UpdateRuleStateTool["input"];
  output: UpdateRuleStateOutput;
  preview?: boolean;
}) {
  const ruleId = output.ruleId;
  const ruleName = output.ruleName || args.ruleName;
  const enabled = output.enabled ?? args.operation === "enable";
  const label = enabled ? "Enabled" : "Disabled";

  return (
    <Card>
      <RuleToolCardHeader
        title={ruleName}
        actions={
          preview ? (
            <RuleActionsPreview enabled={enabled} />
          ) : ruleId ? (
            <RuleActions ruleId={ruleId} initialEnabled={enabled} />
          ) : null
        }
      />
      <CardContent className="space-y-3 px-4 py-3.5">
        <div className="flex items-center gap-2 text-sm">
          <FieldLabel>Status</FieldLabel>
          <Badge color={enabled ? "green" : "gray"}>{label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function PendingDeleteRuleToolCard({
  args,
  output,
  disableConfirm,
}: {
  args: UpdateRuleStateTool["input"];
  output: UpdateRuleStateOutput;
  disableConfirm: boolean;
}) {
  const { emailAccountId } = useAccount();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(
    output.confirmationState === "confirmed",
  );
  const ruleId = output.ruleId;
  const ruleName = output.ruleName || args.ruleName;
  const wasEnabled = output.wasEnabled ?? true;

  const handleDelete = async () => {
    if (!ruleId) {
      toastError({ description: "Could not delete this rule." });
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteRuleAction(emailAccountId, { id: ruleId });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      setDeleted(true);
      toastSuccess({ description: "The rule has been deleted." });
    } catch {
      toastError({ description: "Failed to delete rule." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-4 py-3.5">
        <TrashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{ruleName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {deleted ? "Deleted rule" : "Pending deletion"}
          </p>
        </div>
        {deleted && (
          <Badge color="green" className="shrink-0">
            Deleted
          </Badge>
        )}
        {!deleted && ruleId && (
          <RuleEditToggleActions ruleId={ruleId} initialEnabled={wasEnabled} />
        )}
      </CardHeader>

      {!deleted && (
        <CardContent className="space-y-3 px-4 py-3.5">
          <Alert
            variant="default"
            className="border-amber-500/40 bg-amber-500/5"
          >
            <AlertTriangleIcon className="size-4 text-amber-600" />
            <AlertTitle>Confirm rule deletion</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              This will permanently delete the rule and its actions.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={disableConfirm || isDeleting || !ruleId}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete rule"
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function PendingDeleteRulePreviewCard({
  args,
  output,
}: {
  args: UpdateRuleStateTool["input"];
  output: UpdateRuleStateOutput;
}) {
  const deleted = output.confirmationState === "confirmed";
  const ruleName = output.ruleName || args.ruleName;
  const wasEnabled = output.wasEnabled ?? true;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-4 py-3.5">
        <TrashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{ruleName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {deleted ? "Deleted rule" : "Pending deletion"}
          </p>
        </div>
        {deleted && (
          <Badge color="green" className="shrink-0">
            Deleted
          </Badge>
        )}
        {!deleted && <RuleEditToggleActionsPreview enabled={wasEnabled} />}
      </CardHeader>

      {!deleted && (
        <CardContent className="space-y-3 px-4 py-3.5">
          <Alert
            variant="default"
            className="border-amber-500/40 bg-amber-500/5"
          >
            <AlertTriangleIcon className="size-4 text-amber-600" />
            <AlertTitle>Confirm rule deletion</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              This will permanently delete the rule and its actions.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button variant="destructive" size="sm" disabled>
              Delete rule
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function UpdatePersonalInstructions({
  args,
}: {
  args: UpdatePersonalInstructionsTool["input"];
}) {
  return (
    <ExpandedToolCard title="Updated Personal Instructions">
      <ToolPanel className="text-sm leading-relaxed">
        {args.personalInstructions}
      </ToolPanel>
    </ExpandedToolCard>
  );
}

export function AddToKnowledgeBase({
  args,
}: {
  args: AddToKnowledgeBaseTool["input"];
}) {
  const [_, setTab] = useQueryState("tab");

  return (
    <ExpandedToolCard
      title="Added to Knowledge Base"
      actions={
        <div className="self-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setTab("rules")}
          >
            View Knowledge Base
          </Button>
        </div>
      }
    >
      <ToolDetailRow label="Title" value={args.title} />
      <ToolSection label="Content">
        <ToolPanel className="text-sm leading-relaxed">
          <ExpandableText text={args.content} />
        </ToolPanel>
      </ToolSection>
    </ExpandedToolCard>
  );
}

function RuleActions({
  ruleId,
  initialEnabled = true,
}: {
  ruleId: string;
  initialEnabled?: boolean;
}) {
  const { emailAccountId } = useAccount();

  return (
    <div className="flex items-center gap-1.5">
      <RuleEditToggleActions ruleId={ruleId} initialEnabled={initialEnabled} />
      <Tooltip content="Delete rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
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
      </Tooltip>
    </div>
  );
}

function RuleEditToggleActions({
  ruleId,
  initialEnabled = true,
}: {
  ruleId: string;
  initialEnabled?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const ruleDialog = useDialogState<{ ruleId: string }>();
  const [enabled, setEnabled] = useState(initialEnabled);
  const { executeAsync: toggleRule } = useAction(
    toggleRuleAction.bind(null, emailAccountId),
  );

  return (
    <>
      <Tooltip content="Edit rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
          onClick={() => ruleDialog.onOpen({ ruleId })}
        >
          <PencilIcon className="size-4" />
        </Button>
      </Tooltip>
      <Switch
        checked={enabled}
        onCheckedChange={async (checked) => {
          setEnabled(checked);
          try {
            const result = await toggleRule({ ruleId, enabled: checked });
            if (result?.serverError) {
              setEnabled(!checked);
              toastError({
                description: `Failed to ${checked ? "enable" : "disable"} rule.`,
              });
            }
          } catch {
            setEnabled(!checked);
            toastError({
              description: `Failed to ${checked ? "enable" : "disable"} rule.`,
            });
          }
        }}
      />

      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        editMode={true}
      />
    </>
  );
}

function RuleActionsPreview({ enabled = true }: { enabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <RuleEditToggleActionsPreview enabled={enabled} />
      <Tooltip content="Delete rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
        >
          <TrashIcon className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

function RuleEditToggleActionsPreview({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  return (
    <>
      <Tooltip content="Edit rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
        >
          <PencilIcon className="size-4" />
        </Button>
      </Tooltip>
      <Switch checked={enabled} />
    </>
  );
}

function LearnedPatternsActions({ ruleId }: { ruleId: string }) {
  const ruleDialog = useDialogState<{ ruleId: string }>();

  return (
    <>
      <Tooltip content="Edit rule">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
          onClick={() => ruleDialog.onOpen({ ruleId })}
        >
          <PencilIcon className="size-4" />
        </Button>
      </Tooltip>

      <RuleDialog
        ruleId={ruleDialog.data?.ruleId}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        editMode={true}
      />
    </>
  );
}

function RuleToolCardHeader({
  title,
  actions,
}: {
  title: string;
  actions: React.ReactNode;
}) {
  return <RuleSummaryCardHeader title={title} actions={actions} />;
}

function ExpandedToolCard({
  title,
  badge,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-tight">{title}</h3>
            {badge}
          </div>
          {description && (
            <div className="mt-1 text-xs text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-3 border-t px-4 py-3.5">
        {children}
      </CardContent>
    </Card>
  );
}

function ViewChangesCollapsible({ children }: { children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ChevronRightIcon className="size-4 transition-transform [[data-state=open]>&]:rotate-90" />
        View changes
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CollapsibleDiffContent({
  title,
  originalText,
  updatedText,
}: {
  title: string;
  originalText?: string;
  updatedText?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-sm">
        {originalText && (
          <div className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/30 dark:text-red-200">
            <span className="mr-2 text-red-500">-</span>
            {originalText}
          </div>
        )}
        {updatedText && (
          <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-green-50 px-2 py-1 text-green-800 dark:bg-green-950/30 dark:text-green-200">
            <span className="mr-2 text-green-500">+</span>
            {updatedText}
          </div>
        )}
      </div>
    </div>
  );
}

function parseManageInboxAction(
  action: string | undefined,
): ManageInboxAction | undefined {
  return isManageInboxAction(action) ? action : undefined;
}

export function getManageInboxActionLabel({
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
  if (action === "unsubscribe_senders") {
    return inProgress ? "Unsubscribing senders" : "Unsubscribed senders";
  }
  if (action === "archive_threads") {
    if (inProgress) {
      return labelApplied
        ? "Archiving and labeling emails"
        : "Archiving emails";
    }
    return labelApplied ? "Archived and labeled emails" : "Archived emails";
  }
  if (action === "trash_threads") {
    return inProgress ? "Trashing emails" : "Trashed emails";
  }
  if (action === "label_threads") {
    return inProgress ? "Labeling emails" : "Labeled emails";
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

function ToolSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function ToolPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border bg-muted/20 p-3", className)}>
      {children}
    </div>
  );
}

function ToolDetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 text-sm">
      <FieldLabel className="w-20 pt-0.5">{label}</FieldLabel>
      <div className="min-w-0 flex-1 text-foreground">{value}</div>
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

function InlineMetadataItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <span className="text-foreground/80">{value}</span>
    </span>
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
  if (!source) return;
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
  if (!pendingAction) return;

  if (actionType === "send_email") {
    const messageHtml = getPendingString(pendingAction, "messageHtml");
    if (!messageHtml) return;
    return htmlToText(messageHtml);
  }

  return getPendingString(pendingAction, "content");
}

function getEmailActionLabel(actionType: PendingEmailActionType) {
  if (actionType === "reply_email") return "Reply to";
  if (actionType === "forward_email") return "Forward to";
  return "";
}

function getEmailActionSentLabel(actionType: PendingEmailActionType) {
  if (actionType === "send_email") return "Sent email to";
  if (actionType === "reply_email") return "Replied to";
  return "Forwarded to";
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
  return getEmailUrlForOptionalMessage({
    messageId,
    threadId,
    emailAddress: userEmail,
    provider,
  });
}

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[<>]/g, "")
    .replace(/ {2,}/g, " ")
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

type RuleActionFields = {
  label?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  webhookUrl?: string | null;
};

function ActionBadgeList({
  actions,
}: {
  actions: Array<{ type: string; fields?: RuleActionFields | null }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action, i) => {
        if (!action) return null;
        const Icon = getActionIcon(action.type as ActionType);
        return (
          <Badge
            key={i}
            color={getActionColor(action.type as ActionType)}
            className="w-fit shrink-0"
          >
            <Icon className="mr-1.5 size-3" />
            {getActionDisplay(
              {
                type: action.type as ActionType,
                label: action.fields?.label,
                to: action.fields?.to,
                content: action.fields?.content,
              },
              "",
              [],
            )}
          </Badge>
        );
      })}
    </div>
  );
}

function formatPatternParts(
  pattern: { from?: string | null; subject?: string | null } | null | undefined,
): string | null {
  if (!pattern) return null;
  const parts = [
    pattern.from && `From: ${pattern.from}`,
    pattern.subject && `Subject: ${pattern.subject}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ToolEmailRow = {
  threadId: string;
  messageId: string;
  from: string;
  subject: string;
  snippet?: string;
  date: string;
  isUnread: boolean;
};

function ToolEmailRows({ emails }: { emails: ToolEmailRow[] }) {
  const seenThreadIds = new Set<string>();
  const uniqueEmails = emails.filter((email) => {
    if (seenThreadIds.has(email.threadId)) return false;
    seenThreadIds.add(email.threadId);
    return true;
  });

  const lookup: EmailLookup = new Map(
    uniqueEmails.map((email) => [
      email.threadId,
      {
        messageId: email.messageId,
        from: email.from,
        subject: email.subject,
        snippet: email.snippet || "",
        date: email.date,
        isUnread: email.isUnread,
      },
    ]),
  );

  return (
    <EmailLookupProvider value={lookup}>
      <div className="overflow-hidden">
        {uniqueEmails.map((email) => (
          <InlineEmailCard key={email.threadId} threadid={email.threadId} />
        ))}
      </div>
    </EmailLookupProvider>
  );
}

function buildConditionText(condition: {
  aiInstructions?: string | null;
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
  } | null;
  conditionalOperator?: string | null;
}): string {
  const parts: string[] = [];
  if (condition.aiInstructions) parts.push(condition.aiInstructions);
  if (condition.static) {
    const s = condition.static;
    const staticParts = [
      s.from && `From: ${s.from}`,
      s.to && `To: ${s.to}`,
      s.subject && `Subject: ${s.subject}`,
    ].filter(Boolean);
    if (staticParts.length > 0) parts.push(staticParts.join(", "));
  }
  return parts.join(` ${condition.conditionalOperator || "AND"} `);
}

function formatActionsForDiff(
  actions: Array<{ type: string; fields: Record<string, string | null> }>,
): string {
  return actions
    .map((action) => {
      const parts = [action.type];
      if (action.fields?.label) parts.push(`Label: ${action.fields.label}`);
      if (action.fields?.to) parts.push(`To: ${action.fields.to}`);
      if (action.fields?.content)
        parts.push(`Content: ${action.fields.content}`);
      if (action.fields?.webhookUrl)
        parts.push(`Webhook: ${action.fields.webhookUrl}`);
      return parts.join(", ");
    })
    .join("\n");
}

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <RuleSummaryLabel className={className}>{children}</RuleSummaryLabel>;
}
