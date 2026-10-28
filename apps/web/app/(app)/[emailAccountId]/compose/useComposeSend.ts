import type { EmailEditorHandle } from "@inboxzero/email-editor/web";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { type RefObject, useCallback, useRef, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useSWRConfig } from "swr";
import type { ScopedMutator } from "swr";
import { threadScheduledEmailsKey } from "@/components/email-list/ThreadDeliveryStatus";
import { toastError, toastSuccess } from "@/components/Toast";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import {
  hideSendingDraftMessages,
  upcomingScheduledEmailsKey,
} from "@/hooks/useHiddenDraftMessageIds";
import { useAccount } from "@/providers/EmailAccountProvider";
import { scheduleEmailAction } from "@/utils/actions/scheduled-email";
import { prepareOutgoingInlineImages } from "@/utils/email/outgoing-inline-images";
import { getActionErrorMessage } from "@/utils/error";
import {
  getDraftSessionMessageIds,
  getReplyDraft,
  type ReplyDraftIdentity,
} from "@/utils/mail-engine/reply-drafts";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import type { ComposeFormValues, ReplyingToEmail } from "./ComposeEmailForm";
import { toAttachmentReference } from "./compose-attachments";
import { buildComposeMessageHtml } from "./compose-message-html";
import {
  type ComposeRecipientField,
  resolveComposeRecipientFields,
} from "./compose-recipients";
import { parseDeliveryTimes } from "./delivery-times";
import { waitForDraftOperations } from "./draft-operation-queue";
import type { createInitialComposeContent } from "./initial-compose-content";
import {
  queueReaderEmail,
  READER_EMAIL_SETTLEMENT_TIMEOUT_MS,
  waitForReaderEmailSettlement,
} from "./queued-reply";
import { getReplyToEmailPayload } from "./reply-to-email-payload";
import { resolveSendDraftId } from "./send-draft-reference";
import {
  getEditableText,
  getSendWarnings,
  type SendWarning,
} from "./send-warnings";
import {
  beginUndoSend,
  finishUndoSendToast,
  UNDO_SEND_DELAY_MS,
} from "./undo-send";
import type { useComposeDraft } from "./useComposeDraft";

export function useComposeSend({
  draft,
  initialComposer,
  emailAccountId: selectedEmailAccountId,
  client,
  editorRef,
  formRef,
  sendAndMarkDoneButtonRef,
  pendingRecipientsRef,
  forwardedAttachmentCount,
  sendAt,
  remindAt,
  setSubmissionError,
  isInlineReply,
  canScheduleDelivery,
  replyingToEmail,
  draftKeyMessageId,
  providerDraftMessageId,
  localDraftIdentity,
  refetch,
  onSuccess,
  onMarkDone,
  onSubmitting,
  onClose,
  onRestore,
}: {
  draft: ReturnType<typeof useComposeDraft>;
  initialComposer: ReturnType<typeof createInitialComposeContent>;
  emailAccountId: string;
  client: MailClient | null;
  editorRef: RefObject<EmailEditorHandle | null>;
  formRef: RefObject<HTMLFormElement | null>;
  sendAndMarkDoneButtonRef: RefObject<HTMLButtonElement | null>;
  pendingRecipientsRef: RefObject<Record<ComposeRecipientField, string>>;
  forwardedAttachmentCount: number;
  sendAt: string;
  remindAt: string;
  setSubmissionError: (error: string) => void;
  isInlineReply: boolean;
  canScheduleDelivery: boolean;
  replyingToEmail?: ReplyingToEmail;
  draftKeyMessageId?: string;
  providerDraftMessageId?: string;
  localDraftIdentity?: ReplyDraftIdentity;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onMarkDone?: () => void;
  onSubmitting?: (operationId: string) => () => void;
  /** Given the send's operation id when the email was queued to the outbox. */
  onClose?: (queuedOperationId?: string) => void;
  onRestore?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { showEmail } = useDisplayedEmail();
  const { mutate } = useSWRConfig();
  const {
    requestId,
    deliveryPath,
    providerDraftId,
    draftQueueKey,
    attachmentsRef,
    captureDraft,
    flushDraft,
    clearLocalDraft,
    stopProviderAutosave,
    resumeProviderAutosave,
    forgetAttachedComposeFiles,
  } = draft;
  const { draft: initialDraft, preservedBlocks } = initialComposer;
  const isNewCompose = !replyingToEmail && !providerDraftMessageId;
  const [sendWarnings, setSendWarnings] = useState<SendWarning[]>([]);
  const skipSendWarningsRef = useRef(false);
  const warnedSubmitterRef = useRef<HTMLElement | null>(null);

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
      const { editableHtml, messageHtml } = buildComposeMessageHtml({
        draft: {
          ...initialDraft,
          editableHtml: editorValue.editableHtml,
          mode: editorValue.mode,
        },
        preservedBlockIds: editorValue.preservedBlockIds,
        attachments: attachmentsRef.current,
      });
      const enrichedData: SendEmailBody = {
        ...data,
        subject: data.subject ?? "",
        ...recipients,
        replyToEmail: getReplyToEmailPayload(data.replyToEmail),
        messageHtml,
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
            attachmentsRef.current.length > 0 || forwardedAttachmentCount > 0,
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
          const publishInlineImages = await prepareOutgoingInlineImages(
            selectedEmailAccountId,
            attachmentsRef.current,
          );
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
            onSubmitting: (operationId) => {
              publishInlineImages(operationId);
              return onSubmitting?.(operationId) ?? (() => {});
            },
            onQueued: async (operationId) => {
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
              onClose?.(operationId);
            },
          });
        } catch (error) {
          // biome-ignore lint/suspicious/noConsole: send failures stay visible in the browser console
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
        // biome-ignore lint/suspicious/noConsole: send failures stay visible in the browser console
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
      forwardedAttachmentCount,
      getViewSentEmail,
      mutate,
      onClose,
      onRestore,
      onMarkDone,
      onSubmitting,
      onSuccess,
      preservedBlocks,
      providerDraftMessageId,
      refetch,
      replyingToEmail,
      selectedEmailAccountId,
      editorRef,
      pendingRecipientsRef,
      sendAndMarkDoneButtonRef,
      setSubmissionError,
    ],
  );

  const sendDespiteWarnings = useCallback(() => {
    skipSendWarningsRef.current = true;
    setSendWarnings([]);
    formRef.current?.requestSubmit(warnedSubmitterRef.current);
  }, [formRef]);

  return {
    onSubmit,
    sendWarnings,
    dismissSendWarnings: () => setSendWarnings([]),
    sendDespiteWarnings,
  };
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
