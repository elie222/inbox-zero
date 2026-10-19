"use client";

import {
  type EmailAttachmentMetadata,
  EMAIL_INLINE_IMAGE_MIME_TYPES,
  combineEmailHtml,
  finalizeEditableEmailHtml,
} from "@inboxzero/email-editor/core";
import {
  EmailEditor,
  type EmailEditorHandle,
  type EmailEditorState,
} from "@inboxzero/email-editor/web";
import {
  ImageIcon,
  PaperclipIcon,
  PictureInPicture2Icon,
  TrashIcon,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR, { useSWRConfig } from "swr";
import type { ScopedMutator } from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import type { GetSendAsResponse } from "@/app/api/user/send-as/route";
import { formatSendAsAddress, type SendAsAddress } from "@/utils/email/send-as";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { threadScheduledEmailsKey } from "@/components/email-list/ThreadDeliveryStatus";
import {
  hideSendingDraftMessages,
  upcomingScheduledEmailsKey,
} from "@/hooks/useHiddenDraftMessageIds";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { getAccountScopedKey } from "@/utils/swr";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useLocalReplyDraft } from "@/hooks/useLocalReplyDraft";
import {
  MailCoverageGate,
  useMailEngineDemand,
} from "@/utils/mail-engine/MailEngineHost";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import {
  MAIL_SHORTCUT_SCOPES,
  type ShortcutHandler,
} from "@/lib/shortcuts/registry";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { scheduleEmailAction } from "@/utils/actions/scheduled-email";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import {
  getDraftSessionMessageIds,
  getReplyDraft,
  type ReplyDraftIdentity,
  type ReplyDraftMode,
} from "@/utils/mail-engine/reply-drafts";
import { resolveSendDraftId } from "@/app/(app)/[emailAccountId]/compose/send-draft-reference";
import { getActionErrorMessage } from "@/utils/error";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import { cn } from "@/utils";
import {
  type ComposeRecipientField,
  resolveComposeRecipientFields,
} from "./compose-recipients";
import { DeliveryOptions, type DeliveryOptionsHandle } from "./DeliveryOptions";
import { resolveRemoteImages } from "./resolve-remote-images";
import { useComposeSnippets } from "./useComposeSnippets";
import {
  getReminderAfterSendTimeChange,
  parseDeliveryTimes,
} from "./delivery-times";
import {
  queueReaderEmail,
  READER_EMAIL_SETTLEMENT_TIMEOUT_MS,
  waitForReaderEmailSettlement,
} from "./queued-reply";
import {
  beginUndoSend,
  finishUndoSendToast,
  UNDO_SEND_DELAY_MS,
} from "./undo-send";
import { getReplyToEmailPayload } from "./reply-to-email-payload";
import {
  getEditableText,
  getSendWarnings,
  type SendWarning,
} from "./send-warnings";
import { SendWarningsDialog } from "./SendWarningsDialog";
import { waitForDraftOperations } from "./draft-operation-queue";
import { useComposeDraftAttachments } from "./useComposeDraftAttachments";
import { useComposeDraft } from "./useComposeDraft";
import { useComposeAttachments } from "./useComposeAttachments";
import {
  type ComposeAttachment,
  getEditorInlineAttachments,
  toAttachmentReference,
} from "./compose-attachments";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeHeaderFields } from "./ComposeHeaderFields";
import {
  createInitialComposeContent,
  findSelectableSendAs,
  getSendAsSignatureHtml,
  withSentWithFooter,
} from "./initial-compose-content";

export type ReplyingToEmail = {
  threadId?: string;
  headerMessageId?: string;
  messageId?: string;
  forwardedMessageId?: string;
  /**
   * The files that travel with a forward. They stay on the provider until the
   * send, so the composer shows them without ever holding their bytes.
   */
  /** An opened mailbox draft that already holds files. */
  draftHasAttachments?: boolean;
  forwardedAttachments?: Pick<
    EmailAttachmentMetadata,
    "id" | "filename" | "mimeType" | "size"
  >[];
  references?: string;
  subject: string;
  to: string;
  /**
   * Addresses to reply from, best first. The first that is one of the user's
   * send-as addresses is used, so mail sent to an alias is answered from it.
   */
  fromHint?: string;
  cc?: string;
  bcc?: string;
  draftHtml?: string;
  quotedContentHtml?: string;
  signatureHtml?: string;
  date?: string;
};

type ComposeEmailFormProps = {
  fromAccounts?: GetEmailAccountsResponse["emailAccounts"];
  layout?: "default" | "window";
  providerDraftMessageId?: string;
  draftKeyMessageId?: string;
  draftMode?: ReplyDraftMode;
  draftSessionId?: string;
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onClose?: () => void;
  onRestore?: () => void;
  onDiscard?: (draftId?: string) => boolean | Promise<boolean>;
  onPopOut?: () => void;
};

