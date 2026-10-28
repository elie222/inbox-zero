"use client";

import {
  type EmailAttachmentMetadata,
  EMAIL_INLINE_IMAGE_MIME_TYPES,
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
import { useForm } from "react-hook-form";
import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import type { GetSendAsResponse } from "@/app/api/user/send-as/route";
import { formatSendAsAddress, type SendAsAddress } from "@/utils/email/send-as";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { getAccountScopedKey } from "@/utils/swr";
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
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import type {
  ReplyDraftIdentity,
  ReplyDraftMode,
} from "@/utils/mail-engine/reply-drafts";
import type { SendEmailBody } from "@/utils/types/mail";
import { cn } from "@/utils";
import type { ComposeRecipientField } from "./compose-recipients";
import { DeliveryOptions, type DeliveryOptionsHandle } from "./DeliveryOptions";
import { resolveRemoteImages } from "./resolve-remote-images";
import { useComposeSnippets } from "./useComposeSnippets";
import {
  getReminderAfterSendTimeChange,
  parseDeliveryTimes,
} from "./delivery-times";
import { getReplyToEmailPayload } from "./reply-to-email-payload";
import { SendWarningsDialog } from "./SendWarningsDialog";
import { useComposeDraftAttachments } from "./useComposeDraftAttachments";
import { useComposeDraft } from "./useComposeDraft";
import { useComposeAttachments } from "./useComposeAttachments";
import { useComposeSend } from "./useComposeSend";
import type { ComposeAttachment } from "./compose-attachments";
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
  /** Given the send's operation id just before it is queued to the outbox. */
  onSubmitting?: (operationId: string) => () => void;
  onClose?: (queuedOperationId?: string) => void;
  onRestore?: () => void;
  onDiscard?: (draftId?: string) => boolean | Promise<boolean>;
  onPopOut?: () => void;
  /** Text to quote into the body; cleared through `onQuoteInserted`. */
  quote?: string;
  onQuoteInserted?: () => void;
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
  onSubmitting,
  onClose,
  onRestore,
  onDiscard,
  onPopOut,
  quote,
  onQuoteInserted,
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
  const isComposeWindow = layout === "window";
  const isInlineReply = Boolean(draftKeyMessageId && replyingToEmail?.threadId);
  const canScheduleDelivery = isInlineReply || isComposeWindow;
  const initialSendAs = findSelectableSendAs(
    replyingToEmail?.fromHint,
    sendAsAddresses,
  );
  const initialFrom = initialSendAs && formatSendAsAddress(initialSendAs);
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
  const [editorReady, setEditorReady] = useState(false);

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
    attachments,
    captureDraft,
    flushDraft,
    draftSaveError,
    providerAutosaveError,
    discard,
    isDiscarding,
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
        setEditorReady(true);
      });
      return;
    }
    captureDraft();
  };

  // Inserted once the editor is live so the quote is captured into the draft.
  useEffect(() => {
    if (!quote || !editorReady) return;
    if (editorRef.current?.insertQuote(quote)) onQuoteInserted?.();
  }, [quote, editorReady, onQuoteInserted]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { onSubmit, sendWarnings, dismissSendWarnings, sendDespiteWarnings } =
    useComposeSend({
      draft,
      initialComposer,
      emailAccountId: selectedEmailAccountId,
      client,
      editorRef,
      formRef,
      sendAndMarkDoneButtonRef,
      pendingRecipientsRef,
      forwardedAttachmentCount: forwardedAttachments.length,
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
    });

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
        // Inline replies hide the subject, so a required one would block send
        // with no visible error when the thread or draft has none.
        subjectRegisterProps={register("subject", { required: !isInlineReply })}
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
        onDismiss={dismissSendWarnings}
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
            showShortcutLabels={!!onMarkDone}
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
                disabled={isSubmitting || isDiscarding}
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
