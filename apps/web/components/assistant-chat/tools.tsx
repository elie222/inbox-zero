import type { ChangeEvent } from "react";
import { useState } from "react";
import { useQueryState } from "nuqs";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { AddToKnowledgeBaseTool } from "@/utils/ai/assistant/tools/rules/add-to-knowledge-base-tool";
import type { CreateRuleTool } from "@/utils/ai/assistant/tools/rules/create-rule-tool";
import type { UpdatePersonalInstructionsTool } from "@/utils/ai/assistant/tools/rules/update-personal-instructions-tool";
import type { UpdateLearnedPatternsTool } from "@/utils/ai/assistant/tools/rules/update-learned-patterns-tool";
import type {
  UpdateRuleOutput,
  UpdateRuleTool,
} from "@/utils/ai/assistant/tools/rules/update-rule-tool";
import type {
  DeleteRuleOutput,
  DeleteRuleTool,
} from "@/utils/ai/assistant/tools/rules/delete-rule-tool";
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
import { deleteMailSplitAction } from "@/utils/actions/mail-split";
import { useMailSettings } from "@/hooks/useMailSettings";
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
import { Badge, type Color } from "@/components/Badge";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { getActionColor } from "@/components/PlanBadge";
import type { ActionType } from "@/generated/prisma/enums";
import { formatShortDate } from "@/utils/date";
import { trimToNonEmptyString } from "@/utils/string";
import { decodeHtmlEntities } from "@/utils/gmail/decode";
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

type LegacyRuleStateInput = {
  ruleName: string;
  operation?: "enable" | "disable" | "delete";
};

type LegacyRuleStateOutput = DeleteRuleOutput & {
  operation?: "enable" | "disable" | "delete";
  enabled?: boolean;
  previousEnabled?: boolean;
};
import {
  RuleSummaryCard,
  RuleSummaryCardHeader,
  RuleSummaryLabel,
  RuleSummaryRow,
  RuleSummaryText,
} from "@/components/assistant-chat/rule-summary-card";
import { getPendingEmailSubjectPrefix } from "@/components/assistant-chat/helpers";

export type ThreadLookup = EmailLookup;

type ManageInboxResultInput = {
  action?: string;
  categoryName?: string | null;
  fromEmails?: string[] | null;
  label?: string | null;
  labelName?: string | null;
  read?: boolean | null;
  threadIds?: string[] | null;
};

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

export function SearchInboxResult({ outputs }: { outputs: unknown[] }) {
  const { t } = useLingui();
  const outputCount = outputs.length;
  const title =
    outputCount > 1 ? t`Search Inbox ×${outputCount}` : t`Search Inbox`;

  return (
    <SubtleToolCollapsible title={title}>
      {outputs.map((output, index) => (
        <div
          key={index}
          className={cn("space-y-3", index > 0 && "border-t pt-3")}
        >
          <SearchInboxResultDetails output={output} />
        </div>
      ))}
    </SubtleToolCollapsible>
  );
}

function SearchInboxResultDetails({ output }: { output: unknown }) {
  const { t } = useLingui();
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
      externalUrl?: string;
    }>
  >(output, "messages");

  return (
    <>
      {queryUsed && (
        <ToolDetailRow
          label={t`Query`}
          value={<span className="font-mono text-xs">{queryUsed}</span>}
        />
      )}
      {error && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <Trans>Search results were unavailable for that request.</Trans>
          </p>
          <p className="text-xs">{error}</p>
        </div>
      )}
      {messages && messages.length > 0 && <ToolEmailRows emails={messages} />}
    </>
  );
}