export type ComposeFormValues = Omit<
  SendEmailBody,
  "attachments" | "messageHtml"
>;

export function ComposeEmailForm(props: ComposeEmailFormProps) {
  useMailEngineDemand();
  return (
    <MailCoverageGate>
      <ComposeEmailFormWithEngine {...props} />
    </MailCoverageGate>
  );
}

function ComposeEmailFormWithEngine(props: ComposeEmailFormProps) {
  const { emailAccountId, provider, userEmail } = useAccount();
  const [selectedEmailAccountId, setSelectedEmailAccountId] =
    useState(emailAccountId);
  const selectedAccountOverride =
    selectedEmailAccountId === emailAccountId
      ? undefined
      : selectedEmailAccountId;
  const {
    data: emailAccount,
    error,
    isLoading,
  } = useEmailAccountFull(selectedAccountOverride);
  const selectedFromAccount = props.fromAccounts?.find(
    (account) => account.id === selectedEmailAccountId,
  );
  const selectedAccountProvider =
    selectedFromAccount?.account.provider ?? provider;
  // The already-loaded account list knows the address, so compose still opens
  // when the lookup fails offline.
  const sendingAddress =
    emailAccount?.email ||
    selectedFromAccount?.email ||
    (selectedAccountOverride ? undefined : userEmail);
  // A failed lookup still lets the user compose, just without a signature.
  // Waiting only while there is no error keeps a reconnect refetch from
  // swapping the open form back to a spinner.
  const {
    data: composeSignature,
    error: signatureError,
    isLoading: isLoadingSignature,
  } = useSWR<GetSignatureResponse>(
    getAccountScopedKey("/api/user/signature", selectedEmailAccountId),
  );
  // A failed lookup sends from the default address, as before.
  const {
    data: sendAs,
    error: sendAsError,
    isLoading: isLoadingSendAs,
  } = useSWR<GetSendAsResponse>(
    getAccountScopedKey("/api/user/send-as", selectedEmailAccountId),
  );

  const localDraftIdentity = props.draftSessionId
    ? {
        emailAccountId: selectedEmailAccountId,
        threadId: props.replyingToEmail?.threadId ?? props.draftSessionId,
        messageId: props.draftSessionId,
      }
    : undefined;

  const localDraft = useLocalReplyDraft(
    localDraftIdentity,
    !props.providerDraftMessageId &&
      props.draftKeyMessageId &&
      props.replyingToEmail?.threadId
      ? {
          emailAccountId: selectedEmailAccountId,
          threadId: props.replyingToEmail.threadId,
          messageId: props.draftKeyMessageId,
        }
      : undefined,
    props.draftMode,
  );
  const composeSessionKey = `${selectedEmailAccountId}:${props.replyingToEmail?.threadId ?? ""}:${props.draftSessionId ?? ""}`;
  const draftAttachments = useComposeDraftAttachments({
    emailAccountId: selectedEmailAccountId,
    sessionKey: composeSessionKey,
    storedDraft: localDraft.draft,
    loadMailboxDraft: Boolean(
      props.providerDraftMessageId &&
        props.replyingToEmail?.draftHasAttachments,
    ),
    providerDraftMessageId: props.providerDraftMessageId,
    enabled: !localDraft.isLoading,
  });
  return (
    <LoadingContent
      error={sendingAddress ? undefined : error}
      loading={
        (!sendingAddress && isLoading) ||
        localDraft.isLoading ||
        draftAttachments.isLoading ||
        (isLoadingSignature && !signatureError) ||
        (isLoadingSendAs && !sendAsError)
      }
    >
      {sendingAddress && (
        <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
          <ComposeEmailFormContent
            {...props}
            localDraftIdentity={localDraftIdentity}
            storedDraft={localDraft.draft}
            initialAttachments={draftAttachments.attachments}
            initialProviderDraftId={draftAttachments.draftId}
            initialDraftMissing={draftAttachments.draftMissing}
            draftLoadError={localDraft.error}
            accountProvider={selectedAccountProvider}
            accountSignatureHtml={composeSignature?.signatureHtml ?? ""}
            sendingAddress={sendingAddress}
            sendAsAddresses={sendAs?.addresses ?? []}
            sentWithFooterHtml={composeSignature?.footerHtml ?? ""}
            key={composeSessionKey}
            onSelectEmailAccount={setSelectedEmailAccountId}
            selectedEmailAccountId={selectedEmailAccountId}
          />
        </ShortcutsProvider>
      )}
    </LoadingContent>
  );
}

