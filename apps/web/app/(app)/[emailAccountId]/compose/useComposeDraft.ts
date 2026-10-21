import type { EmailEditorHandle } from "@inboxzero/email-editor/web";
import type { MailClient } from "@inboxzero/mail-core/engine";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { UseFormGetValues, UseFormWatch } from "react-hook-form";
import { toastError } from "@/components/Toast";
import {
  DraftAutosaveHaltedError,
  useProviderDraftAutosave,
} from "@/hooks/useProviderDraftAutosave";
import { useReplyDraftPersistence } from "@/hooks/useReplyDraftPersistence";
import {
  discardComposeDraftAction,
  saveComposeDraftAction,
  updateDraftAction,
} from "@/utils/actions/mail";
import { isGoogleProvider } from "@/utils/email/provider-types";
import {
  getActionErrorMessage,
  UNEXPECTED_ACTION_ERROR_MESSAGE,
} from "@/utils/error";
import {
  forgetReplyDraftProvider,
  getReplyDraft,
  type ReplyDraftContent,
  type ReplyDraftIdentity,
  type ReplyDraftMode,
  type StoredReplyDraft,
  updateReplyDraftProviderState,
} from "@/utils/mail-engine/reply-drafts";
import { randomUuid } from "@/utils/uuid";
import type { ComposeFormValues } from "./ComposeEmailForm";
import {
  type ComposeAttachment,
  toAttachmentReference,
} from "./compose-attachments";
import { buildComposeMessageHtml } from "./compose-message-html";
import type { ComposeRecipientField } from "./compose-recipients";
import {
  enqueueDraftOperation,
  waitForDraftOperations,
} from "./draft-operation-queue";
import { followProviderDraftMessage } from "./follow-provider-draft-message";
import type { createInitialComposeContent } from "./initial-compose-content";
import { getReplyToEmailPayload } from "./reply-to-email-payload";
import { forgetAttachedFiles, resolveDraftId } from "./upload-draft-attachment";