export function ManageInboxResult({
  input,
  output,
  threadIds,
  threadLookup,
  isInProgress = false,
}: {
  input?: ManageInboxResultInput;
  output: unknown;
  threadIds?: string[];
  threadLookup: ThreadLookup;
  isInProgress?: boolean;
}) {
  const { t, i18n } = useLingui();
  const { provider, userEmail } = useAccount();
  const providerName = provider === "microsoft" ? "Outlook" : "Gmail";
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
  const actionLabel = i18n._(
    getManageInboxActionLabel({
      action,
      read,
      labelApplied,
      inProgress: isInProgress,
    }),
  );
  const archivedMessagesCount = getOutputField<number>(
    output,
    "archivedMessagesCount",
  );
  const isSenderAction =
    action === "bulk_archive_senders" || action === "unsubscribe_senders";
  const itemCount = successCount ?? requestedCount;
  const senderCount = sendersCount ?? senders?.length;
  let countText: string | undefined;
  if (
    action === "bulk_archive_senders" &&
    typeof archivedMessagesCount === "number"
  ) {
    countText = t`${plural(archivedMessagesCount, { one: "# message", other: "# messages" })}`;
  } else if (isSenderAction) {
    if (typeof senderCount === "number") {
      countText = t`${plural(senderCount, { one: "# sender", other: "# senders" })}`;
    }
  } else if (typeof itemCount === "number") {
    countText = t`${plural(itemCount, { one: "# item", other: "# items" })}`;
  }

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
        countText ? (
          <Badge
            color={failedCount ? "yellow" : isInProgress ? "blue" : "green"}
            className="text-[10px]"
          >
            {countText}
          </Badge>
        ) : undefined
      }
      initialOpen={isInProgress}
    >
      {isInProgress && (
        <ToolPanel className="border-blue-200 bg-blue-50/60 text-blue-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
          <div className="text-sm">
            <Trans>Processing senders now.</Trans>
          </div>
        </ToolPanel>
      )}

      {typeof failedCount === "number" && failedCount > 0 && (
        <ToolPanel className="border-red-200 bg-red-50/60 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          <div className="text-sm">
            {isSenderAction ? (
              <Plural
                value={failedCount}
                one="Failed on # sender."
                other="Failed on # senders."
              />
            ) : (
              <Plural
                value={failedCount}
                one="Failed on # item."
                other="Failed on # items."
              />
            )}
          </div>
        </ToolPanel>
      )}

      {resolvedThreads && resolvedThreads.length > 0 && (
        <div className="-mx-4 -my-3.5">
          <ToolEmailRows emails={resolvedThreads} />
        </div>
      )}

      {senders && senders.length > 0 && (
        <ToolSection label={t`Senders`}>
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
                  aria-label={t`View ${sender} in ${providerName}`}
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
  const { t } = useLingui();
  const { provider, userEmail } = useAccount();
  const providerName = provider === "microsoft" ? "Outlook" : "Gmail";
  const category = getOutputField<{ id: string | null; name: string }>(
    output,
    "category",
  );
  const sendersCount = getOutputField<number>(output, "sendersCount") ?? 0;
  const archivedMessagesCount = getOutputField<number>(
    output,
    "archivedMessagesCount",
  );
  const senders = getOutputField<string[]>(output, "senders") ?? [];
  const categoryName = category?.name?.trim() || t`Category`;

  if (senders.length === 0) {
    return (
      <BasicToolInfo text={t`No senders to archive in "${categoryName}"`} />
    );
  }

  const hiddenCount = Math.max(sendersCount - senders.length, 0);

  return (
    <CollapsibleToolCard
      title={
        archivedMessagesCount === 0
          ? t`No messages archived in "${categoryName}"`
          : t`Archived "${categoryName}" category`
      }
      badge={
        typeof archivedMessagesCount === "number" ? (
          <Badge
            color={archivedMessagesCount > 0 ? "green" : "gray"}
            className="text-[10px]"
          >
            <Plural
              value={archivedMessagesCount}
              one="# message"
              other="# messages"
            />
          </Badge>
        ) : (
          <Badge color="green" className="text-[10px]">
            <Plural value={sendersCount} one="# sender" other="# senders" />
          </Badge>
        )
      }
    >
      <ToolSection label={t`Senders`}>
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
                aria-label={t`View ${sender} in ${providerName}`}
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </ToolPanel>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="text-xs text-muted-foreground">
            <Plural
              value={hiddenCount}
              one="+ # more sender not shown"
              other="+ # more senders not shown"
            />
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
  const { t, i18n } = useLingui();
  const { provider, userEmail } = useAccount();
  const providerName = provider === "microsoft" ? "Outlook" : "Gmail";
  const subject = getOutputField<string>(output, "subject");
  const from = getOutputField<string>(output, "from");
  const to = getOutputField<string>(output, "to");
  const date = getOutputField<string>(output, "date");
  const content = getOutputField<string>(output, "content");
  const messageId = getOutputField<string>(output, "messageId");
  const threadId = getOutputField<string>(output, "threadId");
  const outputExternalUrl = getOutputField<string>(output, "externalUrl");
  const externalUrl = getExternalMessageUrl({
    messageId,
    threadId,
    externalUrl: outputExternalUrl,
    userEmail,
    provider,
  });
  const formattedDate = date
    ? formatShortDate(new Date(date), { lowercase: true, locale: i18n.locale })
    : null;

  return (
    <SubtleToolCollapsible title={t`Read Email`}>
      <div className="space-y-3 text-sm">
        {(subject || from || to || formattedDate) && (
          <div className="space-y-1">
            {subject && (
              <div className="text-sm font-medium leading-snug text-foreground">
                {subject}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {from && <InlineMetadataItem label={t`From`} value={from} />}
              {to && <InlineMetadataItem label={t`To`} value={to} />}
              {formattedDate && (
                <InlineMetadataItem label={t`Date`} value={formattedDate} />
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
            <Trans>Open in {providerName}</Trans>
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
  const { t, i18n } = useLingui();
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
  const displaySubject = decodeHtmlEntities(subject || referenceSubject);
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
        toastError({ description: t`Could not confirm this email action.` });
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
        toastError({ description: t`Could not confirm this email action.` });
        return;
      }

      setConfirmationResultOverride(parsed);
      toastSuccess({
        description: i18n._(getAssistantEmailSuccessMessage(actionType)),
      });
    } catch {
      toastError({ description: t`Could not confirm this email action.` });
    } finally {
      setIsConfirming(false);
    }
  };

  const heading = getEmailActionHeading({
    actionType,
    isConfirmed,
    recipient,
    i18n,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b px-4 py-3.5">
        <Avatar className="size-8">
          <AvatarFallbackColor content={recipientInitial} className="text-xs" />
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">{heading}</div>
          {cc && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              <Trans>CC: {cc}</Trans>
            </div>
          )}
          {bcc && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              <Trans>BCC: {bcc}</Trans>
            </div>
          )}
        </div>
        {isConfirmed && (
          <div className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckIcon className="size-3.5" />
            <Trans>Sent</Trans>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {displaySubject && (
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <FieldLabel>
              <Trans>Subject</Trans>
            </FieldLabel>
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
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setEditedBody(e.target.value)
                }
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
                  <Trans>Cancel</Trans>
                </Button>
                <Button size="sm" onClick={() => setIsEditing(false)}>
                  <Trans>Save changes</Trans>
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
                variant="ghostMuted"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setIsEditing(true)}
              >
                <PencilIcon className="size-3.5" />
                <span className="hidden sm:inline">
                  <Trans>Edit</Trans>
                </span>
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
                {copied ? t`Copied` : t`Copy`}
              </span>
            </Button>
            {externalUrl && (
              <Button
                variant="ghostMuted"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                asChild
              >
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-3.5" />
                  <span className="hidden sm:inline">
                    <Trans>Open in {providerName}</Trans>
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
                t`Sending...`
              ) : isConfirming ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <Trans>Sending...</Trans>
                </>
              ) : !isPersistedMessage ? (
                t`Saving...`
              ) : (
                <>
                  <SendIcon className="hidden size-3.5 sm:inline" />
                  <Trans>Send</Trans>
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
  status,
}: {
  args: CreateRuleTool["input"];
  ruleId?: string;
  preview?: boolean;
  status?: "created" | "pending";
}) {
  const { t, i18n } = useLingui();
  const conditionText = buildConditionText(args.condition, i18n);
  const isCreated = status ? status === "created" : Boolean(ruleId);

  return (
    <RuleSummaryCard
      title={args.name}
      status={
        <RuleStatusBadge
          label={isCreated ? t`Created` : t`Pending`}
          color={isCreated ? "green" : "yellow"}
        />
      }
      actions={
        preview ? (
          <RuleActionsPreview />
        ) : ruleId ? (
          <RuleActions ruleId={ruleId} />
        ) : null
      }
    >
      <RuleSummaryRow label={t`When`}>
        <RuleSummaryText>{conditionText}</RuleSummaryText>
      </RuleSummaryRow>

      <RuleSummaryRow label={t`Then`}>
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
  const { t } = useLingui();
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
        toastError({ description: t`Could not create this rule.` });
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
        toastError({ description: t`Could not create this rule.` });
        return;
      }

      setRuleIdOverride(createdId);
      toastSuccess({ description: t`Rule created and enabled.` });
    } catch {
      toastError({ description: t`Could not create this rule.` });
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
  const { t } = useLingui();
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
        toastError({ description: t`Could not save this memory.` });
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
        toastError({ description: t`Could not save this memory.` });
        return;
      }

      setConfirmedAtOverride(confirmationResult.confirmedAt);
      setDeduplicatedOverride(Boolean(confirmationResult.deduplicated));
      toastSuccess({
        description: confirmationResult.deduplicated
          ? t`Memory was already saved.`
          : t`Memory saved.`,
      });
    } catch {
      toastError({ description: t`Could not save this memory.` });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">
              <Trans>Save memory</Trans>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isConfirmed
                ? deduplicated
                  ? t`Already saved in memory`
                  : t`Saved for future conversations`
                : t`Pending confirmation`}
            </p>
          </div>
          {confirmedAt && (
            <Badge color={deduplicated ? "gray" : "green"} className="text-xs">
              {deduplicated ? t`Already saved` : t`Saved`}
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
              t`Saving...`
            ) : isConfirming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <Trans>Saving...</Trans>
              </>
            ) : (
              t`Confirm save`
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
  const { t } = useLingui();

  if (ruleId) {
    return <CreatedRuleToolCard args={args} ruleId={ruleId} />;
  }

  return (
    <div className="space-y-3">
      <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangleIcon className="size-4 text-amber-600" />
        <AlertTitle>
          <Trans>Review before enabling</Trans>
        </AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            <Trans>
              This rule can send email automatically. Review it before enabling.
            </Trans>
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
            t`Creating...`
          ) : isConfirming ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <Trans>Creating...</Trans>
            </>
          ) : (
            t`Create & enable rule`
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
  args: { ruleName: string; condition: ConditionTextInput };
  ruleId: string;
  originalConditions?: ConditionTextInput;
  updatedConditions?: ConditionTextInput;
  actions?: Array<{ type: string; fields?: RuleActionFields | null }>;
  preview?: boolean;
}) {
  const hasChanges =
    originalConditions &&
    updatedConditions &&
    originalConditions.aiInstructions !== updatedConditions.aiInstructions;
  const { t, i18n } = useLingui();

  const conditionText = buildConditionText(args.condition, i18n);

  return (
    <Card>
      <RuleSummaryCardHeader
        title={args.ruleName}
        status={<RuleStatusBadge label={t`Updated`} color="blue" />}
        actions={
          preview ? <RuleActionsPreview /> : <RuleActions ruleId={ruleId} />
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        <div className="flex gap-4 text-sm">
          <FieldLabel className="pt-0.5">
            <Trans>When</Trans>
          </FieldLabel>
          <RuleSummaryText>{conditionText}</RuleSummaryText>
        </div>

        {actions && actions.length > 0 && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>Then</Trans>
            </FieldLabel>
            <ActionBadgeList actions={actions} />
          </div>
        )}

        {hasChanges && (
          <ViewChangesCollapsible>
            <CollapsibleDiffContent
              title={t`Instructions:`}
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
  args: {
    ruleName: string;
    actions: Array<{ type: string; fields?: RuleActionFields | null }>;
  };
  ruleId: string;
  originalActions?: LegacyRuleActionForDiff[];
  updatedActions?: LegacyRuleActionForDiff[];
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
  const { t, i18n } = useLingui();

  const conditionText = condition ? buildConditionText(condition, i18n) : null;

  return (
    <Card>
      <RuleSummaryCardHeader
        title={args.ruleName}
        status={<RuleStatusBadge label={t`Updated`} color="blue" />}
        actions={
          preview ? <RuleActionsPreview /> : <RuleActions ruleId={ruleId} />
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        {conditionText && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>When</Trans>
            </FieldLabel>
            <RuleSummaryText>{conditionText}</RuleSummaryText>
          </div>
        )}

        <div className="flex gap-4 text-sm">
          <FieldLabel className="pt-0.5">
            <Trans>Then</Trans>
          </FieldLabel>
          <ActionBadgeList actions={args.actions} />
        </div>

        {hasChanges && (
          <ViewChangesCollapsible>
            <CollapsibleDiffContent
              title={t`Actions:`}
              originalText={formatActionsForDiff(originalActions || [], i18n)}
              updatedText={formatActionsForDiff(updatedActions || [], i18n)}
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
  const { t, i18n } = useLingui();
  const ruleId = output.ruleId;
  const title = output.updatedName || args.updates.name || args.ruleName;
  const conditionText = output.updatedConditions
    ? buildConditionText(
        output.currentRule?.conditions ||
          mergeUpdatedConditionsForDisplay({
            originalConditions: output.originalConditions,
            updatedConditions: output.updatedConditions,
          }),
        i18n,
      )
    : null;
  const actions = output.updatedActions;
  const nameChanged =
    output.originalName &&
    output.updatedName &&
    output.originalName !== output.updatedName;
  const enabledChanged =
    output.originalEnabled !== undefined &&
    output.updatedEnabled !== undefined &&
    output.originalEnabled !== output.updatedEnabled;
  const onlyEnabledChanged =
    enabledChanged &&
    !nameChanged &&
    !output.updatedConditions &&
    !output.updatedActions;
  const status = getRuleUpdateStatus({
    alreadyApplied: output.alreadyApplied,
    onlyEnabledChanged,
    updatedEnabled: output.updatedEnabled,
  });

  return (
    <Card>
      <RuleSummaryCardHeader
        title={title}
        status={
          <RuleStatusBadge label={i18n._(status.label)} color={status.color} />
        }
        actions={
          preview ? (
            <RuleActionsPreview />
          ) : ruleId ? (
            <RuleActions ruleId={ruleId} />
          ) : null
        }
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        {nameChanged && output.updatedName && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>Name</Trans>
            </FieldLabel>
            <p>{output.updatedName}</p>
          </div>
        )}

        {conditionText && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>When</Trans>
            </FieldLabel>
            <RuleSummaryText>{conditionText}</RuleSummaryText>
          </div>
        )}

        {enabledChanged && output.updatedEnabled !== undefined && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>Status</Trans>
            </FieldLabel>
            <p>{output.updatedEnabled ? t`Enabled` : t`Disabled`}</p>
          </div>
        )}

        {actions && (
          <div className="flex gap-4 text-sm">
            <FieldLabel className="pt-0.5">
              <Trans>Then</Trans>
            </FieldLabel>
            <ActionBadgeList actions={actions} />
          </div>
        )}

        {nameChanged && output.originalName && output.updatedName && (
          <ViewChangesCollapsible>
            <CollapsibleDiffContent
              title={t`Name:`}
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
  const { t, i18n } = useLingui();
  const actions = preview ? (
    <Tooltip content={t`Edit rule`}>
      <Button variant="ghostMuted" size="iconSm">
        <PencilIcon className="size-4" />
      </Button>
    </Tooltip>
  ) : (
    <LearnedPatternsActions ruleId={ruleId} />
  );

  return (
    <Card>
      <RuleSummaryCardHeader
        title={args.ruleName}
        status={<RuleStatusBadge label={t`Patterns updated`} color="blue" />}
        actions={actions}
      />

      <CardContent className="space-y-3 px-4 py-3.5">
        {args.learnedPatterns.map((pattern, i) => {
          if (!pattern) return null;
          const includeParts = formatPatternParts(pattern.include, i18n);
          const excludeParts = formatPatternParts(pattern.exclude, i18n);
          if (!includeParts && !excludeParts) return null;

          return (
            <ToolPanel key={i} className="space-y-2">
              {includeParts && (
                <ToolDetailRow label={t`Include`} value={includeParts} />
              )}
              {excludeParts && (
                <ToolDetailRow label={t`Exclude`} value={excludeParts} />
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
  args: LegacyRuleStateInput;
  output: LegacyRuleStateOutput;
  preview?: boolean;
}) {
  const { t } = useLingui();
  const ruleId = output.ruleId;
  const ruleName = output.ruleName || args.ruleName;
  const enabled = output.enabled ?? args.operation === "enable";
  const label = enabled ? t`Enabled` : t`Disabled`;

  return (
    <Card>
      <RuleSummaryCardHeader
        title={ruleName}
        status={
          <RuleStatusBadge label={label} color={enabled ? "green" : "gray"} />
        }
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
          <FieldLabel>
            <Trans>Status</Trans>
          </FieldLabel>
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
  args: DeleteRuleTool["input"];
  output: DeleteRuleOutput;
  disableConfirm: boolean;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(
    output.confirmationState === "confirmed",
  );
  const ruleId = output.ruleId;
  const ruleName = output.ruleName || args.ruleName;

  const handleDelete = async () => {
    if (!ruleId) {
      toastError({ description: t`Could not delete this rule.` });
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
      toastSuccess({ description: t`The rule has been deleted.` });
    } catch {
      toastError({ description: t`Failed to delete rule.` });
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
            {deleted ? t`Deleted rule` : t`Pending deletion`}
          </p>
        </div>
        {deleted && (
          <Badge color="green" className="shrink-0">
            <Trans>Deleted</Trans>
          </Badge>
        )}
      </CardHeader>

      {!deleted && (
        <CardContent className="space-y-3 px-4 py-3.5">
          <Alert
            variant="default"
            className="border-amber-500/40 bg-amber-500/5"
          >
            <AlertTriangleIcon className="size-4 text-amber-600" />
            <AlertTitle>
              <Trans>Confirm rule deletion</Trans>
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              <Trans>
                This will permanently delete the rule and its actions.
              </Trans>
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
                  <Trans>Deleting...</Trans>
                </>
              ) : (
                t`Delete rule`
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
  args: DeleteRuleTool["input"];
  output: DeleteRuleOutput;
}) {
  const { t } = useLingui();
  const deleted = output.confirmationState === "confirmed";
  const ruleName = output.ruleName || args.ruleName;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-4 py-3.5">
        <TrashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{ruleName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {deleted ? t`Deleted rule` : t`Pending deletion`}
          </p>
        </div>
        {deleted && (
          <Badge color="green" className="shrink-0">
            <Trans>Deleted</Trans>
          </Badge>
        )}
      </CardHeader>

      {!deleted && (
        <CardContent className="space-y-3 px-4 py-3.5">
          <Alert
            variant="default"
            className="border-amber-500/40 bg-amber-500/5"
          >
            <AlertTriangleIcon className="size-4 text-amber-600" />
            <AlertTitle>
              <Trans>Confirm rule deletion</Trans>
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              <Trans>
                This will permanently delete the rule and its actions.
              </Trans>
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button variant="destructive" size="sm" disabled>
              <Trans>Delete rule</Trans>
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
  const { t } = useLingui();

  return (
    <ExpandedToolCard title={t`Updated Personal Instructions`}>
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
  const { t } = useLingui();
  const [_, setTab] = useQueryState("tab");

  return (
    <ExpandedToolCard
      title={t`Added to Knowledge Base`}
      actions={
        <div className="self-center">
          <Button
            variant="ghostMuted"
            size="sm"
            className="h-8 px-2"
            onClick={() => setTab("rules")}
          >
            <Trans>View Knowledge Base</Trans>
          </Button>
        </div>
      }
    >
      <ToolDetailRow label={t`Title`} value={args.title} />
      <ToolSection label={t`Content`}>
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
  const { t } = useLingui();
  const { emailAccountId } = useAccount();

  return (
    <div className="flex items-center gap-1.5">
      <RuleEditToggleActions ruleId={ruleId} initialEnabled={initialEnabled} />
      <Tooltip content={t`Delete rule`}>
        <Button
          variant="ghostMuted"
          size="iconSm"
          onClick={async () => {
            const yes = confirm(t`Are you sure you want to delete this rule?`);
            if (yes) {
              try {
                const result = await deleteRuleAction(emailAccountId, {
                  id: ruleId,
                });
                if (result?.serverError) {
                  toastError({ description: result.serverError });
                } else {
                  toastSuccess({
                    description: t`The rule has been deleted.`,
                  });
                }
              } catch {
                toastError({ description: t`Failed to delete rule.` });
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
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const ruleDialog = useDialogState<{ ruleId: string }>();
  const [enabled, setEnabled] = useState(initialEnabled);
  const { executeAsync: toggleRule } = useAction(
    toggleRuleAction.bind(null, emailAccountId),
  );

  return (
    <>
      <Tooltip content={t`Edit rule`}>
        <Button
          variant="ghostMuted"
          size="iconSm"
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
                description: checked
                  ? t`Failed to enable rule.`
                  : t`Failed to disable rule.`,
              });
            }
          } catch {
            setEnabled(!checked);
            toastError({
              description: checked
                ? t`Failed to enable rule.`
                : t`Failed to disable rule.`,
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
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1.5">
      <RuleEditToggleActionsPreview enabled={enabled} />
      <Tooltip content={t`Delete rule`}>
        <Button variant="ghostMuted" size="iconSm">
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
  const { t } = useLingui();

  return (
    <>
      <Tooltip content={t`Edit rule`}>
        <Button variant="ghostMuted" size="iconSm">
          <PencilIcon className="size-4" />
        </Button>
      </Tooltip>
      <Switch checked={enabled} />
    </>
  );
}

function LearnedPatternsActions({ ruleId }: { ruleId: string }) {
  const { t } = useLingui();
  const ruleDialog = useDialogState<{ ruleId: string }>();

  return (
    <>
      <Tooltip content={t`Edit rule`}>
        <Button
          variant="ghostMuted"
          size="iconSm"
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

function RuleStatusBadge({ label, color }: { label: string; color: Color }) {
  return (
    <Badge color={color} className="shrink-0 text-[10px]">
      {label}
    </Badge>
  );
}

function getRuleUpdateStatus({
  alreadyApplied,
  onlyEnabledChanged,
  updatedEnabled,
}: {
  alreadyApplied: boolean | undefined;
  onlyEnabledChanged: boolean;
  updatedEnabled: boolean | undefined;
}): { label: MessageDescriptor; color: Color } {
  if (alreadyApplied) return { label: msg`Already applied`, color: "gray" };

  if (onlyEnabledChanged) {
    return updatedEnabled
      ? { label: msg`Enabled`, color: "green" }
      : { label: msg`Disabled`, color: "gray" };
  }
  return { label: msg`Updated`, color: "blue" };
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
        <Trans>View changes</Trans>
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
  if (action === "remove_category_threads") return "remove_label_threads";
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
}): MessageDescriptor {
  if (action === "bulk_archive_senders") {
    return inProgress
      ? msg`Bulk archiving senders`
      : msg`Bulk archived senders`;
  }
  if (action === "unsubscribe_senders") {
    return inProgress ? msg`Unsubscribing senders` : msg`Unsubscribed senders`;
  }
  if (action === "archive_threads") {
    if (inProgress) {
      return labelApplied
        ? msg`Archiving and labeling emails`
        : msg`Archiving emails`;
    }
    return labelApplied
      ? msg`Archived and labeled emails`
      : msg`Archived emails`;
  }
  if (action === "trash_threads") {
    return inProgress ? msg`Trashing emails` : msg`Trashed emails`;
  }
  if (action === "label_threads") {
    return inProgress ? msg`Labeling emails` : msg`Labeled emails`;
  }
  if (action === "remove_label_threads") {
    return inProgress ? msg`Removing labels` : msg`Removed labels`;
  }
  if (action === "mark_read_threads") {
    if (inProgress) {
      return read === false
        ? msg`Marking emails as unread`
        : msg`Marking emails as read`;
    }
    return read === false
      ? msg`Marked emails as unread`
      : msg`Marked emails as read`;
  }
  return msg`Updated emails`;
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

  return decodeHtmlEntities(getPendingString(pendingAction, "content"));
}

function getEmailActionHeading({
  actionType,
  isConfirmed,
  recipient = "",
  i18n,
}: {
  actionType: PendingEmailActionType;
  isConfirmed: boolean;
  recipient?: string;
  i18n: I18n;
}): string {
  if (isConfirmed) {
    if (actionType === "send_email")
      return i18n._(msg`Sent email to ${recipient}`);
    if (actionType === "reply_email")
      return i18n._(msg`Replied to ${recipient}`);
    return i18n._(msg`Forwarded to ${recipient}`);
  }
  if (actionType === "reply_email") return i18n._(msg`Reply to ${recipient}`);
  if (actionType === "forward_email")
    return i18n._(msg`Forward to ${recipient}`);
  return recipient;
}

function getAssistantEmailSuccessMessage(
  actionType: PendingEmailActionType,
): MessageDescriptor {
  if (actionType === "send_email") return msg`Email sent.`;
  if (actionType === "reply_email") return msg`Reply sent.`;
  return msg`Email forwarded.`;
}

function getExternalMessageUrl({
  messageId,
  threadId,
  externalUrl,
  userEmail,
  provider,
}: {
  messageId?: string;
  threadId?: string;
  externalUrl?: string;
  userEmail?: string | null;
  provider?: string;
}) {
  if (externalUrl) return externalUrl;
  if (provider === "microsoft") return null;

  return getEmailUrlForOptionalMessage({
    messageId,
    threadId,
    emailAddress: userEmail,
    provider,
  });
}

export function htmlToText(html: string) {
  const strippedText = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "");

  return decodeHtmlEntities(strippedText)
    .replace(/\u00a0/g, " ")
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
  i18n: I18n,
): string | null {
  if (!pattern) return null;
  const { from, subject } = pattern;
  const parts = [
    from && i18n._(msg`From: ${from}`),
    subject && i18n._(msg`Subject: ${subject}`),
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
  externalUrl?: string;
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
        externalUrl: email.externalUrl,
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

type LegacyRuleActionForDiff = {
  type: string;
  fields: Record<string, string | null>;
  delayInMinutes?: number | null;
};

type ConditionTextInput = {
  aiInstructions?: string | null;
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
  } | null;
  conditionalOperator?: string | null;
};

function buildConditionText(condition: ConditionTextInput, i18n: I18n): string {
  const parts: string[] = [];
  if (condition.aiInstructions) parts.push(condition.aiInstructions);
  if (condition.static) {
    const { from, to, subject } = condition.static;
    const staticParts = [
      from && i18n._(msg`From: ${from}`),
      to && i18n._(msg`To: ${to}`),
      subject && i18n._(msg`Subject: ${subject}`),
    ].filter(Boolean);
    if (staticParts.length > 0) parts.push(staticParts.join(", "));
  }
  return parts.join(` ${condition.conditionalOperator || "AND"} `);
}

function mergeUpdatedConditionsForDisplay({
  originalConditions,
  updatedConditions,
}: {
  originalConditions: UpdateRuleOutput["originalConditions"];
  updatedConditions: NonNullable<UpdateRuleOutput["updatedConditions"]>;
}) {
  let staticCondition: ConditionTextInput["static"] =
    originalConditions?.static;
  if ("static" in updatedConditions) {
    staticCondition =
      updatedConditions.static === null
        ? null
        : {
            ...(originalConditions?.static || {}),
            ...(updatedConditions.static || {}),
          };
  }

  let aiInstructions = originalConditions?.aiInstructions;
  if ("aiInstructions" in updatedConditions) {
    aiInstructions = updatedConditions.aiInstructions;
  } else if (updatedConditions.clearAiInstructions) {
    aiInstructions = null;
  }

  const conditionalOperator =
    updatedConditions.conditionalOperator != null
      ? updatedConditions.conditionalOperator
      : originalConditions?.conditionalOperator;

  return {
    aiInstructions,
    static: staticCondition,
    conditionalOperator,
  };
}

function formatActionsForDiff(
  actions: Array<{ type: string; fields: Record<string, string | null> }>,
  i18n: I18n,
): string {
  return actions
    .map((action) => {
      const parts = [action.type];
      const { label, to, content, webhookUrl } = action.fields ?? {};
      if (label) parts.push(i18n._(msg`Label: ${label}`));
      if (to) parts.push(i18n._(msg`To: ${to}`));
      if (content) parts.push(i18n._(msg`Content: ${content}`));
      if (webhookUrl) parts.push(i18n._(msg`Webhook: ${webhookUrl}`));
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

export function PendingDeleteSplitCard({
  split,
  disableConfirm,
}: {
  split: { id: string; name: string };
  disableConfirm: boolean;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data: settings, mutate } = useMailSettings();
  const [activeSplitId, setActiveSplitId] = useQueryState("split");
  const [isDeleting, setIsDeleting] = useState(false);
  // Read from the account's splits, so the card stays right after a reload.
  const deleted =
    !!settings && !settings.splits.some(({ id }) => id === split.id);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteMailSplitAction(emailAccountId, {
        id: split.id,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }
      if (activeSplitId === split.id) setActiveSplitId(null);
      await mutate();
      toastSuccess({ description: t`The split has been deleted.` });
    } catch {
      toastError({ description: t`Failed to delete split.` });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b px-4 py-3.5">
        <TrashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{split.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {deleted ? t`Deleted split` : t`Pending deletion`}
          </p>
        </div>
        {deleted && (
          <Badge color="green" className="shrink-0">
            <Trans>Deleted</Trans>
          </Badge>
        )}
      </CardHeader>

      {!deleted && (
        <CardContent className="flex items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm text-muted-foreground">
            <Trans>Removes this tab. Your mail isn't changed.</Trans>
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={disableConfirm || isDeleting || !settings}
            className="shrink-0 gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <Trans>Deleting...</Trans>
              </>
            ) : (
              t`Delete split`
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