function ComposeEmailFormContent({
  layout = "default",
  draftKeyMessageId,
  providerDraftMessageId,
  draftMode,
  storedDraft,
  draftLoadError,
  replyingToEmail,
  fromAccounts,
  accountProvider,
  accountSignatureHtml,
  sendingAddress,
  sendAsAddresses,
  sentWithFooterHtml,
  selectedEmailAccountId,
  onSelectEmailAccount,
  refetch,
  onSuccess,
  onMarkDone,
  onClose,
  onRestore,
  onDiscard,
  onPopOut,
  localDraftIdentity,
  initialAttachments,
  initialProviderDraftId,
  initialDraftMissing,
}: ComposeEmailFormProps & {
  localDraftIdentity?: ReplyDraftIdentity;
  storedDraft?: StoredReplyDraft;
  initialAttachments: ComposeAttachment[];
  initialProviderDraftId?: string;
  initialDraftMissing: boolean;
  draftLoadError?: Error;
  accountProvider: string;
  accountSignatureHtml: string;
  sendingAddress: string;
  sendAsAddresses: SendAsAddress[];
  sentWithFooterHtml: string;
  selectedEmailAccountId: string;
  onSelectEmailAccount: (emailAccountId: string) => void;
}) {
  const { emailAccountId } = useAccount();
  const { showEmail } = useDisplayedEmail();
  const isComposeWindow = layout === "window";
  const isInlineReply = Boolean(draftKeyMessageId && replyingToEmail?.threadId);
  const canScheduleDelivery = isInlineReply || isComposeWindow;
  const isNewCompose = !replyingToEmail && !providerDraftMessageId;
  const initialSendAs = findSelectableSendAs(
    replyingToEmail?.fromHint,
    sendAsAddresses,
  );
  const initialFrom = initialSendAs && formatSendAsAddress(initialSendAs);
  const { mutate } = useSWRConfig();
  const client = useOptionalMailClient() ?? getActiveMailClient();
  const [sendAt, setSendAt] = useState(storedDraft?.content?.sendAt ?? "");
  const [remindAt, setRemindAt] = useState(
    storedDraft?.content?.remindAt ?? "",
  );
  const [submissionError, setSubmissionError] = useState(() => {
    const times = parseDeliveryTimes(sendAt, remindAt);
    return times.valid ? "" : times.error;
  });
  const editorInitialized = useRef(false);

  const [initialComposer] = useState(() =>
    createInitialComposeContent({
      storedDraft,
      initialAttachments,
      replyingToEmail,
      initialSendAs,
      sendAsAddresses,
      accountSignatureHtml,
      sentWithFooterHtml,
    }),
  );
  const { draft: initialDraft, preservedBlocks } = initialComposer;
  const pendingRecipientsRef = useRef<Record<ComposeRecipientField, string>>({
    to: "",
    cc: "",
    bcc: "",
  });
  // Forwards start without a recipient, so focus To. Replies already have one.
  const focusRecipientField = draftMode === "forward" || !replyingToEmail;
  const isMountedRef = useRef(true);
  const editorRef = useRef<EmailEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const sendAndMarkDoneButtonRef = useRef<HTMLButtonElement>(null);
  const [sendWarnings, setSendWarnings] = useState<SendWarning[]>([]);
  const skipSendWarningsRef = useRef(false);
  const warnedSubmitterRef = useRef<HTMLElement | null>(null);
  const deliveryOptionsRef = useRef<DeliveryOptionsHandle>(null);
  const shortcutOwnerId = useId();
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<ComposeFormValues>({
    defaultValues: storedDraft?.content?.values
      ? {
          // Drafts saved before send-as support carry no sender; leaving it
          // unset would show the default while the mailbox draft keeps its own.
          ...storedDraft.content.values,
          from: storedDraft.content.values.from ?? initialFrom,
        }
      : {
          replyToEmail: getReplyToEmailPayload(replyingToEmail),
          subject: replyingToEmail?.subject,
          from: initialFrom,
          to: replyingToEmail?.to,
          cc: replyingToEmail?.cc,
          bcc: replyingToEmail?.bcc,
        },
  });
  const {
    onSlashKeyDown,
    onSlashTrigger,
    toolbar: snippetToolbar,
  } = useComposeSnippets({
    editorRef,
    to: watch("to"),
  });

  const draft = useComposeDraft({
    emailAccountId: selectedEmailAccountId,
    accountProvider,
    client,
    storedDraft,
    draftLoadError,
    localDraftIdentity,
    providerDraftMessageId,
    initialProviderDraftId,
    initialDraftMissing,
    draftMode,
    initialComposer,
    editorRef,
    getValues,
    watch,
    pendingRecipientsRef,
    sendAt,
    remindAt,
  });
  const {
    requestId,
    deliveryPath,
    providerDraftId,
    draftQueueKey,
    attachments,
    attachmentsRef,
    captureDraft,
    flushDraft,
    clearLocalDraft,
    draftSaveError,
    providerAutosaveError,
    stopProviderAutosave,
    resumeProviderAutosave,
    forgetAttachedComposeFiles,
    discard,
  } = draft;
  const {
    forwardedAttachments,
    addFiles,
    removeAttachment,
    removeUnusedInlineAttachments,
    handleFileInput,
  } = useComposeAttachments({
    draft,
    emailAccountId: selectedEmailAccountId,
    editorRef,
    isSubmitting,
    replyingToEmail,
  });

  const handleEditorStateChange = (state: EmailEditorState) => {
    removeUnusedInlineAttachments(state.inlineContentIds);
    if (!editorInitialized.current) {
      queueMicrotask(() => {
        editorInitialized.current = true;
      });
      return;
    }
    captureDraft();
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // An inline reply is already on screen, the side panel only reads the
  // current account's mail, and a send without a stored copy has nothing to show.
  const getViewSentEmail = useCallback(
    (messageId: string, threadId: string) =>
      isInlineReply || selectedEmailAccountId !== emailAccountId || !messageId
        ? null
        : () => showEmail({ threadId, messageId }),
    [emailAccountId, isInlineReply, selectedEmailAccountId, showEmail],
  );

  const onSubmit: SubmitHandler<ComposeFormValues> = useCallback(
    async (data, event) => {
      const submitter = (event?.nativeEvent as SubmitEvent | undefined)
        ?.submitter;
      const markDoneAfterSend = submitter === sendAndMarkDoneButtonRef.current;
      const skipSendWarnings = skipSendWarningsRef.current;
      skipSendWarningsRef.current = false;
      const recipients = resolveComposeRecipientFields({
        selectedRecipients: {
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
        },
        pendingRecipients: pendingRecipientsRef.current,
      });
      if (!recipients.to) {
        toastError({ description: "Enter a valid recipient email address." });
        return;
      }

      // Files go to the mailbox draft as they are attached, so a send waits
      // for them and never carries their bytes itself.
      await waitForDraftOperations(draftQueueKey);
      const failedAttachment = attachmentsRef.current.find(
        (attachment) => attachment.status !== "uploaded",
      );
      if (failedAttachment) {
        toastError({
          description: `${failedAttachment.filename} isn't attached. Remove it or attach it again before sending.`,
        });
        return;
      }

      const editorValue = editorRef.current?.getValue() ?? {
        editableHtml: initialDraft.editableHtml,
        inlineContentIds: [],
        mode: initialDraft.mode,
        preservedBlockIds: preservedBlocks.map((block) => block.id),
      };
      const preservedBlockIds = new Set(editorValue.preservedBlockIds);
      const editableHtml = finalizeEditableEmailHtml({
        html: editorValue.editableHtml,
        inlineAttachments: getEditorInlineAttachments(attachmentsRef.current),
        mode: editorValue.mode,
      });
      const enrichedData: SendEmailBody = {
        ...data,
        ...recipients,
        replyToEmail: getReplyToEmailPayload(data.replyToEmail),
        messageHtml: combineEmailHtml({
          editableHtml,
          signatureHtml: preservedBlockIds.has("signature")
            ? initialDraft.signatureHtml
            : "",
          quotedHtml: preservedBlockIds.has("quote")
            ? initialDraft.quotedHtml
            : "",
        }),
      };
      const payloadValidation = validateSendEmailPayloadSize(enrichedData);
      if (!payloadValidation.valid) {
        toastError({ description: payloadValidation.error });
        return;
      }

      const deliveryTimes = parseDeliveryTimes(sendAt, remindAt);
      if (!deliveryTimes.valid) {
        setSubmissionError(deliveryTimes.error);
        return;
      }

      if (!skipSendWarnings) {
        const warnings = getSendWarnings({
          text: getEditableText(editableHtml),
          hasAttachments:
            attachmentsRef.current.length > 0 ||
            forwardedAttachments.length > 0,
        });
        if (warnings.length) {
          warnedSubmitterRef.current = submitter ?? null;
          setSendWarnings(warnings);
          return;
        }
      }
      setSubmissionError("");
      await stopProviderAutosave();
      let deliveryAccepted = false;
      try {
        // Autosave can replace a draft's message ID; its provider draft ID survives.
        enrichedData.providerDraftId = await resolveSendDraftId(
          providerDraftId.current,
          localDraftIdentity,
        );
        // The mailbox draft is what carries the files to the recipient.
        if (attachmentsRef.current.length && !enrichedData.providerDraftId) {
          toastError({
            description:
              "Could not find this draft in your mailbox to send its attachments. Reopen it and try again.",
          });
          return;
        }
        if (isInlineReply) {
          if (deliveryPath.current === "outbox" && (sendAt || remindAt)) {
            setSubmissionError(
              "This reply was already submitted to the outbox. Check its delivery status before scheduling a new reply.",
            );
            return;
          }
          deliveryPath.current ??= sendAt || remindAt ? "scheduled" : "outbox";
        }
        captureDraft();
        await flushDraft();
        const draftMessageIds = providerDraftMessageId
          ? getDraftSessionMessageIds(
              selectedEmailAccountId,
              providerDraftMessageId,
            )
          : localDraftIdentity
            ? ((await getReplyDraft(localDraftIdentity))?.content
                ?.providerDraftMessageIds ?? [])
            : [];
        const isScheduled = isInlineReply
          ? deliveryPath.current === "scheduled"
          : canScheduleDelivery && Boolean(sendAt || remindAt);
        if (isScheduled) {
          const scheduledThreadId = replyingToEmail?.threadId ?? null;
          const result = await scheduleEmailAction(selectedEmailAccountId, {
            clientMutationId: requestId,
            threadId: scheduledThreadId,
            messageIds: draftKeyMessageId ? [draftKeyMessageId] : [],
            email: enrichedData,
            draftMessageIds: draftMessageIds.slice(-50),
            sendAt: deliveryTimes.sendAt,
            remindAt: deliveryTimes.remindAt,
          });
          if (!result?.data) {
            setSubmissionError(
              getActionErrorMessage(result ?? {}, {
                prefix: scheduledThreadId
                  ? "Could not schedule this reply"
                  : "Could not schedule this email",
              }),
            );
            return;
          }
          deliveryAccepted = true;
          forgetAttachedComposeFiles();
          try {
            await clearLocalDraft();
          } catch {
            toastError({
              description:
                "Reply scheduled, but its local draft copy could not be cleared.",
            });
          }
          if (markDoneAfterSend) onMarkDone?.();
          // The Scheduled view stops polling once nothing is pending, so it
          // needs the new send pushed to it rather than waiting for a refresh.
          // The email is already scheduled by now, so a refresh that fails must
          // not reach the catch below and report the send itself as failed.
          await refreshScheduledEmails(
            mutate,
            selectedEmailAccountId,
            scheduledThreadId,
          );
          if (!scheduledThreadId) {
            toastSuccess({ description: "Email scheduled." });
          }
          onClose?.();
          refetch?.();
          return;
        }
        const readerThreadId =
          replyingToEmail?.threadId?.trim() ||
          localDraftIdentity?.threadId ||
          requestId;
        const readerMessageId =
          (isInlineReply ? draftKeyMessageId : replyingToEmail?.messageId) ??
          localDraftIdentity?.messageId ??
          requestId;
        const online = navigator.onLine;
        if (!client) {
          setSubmissionError(
            "Mail is still starting. Try sending again in a moment.",
          );
          toastError({
            description:
              "Mail is still starting. Try sending again in a moment.",
          });
          return;
        }
        let outcome: Awaited<ReturnType<typeof queueReaderEmail>>;
        let showDraftAgain = () => {};
        try {
          outcome = await queueReaderEmail({
            client,
            email: enrichedData,
            mutationId: requestId,
            emailAccountId: selectedEmailAccountId,
            holdForUndo: online,
            messageIds: isNewCompose ? [] : [readerMessageId],
            providerDraftMessageIds: draftMessageIds,
            attachments: attachmentsRef.current.flatMap(toAttachmentReference),
            online,
            threadId: readerThreadId,
            onQueued: async () => {
              deliveryAccepted = true;
              showDraftAgain = hideSendingDraftMessages(
                selectedEmailAccountId,
                draftMessageIds,
              );
              if (replyingToEmail?.threadId?.trim()) {
                await mutate([
                  "thread-deliveries",
                  selectedEmailAccountId,
                  readerThreadId,
                ]).catch(() => {});
              }
              onClose?.();
            },
          });
        } catch (error) {
          console.error(error);
          const description =
            error instanceof Error
              ? error.message
              : "Could not confirm this reply was queued. Check the thread delivery status before retrying.";
          showDraftAgain();
          setSubmissionError(description);
          toastError({ description });
          return;
        }
        const discardLocalDraft = async () => {
          forgetAttachedComposeFiles();
          try {
            await clearLocalDraft();
          } catch {
            toastError({
              description: isInlineReply
                ? "Reply queued, but its local draft copy could not be cleared."
                : "Email queued, but its local draft copy could not be cleared.",
            });
          }
        };
        if (outcome.status === "held") {
          beginUndoSend({
            client,
            operationId: outcome.mutationId,
            emailAccountId: selectedEmailAccountId,
            holdUntil: outcome.holdUntil,
            restoreComposer: () => onRestore?.(),
          });
          waitForReaderEmailSettlement({
            client,
            accountId: selectedEmailAccountId,
            mutationId: outcome.mutationId,
            settlementTimeoutMs:
              UNDO_SEND_DELAY_MS + READER_EMAIL_SETTLEMENT_TIMEOUT_MS,
            threadId: outcome.threadId,
          })
            .then(async (settled) => {
              finishUndoSendToast(
                outcome.mutationId,
                settled.status === "sent"
                  ? {
                      sent: true,
                      onView: getViewSentEmail(
                        settled.messageId,
                        settled.threadId,
                      ),
                    }
                  : { sent: false },
              );
              if (settled.status === "cancelled" || settled.status === "failed")
                showDraftAgain();
              if (settled.status === "cancelled") return;
              await discardLocalDraft();
              if (settled.status === "sent") {
                if (markDoneAfterSend) onMarkDone?.();
                onSuccess?.(settled.messageId, settled.threadId);
                refetch?.();
                return;
              }
              if (settled.status === "failed" && settled.ownsNotification) {
                toastError({ description: settled.error });
              } else if (
                settled.status === "uncertain" &&
                settled.ownsNotification
              ) {
                toastError({
                  description:
                    "This reply may have been sent. Check Sent before retrying.",
                });
              }
            })
            .catch(() =>
              finishUndoSendToast(outcome.mutationId, { sent: false }),
            );
          return;
        }
        if (outcome.status === "failed" || outcome.status === "cancelled")
          showDraftAgain();
        await discardLocalDraft();
        if (outcome.status === "sent") {
          if (!isInlineReply) {
            const viewSentEmail = getViewSentEmail(
              outcome.messageId,
              outcome.threadId,
            );
            toastSuccess({
              description: "Email sent!",
              action: viewSentEmail
                ? { label: "View", onClick: viewSentEmail }
                : undefined,
            });
          }
          if (markDoneAfterSend) onMarkDone?.();
          onSuccess?.(outcome.messageId, outcome.threadId);
          refetch?.();
        } else if (outcome.status === "queued") {
          if (!isInlineReply)
            toastSuccess({
              description: getQueuedEmailDescription(outcome.reason),
            });
          if (markDoneAfterSend) onMarkDone?.();
          onClose?.();
        } else if (outcome.status === "uncertain") {
          if (outcome.ownsNotification) {
            toastError({
              description:
                "This reply may have been sent. Check Sent before retrying.",
            });
          }
          onClose?.();
        } else if (outcome.status === "failed" && outcome.ownsNotification) {
          toastError({ description: outcome.error });
        }
      } catch (error) {
        console.error(error);
        setSubmissionError(
          "Could not confirm delivery. Check the thread status before trying again.",
        );
        toastError({ description: "There was an error sending the email :(" });
      } finally {
        if (!deliveryAccepted) resumeProviderAutosave();
      }

      refetch?.();
    },
    [
      attachmentsRef,
      deliveryPath,
      providerDraftId,
      stopProviderAutosave,
      resumeProviderAutosave,
      canScheduleDelivery,
      initialDraft,
      isInlineReply,
      isNewCompose,
      localDraftIdentity,
      sendAt,
      remindAt,
      requestId,
      draftKeyMessageId,
      draftQueueKey,
      captureDraft,
      clearLocalDraft,
      client,
      flushDraft,
      forgetAttachedComposeFiles,
      forwardedAttachments.length,
      getViewSentEmail,
      mutate,
      onClose,
      onRestore,
      onMarkDone,
      onSuccess,
      preservedBlocks,
      providerDraftMessageId,
      refetch,
      replyingToEmail,
      selectedEmailAccountId,
    ],
  );

  const sendDespiteWarnings = useCallback(() => {
    skipSendWarningsRef.current = true;
    setSendWarnings([]);
    formRef.current?.requestSubmit(warnedSubmitterRef.current);
  }, []);

  const updatePendingRecipient = useCallback(
    (field: ComposeRecipientField, query: string) => {
      pendingRecipientsRef.current[field] = query;
      queueMicrotask(() => {
        if (isMountedRef.current) captureDraft();
      });
    },
    [captureDraft],
  );

  const selectedSendAs = findSelectableSendAs(watch("from"), sendAsAddresses);
  // Gmail swaps in each address's own signature, keeping what was written.
  const changeSendAs = (email: string) => {
    const address = sendAsAddresses.find((item) => item.email === email);
    if (!address) return;
    const previousSignature = getSendAsSignatureHtml(
      selectedSendAs,
      sendAsAddresses,
      accountSignatureHtml,
    );
    const nextSignature = getSendAsSignatureHtml(
      address,
      sendAsAddresses,
      accountSignatureHtml,
    );
    setValue("from", formatSendAsAddress(address));
    if (nextSignature !== previousSignature)
      editorRef.current?.replaceSignature(
        withSentWithFooter(nextSignature, sentWithFooterHtml),
      );
  };
  const handleSendAtChange = (value: string) => {
    const nextRemindAt = getReminderAfterSendTimeChange(value, remindAt);
    setSubmissionError("");
    setSendAt(value);
    setRemindAt(nextRemindAt);
    captureDraft({ sendAt: value, remindAt: nextRemindAt });
  };
  const handleRemindAtChange = (value: string) => {
    setSubmissionError("");
    setRemindAt(value);
    captureDraft({ remindAt: value });
  };
  const handleDiscard = useCallback(async () => {
    if (!onDiscard || isSubmitting) return;
    await discard(onDiscard);
  }, [discard, isSubmitting, onDiscard]);

  // The popped-out composer reopens from the local draft, so keep writing
  // here if the latest edits could not be saved.
  const handlePopOut = async () => {
    if (!onPopOut || isSubmitting) return;
    if (await flushDraft()) onPopOut();
  };
  const popOutButton = onPopOut && (
    <Tooltip shortcuts={["popOutDraft"]}>
      <Button
        aria-label="Pop out draft"
        className="ml-auto size-7 shrink-0 hover:bg-transparent"
        disabled={isSubmitting}
        onClick={handlePopOut}
        size="icon"
        type="button"
        variant="ghostMuted"
      >
        <PictureInPicture2Icon className="size-4" />
      </Button>
    </Tooltip>
  );

  const forThisForm =
    (handler: () => void): ShortcutHandler =>
    (event) => {
      if (isShortcutForForm(event, formRef.current, shortcutOwnerId)) handler();
    };
  useShortcuts({
    send: forThisForm(() => {
      if (!isSubmitting) formRef.current?.requestSubmit();
    }),
    sendAndMarkDone: onMarkDone
      ? forThisForm(() => {
          const submitter = sendAndMarkDoneButtonRef.current;
          if (submitter && !isSubmitting)
            formRef.current?.requestSubmit(submitter);
        })
      : undefined,
    sendLater:
      canScheduleDelivery && !isSubmitting
        ? forThisForm(() => deliveryOptionsRef.current?.open("sendLater"))
        : undefined,
    remindMe:
      canScheduleDelivery && !isSubmitting
        ? forThisForm(() => deliveryOptionsRef.current?.open("remindMe"))
        : undefined,
    attachFiles: forThisForm(() => {
      if (!isSubmitting) attachmentInputRef.current?.click();
    }),
    popOutDraft: onPopOut ? forThisForm(handlePopOut) : undefined,
    discardDraft: onDiscard ? forThisForm(handleDiscard) : undefined,
  });

  return (
    <form
      data-inline-reply={isInlineReply || undefined}
      ref={formRef}
      style={
        isInlineReply && !isComposeWindow
          ? ({
              "--email-editor-content-min-height": "56px",
              "--email-editor-content-padding": "0.25rem 0",
            } as CSSProperties)
          : undefined
      }
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        isComposeWindow
          ? "flex h-full min-h-0 flex-col overflow-hidden [&_[data-email-editor-root]]:min-h-0 [&_[data-email-editor-root]]:flex-1"
          : "space-y-2",
        isInlineReply &&
          "[&_[data-email-editor-root]]:text-neutral-900 dark:[&_[data-email-editor-root]]:text-neutral-100",
        isInlineReply &&
          !isComposeWindow &&
          "space-y-2 border-t border-border pt-4",
      )}
    >
      <ComposeHeaderFields
        isComposeWindow={isComposeWindow}
        isInlineReply={isInlineReply}
        replyingToEmail={replyingToEmail}
        fromAccounts={fromAccounts}
        accountProvider={accountProvider}
        selectedEmailAccountId={selectedEmailAccountId}
        onSelectEmailAccount={onSelectEmailAccount}
        sendingAddress={sendingAddress}
        sendAsAddresses={sendAsAddresses}
        selectedSendAs={selectedSendAs}
        onChangeSendAs={changeSendAs}
        recipients={{ to: watch("to"), cc: watch("cc"), bcc: watch("bcc") }}
        onRecipientsChange={(field, recipients) => setValue(field, recipients)}
        pendingRecipientsRef={pendingRecipientsRef}
        onPendingRecipientChange={updatePendingRecipient}
        focusRecipientField={focusRecipientField}
        subjectRegisterProps={register("subject", { required: true })}
        subjectError={errors.subject}
        popOutButton={popOutButton}
      />

      <EmailEditor
        placeholder={isInlineReply ? "" : undefined}
        appearance={isComposeWindow || isInlineReply ? "seamless" : "contained"}
        autofocus={!focusRecipientField}
        onSlashKeyDown={onSlashKeyDown}
        onSlashTrigger={onSlashTrigger}
        ref={editorRef}
        initialHtml={initialDraft.editableHtml}
        mode={initialDraft.mode}
        onStateChange={handleEditorStateChange}
        onImageFiles={(files) => {
          addFiles(files, "inline").catch(() =>
            toastError({ description: "The image could not be read." }),
          );
        }}
        preservedBlocks={preservedBlocks}
        resolveRemoteImages={resolveRemoteImages}
      />

      <SendWarningsDialog
        warnings={sendWarnings}
        onDismiss={() => setSendWarnings([])}
        onSendAnyway={sendDespiteWarnings}
      />
      {submissionError && (
        <p
          role="alert"
          className={cn(
            "text-destructive text-sm",
            isComposeWindow && "shrink-0 px-4",
          )}
        >
          {submissionError}
        </p>
      )}
      <ComposeAttachmentList
        attachments={attachments}
        forwardedAttachments={forwardedAttachments}
        isComposeWindow={isComposeWindow}
        onRemove={removeAttachment}
      />

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
          isComposeWindow && "shrink-0 px-4 py-2",
        )}
      >
        <div className="flex flex-wrap items-center gap-1">
          <Tooltip
            shortcuts={onMarkDone ? ["send", "sendAndMarkDone"] : ["send"]}
          >
            <Button disabled={isSubmitting} type="submit" variant="gradient">
              {isSubmitting && <ButtonLoader />}
              Send
            </Button>
          </Tooltip>
          <button
            aria-hidden
            hidden
            ref={sendAndMarkDoneButtonRef}
            tabIndex={-1}
            type="submit"
          />
          {canScheduleDelivery && (
            <DeliveryOptions
              ref={deliveryOptionsRef}
              sendAt={sendAt}
              remindAt={remindAt}
              disabled={isSubmitting}
              onSendAtChange={handleSendAtChange}
              onRemindAtChange={handleRemindAtChange}
              shortcutOwnerId={shortcutOwnerId}
            />
          )}
        </div>

        <div className="flex items-center gap-0.5 text-muted-foreground">
          {snippetToolbar}
          <VoiceInput
            onInsert={(text) => {
              editorRef.current?.insertText(
                text.endsWith(" ") ? text : `${text} `,
              );
            }}
            onSend={(text) => {
              editorRef.current?.insertText(
                text.endsWith(" ") ? text : `${text} `,
              );
            }}
          />
          <input
            className="hidden"
            data-testid="compose-attachments-input"
            multiple
            onChange={handleFileInput("attachment")}
            ref={attachmentInputRef}
            type="file"
          />
          <Tooltip shortcuts={["attachFiles"]}>
            <Button
              aria-label="Attach files"
              className="hover:bg-transparent"
              disabled={isSubmitting}
              onClick={() => attachmentInputRef.current?.click()}
              size="icon"
              type="button"
              variant="ghostMuted"
            >
              <PaperclipIcon className="size-4" />
            </Button>
          </Tooltip>
          <input
            accept={EMAIL_INLINE_IMAGE_MIME_TYPES.join(",")}
            className="hidden"
            data-testid="compose-inline-image-input"
            multiple
            onChange={handleFileInput("inline")}
            ref={inlineImageInputRef}
            type="file"
          />
          <Button
            aria-label="Insert inline images"
            className="hover:bg-transparent"
            disabled={isSubmitting}
            onClick={() => inlineImageInputRef.current?.click()}
            size="icon"
            type="button"
            variant="ghostMuted"
          >
            <ImageIcon className="size-4" />
          </Button>
          {onDiscard && (
            <Tooltip shortcuts={["discardDraft"]}>
              <Button
                aria-label="Discard draft"
                className="hover:bg-transparent"
                disabled={isSubmitting}
                onClick={handleDiscard}
                size="icon"
                type="button"
                variant="ghostMuted"
              >
                <TrashIcon className="size-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      {providerAutosaveError && (
        <p role="alert" className="text-xs text-destructive">
          {providerAutosaveError}
        </p>
      )}
      {localDraftIdentity && draftSaveError && (
        <p role="alert" className="text-xs text-destructive">
          {draftSaveError}
        </p>
      )}
    </form>
  );
}

