"use client";

import {
  type EmailAttachmentMetadata,
  EMAIL_INLINE_IMAGE_MIME_TYPES,
  combineEmailHtml,
  detectInlineImageMimeType,
  finalizeEditableEmailHtml,
  prepareEmailDraft,
  validateEmailAttachmentMetadata,
} from "@inboxzero/email-editor/core";
import {
  EmailEditor,
  type EmailEditorHandle,
  type EmailEditorState,
} from "@inboxzero/email-editor/web";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  PictureInPicture2Icon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
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
import type { GetReferralCodeResponse } from "@/app/api/referrals/code/route";
import { ComposeContactRecipientField } from "./ComposeContactRecipientField";
import { Input } from "@/components/Input";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { threadScheduledEmailsKey } from "@/components/email-list/ThreadDeliveryStatus";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { env } from "@/env";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useLocalReplyDraft } from "@/hooks/useLocalReplyDraft";
import {
  DraftAutosaveHaltedError,
  useProviderDraftAutosave,
} from "@/hooks/useProviderDraftAutosave";
import {
  MailCoverageGate,
  useMailEngineDemand,
} from "@/utils/mail-engine/MailEngineHost";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import { useReplyDraftPersistence } from "@/hooks/useReplyDraftPersistence";
import { MAIL_SHORTCUT_SCOPES } from "@/lib/shortcuts/registry";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import {
  updateDraftAction,
  saveComposeDraftAction,
  discardComposeDraftAction,
} from "@/utils/actions/mail";
import { scheduleEmailAction } from "@/utils/actions/scheduled-email";
import { formatRecipientNames, splitRecipientList } from "@/utils/email";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import {
  getDraftSessionMessageIds,
  forgetReplyDraftProvider,
  getReplyDraft,
  rememberProviderDraftMessage,
  rememberReplacedDraftMessage,
  updateReplyDraftProviderState,
  type ReplyDraftContent,
  type ReplyDraftIdentity,
  type ReplyDraftMode,
} from "@/utils/mail-engine/reply-drafts";
import { createPreservedEmailBlocks } from "@/utils/email/preserved-blocks";
import { resolveSendDraftId } from "@/app/(app)/[emailAccountId]/compose/send-draft-reference";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { stripBrandingSignatures } from "@/utils/referral/signature";
import { renderSentWithFooterHtml } from "@/utils/email/sent-with-footer";
import {
  getActionErrorMessage,
  UNEXPECTED_ACTION_ERROR_MESSAGE,
} from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";
import { generateReferralLink } from "@/utils/referral/referral-link";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import { randomUuid } from "@/utils/uuid";
import type { DraftAttachment } from "@/utils/email/types";
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
import { beginUndoSend, UNDO_SEND_DELAY_MS } from "./undo-send";
import { getReplyToEmailPayload } from "./reply-to-email-payload";
import {
  enqueueDraftOperation,
  waitForDraftOperations,
} from "./draft-operation-queue";
import {
  forgetAttachedFiles,
  removeDraftAttachment,
  resolveDraftId,
  uploadDraftAttachment,
} from "./upload-draft-attachment";
import { useComposeDraftAttachments } from "./useComposeDraftAttachments";
import {
  type ComposeAttachment,
  getEditorInlineAttachments,
  mergeDraftAttachments,
  toAttachmentMetadata,
  toAttachmentReference,
} from "./compose-attachments";

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

type ComposeFormValues = Omit<SendEmailBody, "attachments" | "messageHtml">;

export function ComposeEmailForm(props: ComposeEmailFormProps) {
  useMailEngineDemand();
  return (
    <MailCoverageGate>
      <ComposeEmailFormWithEngine {...props} />
    </MailCoverageGate>
  );
}