export function useComposeDraft({
  emailAccountId,
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
}: {
  emailAccountId: string;
  accountProvider: string;
  client: MailClient | null;
  storedDraft?: StoredReplyDraft;
  draftLoadError?: Error;
  localDraftIdentity?: ReplyDraftIdentity;
  providerDraftMessageId?: string;
  initialProviderDraftId?: string;
  initialDraftMissing: boolean;
  draftMode?: ReplyDraftMode;
  initialComposer: ReturnType<typeof createInitialComposeContent>;
  editorRef: RefObject<EmailEditorHandle | null>;
  getValues: UseFormGetValues<ComposeFormValues>;
  watch: UseFormWatch<ComposeFormValues>;
  pendingRecipientsRef: RefObject<Record<ComposeRecipientField, string>>;
  sendAt: string;
  remindAt: string;
}) {
  const [requestId] = useState(
    () => storedDraft?.content?.requestId ?? randomUuid(),
  );
  const deliveryPath = useRef(storedDraft?.content?.deliveryPath);
  const providerDraftId = useRef(
    initialDraftMissing
      ? undefined
      : (storedDraft?.content?.providerDraftId ?? initialProviderDraftId),
  );
  const draftQueueKey = `${emailAccountId}:${requestId}`;
  const { draft: initialDraft, preservedBlocks } = initialComposer;
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(
    initialComposer.attachments,
  );
  const attachmentsRef = useRef<ComposeAttachment[]>(
    initialComposer.attachments,
  );

  const lastDraftContent = useRef<ReplyDraftContent | undefined>(undefined);
  const getDraftContent = (options?: {
    sendAt?: string;
    remindAt?: string;
  }): ReplyDraftContent | undefined => {
    if (!editorRef.current)
      return lastDraftContent.current
        ? {
            ...lastDraftContent.current,
            providerDraftId: providerDraftId.current,
            attachments: attachmentsRef.current.flatMap(toAttachmentReference),
          }
        : undefined;
    const value = editorRef.current.getValue();
    const values = { ...getValues() };
    for (const field of ["to", "cc", "bcc"] as const) {
      const pending = pendingRecipientsRef.current[field].trim();
      if (pending)
        values[field] = [values[field], pending].filter(Boolean).join(", ");
    }
    const content: ReplyDraftContent = {
      providerDraftId: providerDraftId.current,
      composeMode: draftMode,
      requestId,
      deliveryPath: deliveryPath.current,
      values,
      draft: {
        ...initialDraft,
        editableHtml: value.editableHtml,
        mode: value.mode,
      },
      preservedBlocks: preservedBlocks.filter((block) =>
        value.preservedBlockIds.includes(block.id),
      ),
      attachments: attachmentsRef.current.flatMap(toAttachmentReference),
      sendAt: options?.sendAt ?? sendAt,
      remindAt: options?.remindAt ?? remindAt,
    };
    lastDraftContent.current = content;
    return content;
  };
  const {
    capture: captureLocalDraft,
    clear: clearLocalDraft,
    flush: flushDraft,
    saveError: draftSaveError,
  } = useReplyDraftPersistence({
    identity: localDraftIdentity,
    initialRevision: storedDraft?.revision,
    loadError: draftLoadError,
    getContent: getDraftContent,
  });
  const getProviderDraftContent = () => {
    const content = getDraftContent();
    if (!content) return;
    return {
      subject: content.values.subject ?? "",
      from: content.values.from,
      to: content.values.to ?? "",
      cc: content.values.cc ?? "",
      bcc: content.values.bcc ?? "",
      messageHtml: buildComposeMessageHtml({
        draft: content.draft,
        preservedBlockIds: content.preservedBlocks.map((block) => block.id),
        attachments: attachmentsRef.current,
      }).messageHtml,
    };
  };

  const followDraftMessage = (messageId: string | null) =>
    followProviderDraftMessage({
      client,
      emailAccountId,
      messageId,
      openedDraftMessageId: providerDraftMessageId,
      localDraft: localDraftIdentity && {
        identity: localDraftIdentity,
        requestId,
      },
    });

  // Every compose with files needs a mailbox draft to hold them. New messages
  // also get one from autosave; replies and forwards get one on first attach.
  const ensureProviderDraft = async () => {
    if (providerDraftId.current) return providerDraftId.current;
    if (providerDraftMessageId) {
      const draftId = await resolveDraftId({
        emailAccountId,
        messageId: providerDraftMessageId,
      });
      if (!draftId)
        throw new Error(
          "Could not find this draft in your mailbox. Reopen it and try again.",
        );
      providerDraftId.current = draftId;
      return draftId;
    }
    if (!localDraftIdentity)
      throw new Error("Local draft storage is required to save attachments.");
    const deletedDraftId = storedDraft?.content?.providerDraftId;
    if (initialDraftMissing && deletedDraftId)
      await forgetReplyDraftProvider(localDraftIdentity, deletedDraftId);
    captureLocalDraft();
    await flushDraft();
    let draftId = await updateReplyDraftProviderState(
      localDraftIdentity,
      requestId,
    );
    let createdMessageId: string | null = null;
    if (!draftId) {
      const content = getProviderDraftContent();
      if (!content) throw new Error("This draft is not ready to save yet.");
      const created = await saveComposeDraftAction(emailAccountId, {
        content: {
          ...content,
          replyToEmail: getReplyToEmailPayload(getValues("replyToEmail")),
        },
      });
      if (!created?.data)
        throw new Error(
          "Mailbox draft creation could not be confirmed. Check Drafts in Gmail or Outlook; your message is still saved on this device.",
        );
      draftId = created.data.draftId;
      createdMessageId = created.data.messageId;
    }
    // Keep the reference durable if the composer closes during mailbox sync.
    providerDraftId.current = draftId;
    await updateReplyDraftProviderState(localDraftIdentity, requestId, draftId);
    if (createdMessageId) await followDraftMessage(createdMessageId);
    return draftId;
  };

  // Replies and forwards sync their text even before any files are attached.
  const providerAutosave = useProviderDraftAutosave({
    enabled: Boolean(providerDraftMessageId) || Boolean(localDraftIdentity),
    sessionKey: providerDraftMessageId ? undefined : draftQueueKey,
    minIntervalMs:
      attachments.length && isGoogleProvider(accountProvider)
        ? GMAIL_ATTACHMENT_DRAFT_SAVE_INTERVAL_MS
        : 0,
    getContent: getProviderDraftContent,
    save: (content) =>
      enqueueDraftOperation(draftQueueKey, async () => {
        if (!providerDraftMessageId) {
          const draftId = await ensureProviderDraft();
          const result = await saveComposeDraftAction(emailAccountId, {
            draftId,
            content,
          });
          if (!result?.data) throw new Error(getDraftSyncErrorMessage(result));
          await followDraftMessage(result.data.messageId);
          return;
        }
        const result = await updateDraftAction(emailAccountId, {
          ...content,
          draftMessageId: providerDraftMessageId,
          draftId: providerDraftId.current,
        });
        if (!result?.data) throw new Error(getDraftSyncErrorMessage(result));
        if (result.data.status === "missing")
          throw new DraftAutosaveHaltedError(
            "This draft was sent, deleted, or changed elsewhere, so edits here are no longer saved to your mailbox.",
          );
        providerDraftId.current = result.data.draftId;
        captureLocalDraft();
        await flushDraft();
        await followDraftMessage(result.data.messageId);
      }),
  });
  const { stop: stopProviderAutosave, resume: resumeProviderAutosave } =
    providerAutosave;
  const captureDraft = useCallback(
    (options?: { sendAt?: string; remindAt?: string }) => {
      captureLocalDraft(options);
      providerAutosave.capture();
    },
    [captureLocalDraft, providerAutosave.capture],
  );
  useEffect(() => {
    if (storedDraft?.content) captureDraft();
  }, [storedDraft, captureDraft]);
  useEffect(() => {
    const subscription = watch(() => captureDraft());
    return () => subscription.unsubscribe();
  }, [captureDraft, watch]);

  const updateAttachments = useCallback(
    (next: ComposeAttachment[]) => {
      attachmentsRef.current = next;
      setAttachments(next);
      captureDraft();
    },
    [captureDraft],
  );

  const forgetAttachedComposeFiles = useCallback(
    () =>
      forgetAttachedFiles(
        emailAccountId,
        attachmentsRef.current.map((attachment) => attachment.id),
      ),
    [emailAccountId],
  );

  const discarding = useRef(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const discard = useCallback(
    async (onDiscard: (draftId?: string) => boolean | Promise<boolean>) => {
      if (discarding.current) return;
      discarding.current = true;
      setIsDiscarding(true);
      try {
        await stopProviderAutosave();
        await waitForDraftOperations(draftQueueKey);
        // A draft opened from the mailbox is discarded by its owner; any other
        // compose discards the mailbox draft it saved.
        if (!providerDraftMessageId) {
          const local = localDraftIdentity
            ? await getReplyDraft(localDraftIdentity)
            : undefined;
          providerDraftId.current =
            local?.content?.providerDraftId ?? providerDraftId.current;
          if (providerDraftId.current) {
            const result = await discardComposeDraftAction(emailAccountId, {
              draftId: providerDraftId.current,
            });
            if (!result?.data)
              throw new Error(getActionErrorMessage(result ?? {}));
            await client?.requestSync([emailAccountId]);
          }
          if (
            !providerDraftId.current &&
            local?.content?.providerDraftCreationUnconfirmed
          )
            toastError({
              description:
                "The local draft will be discarded. A mailbox draft may still exist; check Drafts in Gmail or Outlook.",
            });
        }
        if ((await onDiscard(providerDraftId.current)) === false) {
          resumeProviderAutosave();
          return;
        }
        forgetAttachedComposeFiles();
        await clearLocalDraft();
      } catch (error) {
        resumeProviderAutosave();
        toastError({
          description:
            error instanceof Error
              ? error.message
              : "Could not discard this draft.",
        });
      } finally {
        discarding.current = false;
        setIsDiscarding(false);
      }
    },
    [
      clearLocalDraft,
      client,
      draftQueueKey,
      forgetAttachedComposeFiles,
      providerDraftMessageId,
      emailAccountId,
      localDraftIdentity,
      stopProviderAutosave,
      resumeProviderAutosave,
    ],
  );

  return {
    requestId,
    deliveryPath,
    providerDraftId,
    draftQueueKey,
    attachments,
    attachmentsRef,
    updateAttachments,
    captureDraft,
    flushDraft,
    clearLocalDraft,
    draftSaveError,
    providerAutosaveError: providerAutosave.error,
    stopProviderAutosave,
    resumeProviderAutosave,
    ensureProviderDraft,
    followDraftMessage,
    forgetAttachedComposeFiles,
    discard,
    isDiscarding,
  };
}

// Gmail rebuilds the whole message on each save, files included.
const GMAIL_ATTACHMENT_DRAFT_SAVE_INTERVAL_MS = 15_000;

const DRAFT_SYNC_FAILED_MESSAGE =
  "Couldn't sync this draft to your mailbox. It's saved on this device and we'll keep trying.";

// Unexpected server failures are usually transient and the autosave retries
// them, so they get reassuring copy. Specific rejections (a draft that was
// sent or deleted elsewhere, an expired session) are shown as-is.
function getDraftSyncErrorMessage(
  result: { serverError?: string } | undefined,
) {
  const message = getActionErrorMessage(
    result ?? {},
    DRAFT_SYNC_FAILED_MESSAGE,
  );
  return message === UNEXPECTED_ACTION_ERROR_MESSAGE
    ? DRAFT_SYNC_FAILED_MESSAGE
    : message;
}