function getQueuedEmailDescription(
  reason: "offline" | "pending" | "blocked_auth",
) {
  if (reason === "offline") {
    return "Email queued. It will send when you're back online.";
  }
  if (reason === "blocked_auth") {
    return "Email queued. Reconnect this account to send it.";
  }
  return "Email queued and will keep sending in the background.";
}

function isShortcutForForm(
  event: KeyboardEvent | undefined,
  form: HTMLFormElement | null,
  shortcutOwnerId: string,
) {
  if (!(event?.target instanceof Node)) return false;
  if (form?.contains(event.target)) return true;
  if (!(event.target instanceof Element)) return false;

  return (
    event.target
      .closest("[data-compose-shortcut-owner]")
      ?.getAttribute("data-compose-shortcut-owner") === shortcutOwnerId
  );
}

/**
 * SWR's `mutate` rejects when the revalidation request fails. These refreshes
 * run after the send is already scheduled, so a failure is stale data, not a
 * failed send, and must never surface as one.
 */
async function refreshScheduledEmails(
  mutate: ScopedMutator,
  emailAccountId: string,
  threadId: string | null,
) {
  const keys = [
    upcomingScheduledEmailsKey(emailAccountId),
    ...(threadId ? [threadScheduledEmailsKey(emailAccountId, threadId)] : []),
  ];
  await Promise.all(keys.map((key) => mutate(key).catch(() => {})));
}