function ComposeEmailFormWithEngine(props: ComposeEmailFormProps) {
  const { emailAccountId, provider } = useAccount();
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
  const selectedAccountProvider =
    props.fromAccounts?.find((account) => account.id === selectedEmailAccountId)
      ?.account.provider ?? provider;
  const includeSentWithFooter =
    !env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE &&
    Boolean(emailAccount?.includeSentWithSignature);
  const { data: referralCode, isLoading: isLoadingReferralCode } =
    useSWR<GetReferralCodeResponse>(
      includeSentWithFooter ? "/api/referrals/code" : null,
    );
  // A failed referral lookup still sends the footer, just without the referral link.
  const sentWithFooterHtml = includeSentWithFooter
    ? renderSentWithFooterHtml(
        referralCode?.code
          ? generateReferralLink(referralCode.code)
          : env.NEXT_PUBLIC_BASE_URL,
      )
    : "";

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
      error={error}
      loading={
        isLoading ||
        localDraft.isLoading ||
        draftAttachments.isLoading ||
        isLoadingReferralCode
      }
    >
      {emailAccount && (
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
            accountSignatureHtml={emailAccount.signature ?? ""}
            sendingAddress={emailAccount.email}
            sentWithFooterHtml={sentWithFooterHtml}
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
  sentWithFooterHtml: string;
  selectedEmailAccountId: string;
  onSelectEmailAccount: (emailAccountId: string) => void;
}) {
  const { userEmail } = useAccount();
  const isComposeWindow = layout === "window";
  const isInlineReply = Boolean(draftKeyMessageId && replyingToEmail?.threadId);
  const canScheduleDelivery = isInlineReply || isComposeWindow;
  const isNewCompose = !replyingToEmail && !providerDraftMessageId;
  const { mutate } = useSWRConfig();
  const client = useOptionalMailClient() ?? getActiveMailClient();
  const [sendAt, setSendAt] = useState(storedDraft?.content?.sendAt ?? "");
  const [remindAt, setRemindAt] = useState(
    storedDraft?.content?.remindAt ?? "",
  );
  const [requestId] = useState(
    () => storedDraft?.content?.requestId ?? randomUuid(),
  );
  const deliveryPath = useRef(storedDraft?.content?.deliveryPath);
  const [submissionError, setSubmissionError] = useState(() => {
    const times = parseDeliveryTimes(sendAt, remindAt);
    return times.valid ? "" : times.error;
  });
  const editorInitialized = useRef(false);
  const providerDraftId = useRef(
    initialDraftMissing
      ? undefined
      : (storedDraft?.content?.providerDraftId ?? initialProviderDraftId),
  );
  const draftQueueKey = `${selectedEmailAccountId}:${requestId}`;

  const [initialComposer] = useState(() => {
    // Copied because restoring marks the inline images the editor shows.
    const restoredAttachments = initialAttachments.map((attachment) => ({
      ...attachment,
    }));
    if (storedDraft?.content) {
      const { draft, preservedBlocks } = storedDraft.content;
      const parsedDraft = new DOMParser().parseFromString(
        draft.editableHtml,
        "text/html",
      );
      // HTML still in its original form is sent exactly as loaded, so its
      // cid: images must not be swapped for local previews.
      const images =
        draft.mode === "edited"
          ? parsedDraft.querySelectorAll(
              'img[data-content-id], img[src^="cid:"]',
            )
          : [];
      for (const image of images) {
        const contentId =
          image.getAttribute("data-content-id") ??
          image.getAttribute("src")?.slice(4);
        const attachment = restoredAttachments.find(
          (item) => item.contentId === contentId,
        );
        if (attachment && contentId) {
          // Without a preview the image still goes out as its attachment.
          image.setAttribute(
            "src",
            attachment.previewUrl ?? `cid:${contentId}`,
          );
          image.setAttribute("data-content-id", contentId);
          attachment.managed = true;
        }
      }
      return {
        draft: {
          ...draft,
          editableHtml: sentWithFooterHtml
            ? stripBrandingSignatures(parsedDraft.body.innerHTML)
            : parsedDraft.body.innerHTML,
        },
        preservedBlocks,
        attachments: restoredAttachments,
      };
    }

    const preparedDraft = prepareEmailDraft({
      html: replyingToEmail?.draftHtml ?? "",
      quotedHtml: replyingToEmail?.quotedContentHtml,
      signatureHtml:
        replyingToEmail?.signatureHtml ?? accountSignatureHtml ?? undefined,
    });
    // The footer travels with the signature so it lands right after it and is
    // removed with it, without introducing another block in the composer.
    const draft = {
      ...preparedDraft,
      editableHtml: sentWithFooterHtml
        ? stripBrandingSignatures(preparedDraft.editableHtml)
        : preparedDraft.editableHtml,
      signatureHtml: [preparedDraft.signatureHtml, sentWithFooterHtml]
        .filter(Boolean)
        .join("<br>"),
    };
    const preservedBlocks = createPreservedEmailBlocks(draft);
    return { draft, preservedBlocks, attachments: restoredAttachments };
  });
  const { draft: initialDraft, preservedBlocks } = initialComposer;
  const [activeRecipientField, setActiveRecipientField] =
    useState<ComposeRecipientField>("to");
  const pendingRecipientsRef = useRef<Record<ComposeRecipientField, string>>({
    to: "",
    cc: "",
    bcc: "",
  });
  const [contactsReconnectRequired, setContactsReconnectRequired] =
    useState(false);
  const [isReconnectingContacts, setIsReconnectingContacts] = useState(false);
  const [editReply, setEditReply] = useState(false);
  // Forwards start without a recipient, so focus To. Replies already have one.
  const focusRecipientField = draftMode === "forward" || !replyingToEmail;
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(
    initialComposer.attachments,
  );
  // Set once a reply or forward has put files on a mailbox draft. A forward's
  // draft then holds the forwarded files and lists them with the others.
  const [savedToMailbox, setSavedToMailbox] = useState(
    Boolean(providerDraftId.current),
  );
  const forwardedAttachments = savedToMailbox
    ? []
    : (replyingToEmail?.forwardedAttachments ?? []);
  const attachmentsRef = useRef<ComposeAttachment[]>(
    initialComposer.attachments,
  );
  const isMountedRef = useRef(true);
  const editorRef = useRef<EmailEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inlineReplySummaryButtonRef = useRef<HTMLButtonElement>(null);
  const collapseInlineReplyFieldsButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const sendAndMarkDoneButtonRef = useRef<HTMLButtonElement>(null);
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
    defaultValues: storedDraft?.content?.values ?? {
      replyToEmail: getReplyToEmailPayload(replyingToEmail),
      subject: replyingToEmail?.subject,
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
    const blocks = new Set(content.preservedBlocks.map((block) => block.id));
    return {
      subject: content.values.subject ?? "",
      to: content.values.to ?? "",
      cc: content.values.cc ?? "",
      bcc: content.values.bcc ?? "",
      messageHtml: combineEmailHtml({
        editableHtml: finalizeEditableEmailHtml({
          html: content.draft.editableHtml,
          inlineAttachments: getEditorInlineAttachments(attachmentsRef.current),
          mode: content.draft.mode,
        }),
        signatureHtml: blocks.has("signature")
          ? content.draft.signatureHtml
          : "",
        quotedHtml: blocks.has("quote") ? content.draft.quotedHtml : "",
      }),
    };
  };

  // Called when a provider save may have moved the draft to a new message
  // (Gmail does on every save) so the views that track it follow along.
  const followProviderDraftMessage = async (messageId: string | null) => {
    if (!messageId) return;
    if (providerDraftMessageId) {
      if (messageId === providerDraftMessageId) return;
      rememberReplacedDraftMessage(
        selectedEmailAccountId,
        providerDraftMessageId,
        messageId,
      );
      await ingestMailboxDraft(client, selectedEmailAccountId, messageId);
      return;
    }
    if (isNewCompose) {
      await ingestMailboxDraft(client, selectedEmailAccountId, messageId);
      return;
    }
    if (!localDraftIdentity) return;
    await rememberProviderDraftMessage(
      localDraftIdentity,
      requestId,
      messageId,
    );
  };

  // Every compose with files needs a mailbox draft to hold them. New messages
  // also get one from autosave; replies and forwards get one on first attach.
  const ensureProviderDraft = async () => {
    if (providerDraftId.current) return providerDraftId.current;
    if (providerDraftMessageId) {
      const draftId = await resolveDraftId({
        emailAccountId: selectedEmailAccountId,
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
    if (!draftId) {
      const content = getProviderDraftContent();
      if (!content) throw new Error("This draft is not ready to save yet.");
      const created = await saveComposeDraftAction(selectedEmailAccountId, {
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
      await followProviderDraftMessage(created.data.messageId);
    }
    providerDraftId.current = draftId;
    await updateReplyDraftProviderState(localDraftIdentity, requestId, draftId);
    return draftId;
  };

  // A reply or forward with a mailbox draft for its files saves its text there
  // too, so the mailbox copy never goes stale.
  const providerAutosave = useProviderDraftAutosave({
    enabled: Boolean(providerDraftMessageId) || isNewCompose || savedToMailbox,
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
          const result = await saveComposeDraftAction(selectedEmailAccountId, {
            draftId,
            content,
          });
          if (!result?.data) throw new Error(getDraftSyncErrorMessage(result));
          await followProviderDraftMessage(result.data.messageId);
          return;
        }
        const result = await updateDraftAction(selectedEmailAccountId, {
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
        await followProviderDraftMessage(result.data.messageId);
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

  // After each change the mailbox's list is the truth for files on the draft.
  // This keeps running after the composer closes, so the local draft still
  // records uploads that finish later.
  const reconcileDraftAttachments = (
    listed: DraftAttachment[],
    current = attachmentsRef.current,
  ) => updateAttachments(mergeDraftAttachments(current, listed));

  const uploadComposeAttachment = (file: File, attachment: ComposeAttachment) =>
    enqueueDraftOperation(draftQueueKey, async () => {
      const isAttached = () =>
        attachmentsRef.current.some((item) => item.id === attachment.id);
      if (!isAttached()) return;
      const draftId = await ensureProviderDraft();
      const result = await uploadDraftAttachment({
        emailAccountId: selectedEmailAccountId,
        draftId,
        file,
        attachment: toAttachmentMetadata(attachment),
      });
      await followProviderDraftMessage(result.messageId);
      if (isAttached()) return result;
      // Removed while uploading: take it back off the draft.
      const removed = await removeDraftAttachment({
        emailAccountId: selectedEmailAccountId,
        draftId,
        attachmentId: result.attachmentId,
      });
      await followProviderDraftMessage(removed.messageId);
    }).then(
      (result) => {
        if (!result) return;
        setSavedToMailbox(true);
        reconcileDraftAttachments(
          result.attachments,
          attachmentsRef.current.map((item) =>
            item.id === attachment.id
              ? {
                  ...item,
                  status: "uploaded",
                  draftAttachmentId: result.attachmentId,
                }
              : item,
          ),
        );
      },
      (error: unknown) => {
        const description =
          error instanceof Error
            ? error.message
            : `Could not attach ${attachment.filename}.`;
        toastError({ description });
        updateAttachments(
          attachmentsRef.current.map((item) =>
            item.id === attachment.id
              ? { ...item, status: "failed", error: description }
              : item,
          ),
        );
      },
    );

  const detachAttachment = (attachment: ComposeAttachment) => {
    revokePreview(attachment);
    updateAttachments(
      attachmentsRef.current.filter(
        (candidate) => candidate.id !== attachment.id,
      ),
    );
    forgetAttachedFiles(selectedEmailAccountId, [attachment.id]);
    const draftId = providerDraftId.current;
    const { draftAttachmentId } = attachment;
    // Uploads still running take the file back off the draft when they end.
    if (attachment.status !== "uploaded" || !draftAttachmentId || !draftId)
      return;
    enqueueDraftOperation(draftQueueKey, () =>
      removeDraftAttachment({
        emailAccountId: selectedEmailAccountId,
        draftId,
        attachmentId: draftAttachmentId,
      }),
    ).then(
      async (result) => {
        await followProviderDraftMessage(result.messageId);
        reconcileDraftAttachments(result.attachments);
      },
      (error: unknown) => {
        toastError({
          description:
            error instanceof Error
              ? error.message
              : `Could not remove ${attachment.filename}.`,
        });
        updateAttachments([
          ...attachmentsRef.current,
          { ...attachment, previewUrl: undefined, managed: false },
        ]);
      },
    );
  };

  const removeUnusedInlineAttachments = (contentIds: string[]) => {
    const referencedIds = new Set(contentIds);
    for (const attachment of attachmentsRef.current) {
      if (
        attachment.managed &&
        attachment.disposition === "inline" &&
        attachment.contentId &&
        !referencedIds.has(attachment.contentId)
      )
        detachAttachment(attachment);
    }
  };

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

  const addFiles = async (
    files: File[],
    disposition: ComposeAttachment["disposition"],
  ) => {
    if (isSubmitting) return;
    const created = files.map((file) => {
      const attachment: ComposeAttachment = {
        ...createComposeAttachmentMetadata(file, disposition),
        status: "uploading",
      };
      return { file, attachment };
    });
    const validation = validateEmailAttachmentMetadata([
      ...attachmentsRef.current.filter((item) => item.status !== "failed"),
      ...created.map(({ attachment }) => attachment),
    ]);
    if (!validation.valid) {
      toastError({ description: validation.error });
      return;
    }
    if (disposition === "inline") {
      for (const { file } of created) {
        if (!(await isInlineImageContent(file))) {
          toastError({
            description: "Inline image content does not match its file type.",
          });
          return;
        }
      }
      if (!isMountedRef.current) return;
    }

    const accepted = created.filter(({ file, attachment }) => {
      if (disposition !== "inline" || !attachment.contentId) return true;
      attachment.previewUrl = URL.createObjectURL(file);
      attachment.managed = true;
      const inserted = editorRef.current?.insertInlineImage({
        alt: attachment.filename,
        contentId: attachment.contentId,
        previewUrl: attachment.previewUrl,
      });
      if (inserted) return true;
      revokePreview(attachment);
      return false;
    });
    if (accepted.length !== created.length) {
      toastError({
        description: "One of the inline images could not be inserted.",
      });
    }
    if (!accepted.length) return;
    updateAttachments([
      ...attachmentsRef.current,
      ...accepted.map(({ attachment }) => attachment),
    ]);
    await Promise.all(
      accepted.map(({ file, attachment }) =>
        uploadComposeAttachment(file, attachment),
      ),
    );
  };

  const removeAttachment = (attachment: ComposeAttachment) => {
    // Detached first, so the editor change this causes finds nothing to remove.
    detachAttachment(attachment);
    if (attachment.contentId && attachment.managed) {
      editorRef.current?.removeInlineImage(attachment.contentId);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const previews = [...attachmentsRef.current];
      setTimeout(() => {
        if (!isMountedRef.current)
          for (const attachment of previews) revokePreview(attachment);
      }, 0);
    };
  }, []);

  const forgetAttachedComposeFiles = useCallback(
    () =>
      forgetAttachedFiles(
        selectedEmailAccountId,
        attachmentsRef.current.map((attachment) => attachment.id),
      ),
    [selectedEmailAccountId],
  );

  const onSubmit: SubmitHandler<ComposeFormValues> = useCallback(
    async (data, event) => {
      const submitter = (event?.nativeEvent as SubmitEvent | undefined)
        ?.submitter;
      const markDoneAfterSend = submitter === sendAndMarkDoneButtonRef.current;
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
            .catch(() => {});
          return;
        }
        await discardLocalDraft();
        if (outcome.status === "sent") {
          if (!isInlineReply) toastSuccess({ description: "Email sent!" });
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

  const reconnectContacts = async () => {
    setIsReconnectingContacts(true);

    try {
      const oauthProvider = isMicrosoftProvider(accountProvider)
        ? "microsoft"
        : "google";
      const url = await getAccountLinkingUrl(oauthProvider, {
        reconnectEmailAccountId: selectedEmailAccountId,
      });
      redirectToSafeUrl(url, { allowExternal: true });
    } catch (error) {
      toastError({
        title: "Error initiating reconnection",
        description:
          error instanceof Error
            ? error.message
            : "Please try again or contact support.",
      });
      setIsReconnectingContacts(false);
    }
  };

  const updatePendingRecipient = useCallback(
    (field: ComposeRecipientField, query: string) => {
      pendingRecipientsRef.current[field] = query;
      queueMicrotask(() => {
        if (isMountedRef.current) captureDraft();
      });
    },
    [captureDraft],
  );

  const recipientFieldProps = {
    emailAccountId: selectedEmailAccountId,
    ownAddresses: [sendingAddress],
    isReconnectingContacts,
    onActivate: setActiveRecipientField,
    onReconnectContacts: reconnectContacts,
    onReconnectRequired: () => setContactsReconnectRequired(true),
    onSearchQueryChange: updatePendingRecipient,
    onSelectedRecipientsChange: (
      field: ComposeRecipientField,
      recipients: string,
    ) => setValue(field, recipients),
    reconnectRequired: contactsReconnectRequired,
  };

  const handleFileInput =
    (disposition: ComposeAttachment["disposition"]) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length) {
        addFiles(files, disposition).catch(() =>
          toastError({ description: "One of the files could not be read." }),
        );
      }
    };
  const canCollapseInlineReplyFields =
    isInlineReply && Boolean(replyingToEmail?.to);
  const showInlineReplySummary = canCollapseInlineReplyFields && !editReply;
  const openInlineReplyFields = () => {
    setEditReply(true);
    requestAnimationFrame(() =>
      collapseInlineReplyFieldsButtonRef.current?.focus(),
    );
  };
  const closeInlineReplyFields = () => {
    setEditReply(false);
    requestAnimationFrame(() => inlineReplySummaryButtonRef.current?.focus());
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
          const result = await discardComposeDraftAction(
            selectedEmailAccountId,
            {
              draftId: providerDraftId.current,
            },
          );
          if (!result?.data)
            throw new Error(getActionErrorMessage(result ?? {}));
          await client?.requestSync([selectedEmailAccountId]);
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
    }
  }, [
    clearLocalDraft,
    client,
    draftQueueKey,
    forgetAttachedComposeFiles,
    isSubmitting,
    providerDraftMessageId,
    selectedEmailAccountId,
    localDraftIdentity,
    onDiscard,
    stopProviderAutosave,
    resumeProviderAutosave,
  ]);

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

  useShortcuts({
    send: (event) => {
      if (
        !isShortcutForForm(event, formRef.current, shortcutOwnerId) ||
        isSubmitting
      )
        return;
      formRef.current?.requestSubmit();
    },
    sendAndMarkDone: onMarkDone
      ? (event) => {
          if (
            !isShortcutForForm(event, formRef.current, shortcutOwnerId) ||
            isSubmitting
          )
            return;
          const submitter = sendAndMarkDoneButtonRef.current;
          if (submitter) formRef.current?.requestSubmit(submitter);
        }
      : undefined,
    sendLater:
      canScheduleDelivery && !isSubmitting
        ? (event) => {
            if (isShortcutForForm(event, formRef.current, shortcutOwnerId))
              deliveryOptionsRef.current?.open("sendLater");
          }
        : undefined,
    remindMe:
      canScheduleDelivery && !isSubmitting
        ? (event) => {
            if (isShortcutForForm(event, formRef.current, shortcutOwnerId))
              deliveryOptionsRef.current?.open("remindMe");
          }
        : undefined,
    attachFiles: (event) => {
      if (
        !isShortcutForForm(event, formRef.current, shortcutOwnerId) ||
        isSubmitting
      )
        return;
      attachmentInputRef.current?.click();
    },
    popOutDraft: onPopOut
      ? (event) => {
          if (isShortcutForForm(event, formRef.current, shortcutOwnerId))
            handlePopOut();
        }
      : undefined,
    discardDraft: onDiscard
      ? (event) => {
          if (isShortcutForForm(event, formRef.current, shortcutOwnerId))
            handleDiscard();
        }
      : undefined,
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
      <div className={cn(isComposeWindow ? "shrink-0 px-4 pt-3" : "contents")}>
        {!!fromAccounts?.length && !replyingToEmail && (
          <div className="flex min-h-7 items-center gap-2">
            <ComposeFieldLabel htmlFor="from-account" label="From" />
            <Select
              value={selectedEmailAccountId}
              onValueChange={onSelectEmailAccount}
            >
              <SelectTrigger
                aria-label="From"
                className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0 focus:ring-offset-0"
                id="from-account"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fromAccounts.map((account) => (
                  <SelectItem
                    disabled={Boolean(account.account.disconnectedAt)}
                    key={account.id}
                    value={account.id}
                  >
                    {account.name
                      ? `${account.name} (${account.email})`
                      : account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {showInlineReplySummary ? (
          <div className="flex min-h-7 items-center gap-2">
            <button
              type="button"
              aria-expanded={false}
              ref={inlineReplySummaryButtonRef}
              onClick={openInlineReplyFields}
              className="flex min-w-0 items-center gap-1.5 rounded-sm text-left text-sm font-medium leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-emerald-600 dark:text-emerald-400">
                Draft
              </span>
              <span className="min-w-0 truncate">
                to{" "}
                {formatRecipientNames(
                  [
                    ...splitRecipientList(
                      watch("to") ?? replyingToEmail?.to ?? "",
                    ),
                    ...splitRecipientList(
                      watch("cc") ?? replyingToEmail?.cc ?? "",
                    ),
                  ],
                  userEmail,
                ) || "recipients"}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </button>
            {popOutButton}
          </div>
        ) : (
          <div className="space-y-1 [&_input]:bg-transparent">
            {(["to", "cc", "bcc"] as const).map((field) => (
              <div key={field} className="flex min-h-7 items-center gap-2">
                <ComposeFieldLabel
                  htmlFor={field}
                  label={RECIPIENT_LABELS[field]}
                />
                <div className="min-w-0 flex-1">
                  {env.NEXT_PUBLIC_CONTACTS_ENABLED ||
                  client?.queryContactSuggestions ? (
                    <ComposeContactRecipientField
                      {...recipientFieldProps}
                      active={activeRecipientField === field}
                      autoFocus={field === "to" && focusRecipientField}
                      className="min-h-8"
                      name={field}
                      selectedRecipients={watch(field) ?? ""}
                    />
                  ) : (
                    <Input
                      type="text"
                      name={field}
                      registerProps={{
                        ...register(field, { required: field === "to" }),
                        autoFocus: field === "to" && focusRecipientField,
                      }}
                      error={errors[field]}
                      className="h-7 rounded-none border-0 bg-transparent p-0 text-sm leading-5 shadow-none focus:border-transparent focus:ring-0 sm:text-sm"
                    />
                  )}
                </div>
                {field === "to" && canCollapseInlineReplyFields && (
                  <button
                    type="button"
                    aria-label="Hide recipients"
                    ref={collapseInlineReplyFieldsButtonRef}
                    onClick={closeInlineReplyFields}
                    className="rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDownIcon className="size-3 rotate-180" />
                  </button>
                )}
                {field === "to" && popOutButton}
              </div>
            ))}
            <div className="pt-3">
              <Input
                type="text"
                name="subject"
                registerProps={register("subject", { required: true })}
                error={errors.subject}
                placeholder="Subject"
                className="h-8 rounded-none border-0 bg-transparent p-0 text-sm font-medium text-foreground shadow-none focus:border-transparent focus:ring-0 sm:text-sm"
              />
            </div>
          </div>
        )}
      </div>

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
      {!!(attachments.length || forwardedAttachments.length) && (
        <ul
          aria-label="Attachments"
          className={cn(
            "flex flex-wrap gap-2",
            isComposeWindow && "shrink-0 px-4 py-2",
          )}
        >
          {forwardedAttachments.map((attachment) => (
            <li
              className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              key={attachment.id}
              title="Included from the message you are forwarding"
            >
              <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="max-w-52 truncate">{attachment.filename}</span>
              <span className="text-muted-foreground">
                {formatFileSize(attachment.size)}
              </span>
            </li>
          ))}
          {attachments.map((attachment) => (
            <li
              aria-busy={attachment.status === "uploading" || undefined}
              className={cn(
                "flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs",
                attachment.status === "failed" &&
                  "border-destructive/50 text-destructive",
              )}
              key={attachment.id}
              title={attachment.error}
            >
              <AttachmentIcon attachment={attachment} />
              <span className="max-w-52 truncate">{attachment.filename}</span>
              <span className="text-muted-foreground">
                {ATTACHMENT_STATUS_LABELS[attachment.status] ??
                  formatFileSize(attachment.size)}
              </span>
              <button
                aria-label={`Remove ${attachment.filename}`}
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={() => removeAttachment(attachment)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

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
      {providerAutosave.error && (
        <p role="alert" className="text-xs text-destructive">
          {providerAutosave.error}
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

// Gmail rebuilds the whole message on each save, files included.
const GMAIL_ATTACHMENT_DRAFT_SAVE_INTERVAL_MS = 15_000;

const ATTACHMENT_STATUS_LABELS: Partial<
  Record<ComposeAttachment["status"], string>
> = {
  uploading: "Uploading…",
  failed: "Not attached",
};

const DRAFT_SYNC_FAILED_MESSAGE =
  "Couldn't sync this draft to your mailbox. It's saved on this device and we'll keep trying.";

const RECIPIENT_LABELS: Record<ComposeRecipientField, string> = {
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
};

function createComposeAttachmentMetadata(
  file: File,
  disposition: ComposeAttachment["disposition"],
): EmailAttachmentMetadata {
  const id = randomUuid();
  return {
    id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    disposition,
    ...(disposition === "inline"
      ? {
          contentId: `${id}@inboxzero.local`,
        }
      : {}),
  };
}

async function isInlineImageContent(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  let binary = "";
  for (const byte of header) binary += String.fromCharCode(byte);
  return detectInlineImageMimeType(btoa(binary)) === file.type;
}

function revokePreview(attachment: ComposeAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}

function AttachmentIcon({ attachment }: { attachment: ComposeAttachment }) {
  if (attachment.status === "uploading")
    return (
      <Loader2Icon aria-hidden className="size-3.5 shrink-0 animate-spin" />
    );
  if (attachment.status === "failed")
    return <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />;
  if (attachment.disposition === "inline")
    return <ImageIcon aria-hidden className="size-3.5 shrink-0" />;
  return <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />;
}

function ComposeFieldLabel({
  htmlFor,
  label,
}: {
  htmlFor: string;
  label: string;
}) {
  return (
    <label
      className="w-12 shrink-0 text-sm font-medium leading-5 text-foreground"
      htmlFor={htmlFor}
    >
      {label}
    </label>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

async function ingestMailboxDraft(
  client: ReturnType<typeof useOptionalMailClient>,
  emailAccountId: string,
  messageId: string,
) {
  if (!client) return;
  await client.ensureMessageContent({
    accountId: emailAccountId,
    messageId,
  });
  await client.requestSync([emailAccountId]);
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
    ["/api/user/scheduled-emails", emailAccountId],
    ...(threadId ? [threadScheduledEmailsKey(emailAccountId, threadId)] : []),
  ];
  await Promise.all(keys.map((key) => mutate(key).catch(() => {})));
}

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
