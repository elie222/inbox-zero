"use client";

import {
  type EmailComposerAttachment,
  type EmailAttachmentMetadata,
  EMAIL_INLINE_IMAGE_MIME_TYPES,
  combineEmailHtml,
  finalizeEditableEmailHtml,
  prepareEmailDraft,
  validateEmailAttachmentMetadata,
  validateEmailAttachments,
} from "@inboxzero/email-editor/core";
import {
  EmailEditor,
  type EmailEditorHandle,
  type EmailEditorState,
} from "@inboxzero/email-editor/web";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  CheckCircleIcon,
  ImageIcon,
  PaperclipIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";
import type {
  ContactsErrorResponse,
  ContactsResponse,
} from "@/app/api/user/contacts/route";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { Input, Label } from "@/components/Input";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { sendEmailAction } from "@/utils/actions/mail";
import {
  extractNameFromEmail,
  isValidEmail,
  splitRecipientList,
} from "@/utils/email";
import { createPreservedEmailBlocks } from "@/utils/email/preserved-blocks";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import { randomUuid } from "@/utils/uuid";
import { cn } from "@/utils";
import {
  type ComposeRecipientField,
  resolveComposeRecipientFields,
  resolveComposeRecipients,
  resolveRecipientSelection,
} from "./compose-recipients";
import { useLocalReplyDraft } from "@/hooks/useLocalReplyDraft";
import {
  createReplyDraftWriter,
  type ReplyDraftContent,
} from "@/utils/email-cache/reply-drafts";
import type { StoredReplyDraft } from "@/utils/email-cache/database";
import { scheduleEmailAction } from "@/utils/actions/scheduled-email";
import { DeliveryOptions } from "./DeliveryOptions";
import { useSWRConfig } from "swr";
import {
  getReminderAfterSendTimeChange,
  parseDeliveryTimes,
} from "./delivery-times";
import { queueReaderEmail } from "./queued-reply";

export type ReplyingToEmail = {
  threadId?: string;
  headerMessageId?: string;
  messageId?: string;
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
  draftKeyMessageId?: string;
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onClose?: () => void;
  onDiscard?: () => void;
};

type ComposeAttachment = EmailComposerAttachment & {
  previewUrl?: string;
};

type ComposeFormValues = Omit<SendEmailBody, "attachments" | "messageHtml">;

export function ComposeEmailForm(props: ComposeEmailFormProps) {
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

  const localDraft = useLocalReplyDraft(
    props.draftKeyMessageId && props.replyingToEmail?.threadId
      ? {
          emailAccountId: selectedEmailAccountId,
          threadId: props.replyingToEmail.threadId,
          messageId: props.draftKeyMessageId,
        }
      : undefined,
  );
  return (
    <LoadingContent error={error} loading={isLoading || localDraft.isLoading}>
      {emailAccount && (
        <ComposeEmailFormContent
          {...props}
          storedDraft={localDraft.draft}
          draftLoadError={localDraft.error}
          accountProvider={selectedAccountProvider}
          accountSignatureHtml={emailAccount.signature ?? ""}
          key={`${selectedEmailAccountId}:${props.replyingToEmail?.threadId ?? ""}:${props.draftKeyMessageId ?? ""}`}
          onSelectEmailAccount={setSelectedEmailAccountId}
          selectedEmailAccountId={selectedEmailAccountId}
        />
      )}
    </LoadingContent>
  );
}

function ComposeEmailFormContent({
  layout = "default",
  draftKeyMessageId,
  storedDraft,
  draftLoadError,
  replyingToEmail,
  fromAccounts,
  accountProvider,
  accountSignatureHtml,
  selectedEmailAccountId,
  onSelectEmailAccount,
  refetch,
  onSuccess,
  onClose,
  onDiscard,
}: ComposeEmailFormProps & {
  storedDraft?: StoredReplyDraft;
  draftLoadError?: Error;
  accountProvider: string;
  accountSignatureHtml: string;
  selectedEmailAccountId: string;
  onSelectEmailAccount: (emailAccountId: string) => void;
}) {
  const isComposeWindow = layout === "window";
  const isInlineReply = Boolean(draftKeyMessageId && replyingToEmail?.threadId);
  const { mutate } = useSWRConfig();
  const [sendAt, setSendAt] = useState(storedDraft?.content?.sendAt ?? "");
  const [remindAt, setRemindAt] = useState(
    storedDraft?.content?.remindAt ?? "",
  );
  const [requestId] = useState(
    () => storedDraft?.content?.requestId ?? randomUuid(),
  );
  const deliveryPath = useRef(storedDraft?.content?.deliveryPath);
  const [saveStatus, setSaveStatus] = useState(
    draftLoadError?.message ??
      (storedDraft?.content ? "Saved on this device" : ""),
  );
  const [submissionError, setSubmissionError] = useState(() => {
    const times = parseDeliveryTimes(sendAt, remindAt);
    return times.valid ? "" : times.error;
  });
  const [draftWriter] = useState(() =>
    isInlineReply
      ? createReplyDraftWriter(
          {
            emailAccountId: selectedEmailAccountId,
            threadId: replyingToEmail!.threadId!,
            messageId: draftKeyMessageId!,
          },
          storedDraft?.revision,
        )
      : undefined,
  );
  const draftStopped = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const latestDraft = useRef<ReplyDraftContent | undefined>(undefined);
  const saveDraftRef = useRef<
    (options?: { sendAt?: string; remindAt?: string }) => void
  >(() => {});
  const editorInitialized = useRef(false);
  const lastSavedSnapshot = useRef<string | undefined>(undefined);
  const latestDraftSnapshot = useRef<string | undefined>(undefined);

  const [restoredAttachments] = useState<ComposeAttachment[]>(() =>
    (storedDraft?.content?.attachments ?? []).map((attachment) => ({
      ...attachment,
      previewUrl:
        attachment.disposition === "inline"
          ? URL.createObjectURL(
              new Blob(
                [
                  Uint8Array.from(atob(attachment.contentBase64), (character) =>
                    character.charCodeAt(0),
                  ),
                ],
                { type: attachment.mimeType },
              ),
            )
          : undefined,
    })),
  );
  const [initialComposer] = useState(() => {
    if (storedDraft?.content) {
      const { draft, preservedBlocks } = storedDraft.content;
      const parsedDraft = new DOMParser().parseFromString(
        draft.editableHtml,
        "text/html",
      );
      for (const image of parsedDraft.querySelectorAll(
        'img[data-content-id], img[src^="cid:"]',
      )) {
        const contentId =
          image.getAttribute("data-content-id") ??
          image.getAttribute("src")?.slice(4);
        const attachment = restoredAttachments.find(
          (item) => item.contentId === contentId,
        );
        if (attachment?.previewUrl && contentId) {
          image.setAttribute("src", attachment.previewUrl);
          image.setAttribute("data-content-id", contentId);
        }
      }
      return {
        draft: { ...draft, editableHtml: parsedDraft.body.innerHTML },
        preservedBlocks,
      };
    }

    const draft = prepareEmailDraft({
      html: replyingToEmail?.draftHtml ?? "",
      quotedHtml: replyingToEmail?.quotedContentHtml,
      signatureHtml:
        replyingToEmail?.signatureHtml ?? accountSignatureHtml ?? undefined,
    });
    const preservedBlocks = createPreservedEmailBlocks(draft);
    return { draft, preservedBlocks };
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
  const [showCcBcc, setShowCcBcc] = useState(
    Boolean(
      storedDraft?.content?.values.cc ||
        storedDraft?.content?.values.bcc ||
        replyingToEmail?.cc ||
        replyingToEmail?.bcc,
    ),
  );
  const focusRecipientField = !replyingToEmail;
  const [attachments, setAttachments] =
    useState<ComposeAttachment[]>(restoredAttachments);
  const attachmentsRef = useRef<ComposeAttachment[]>(restoredAttachments);
  const isMountedRef = useRef(true);
  const editorRef = useRef<EmailEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hideCcBccButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const { symbol } = useModifierKey();
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

  const persistDraft = useCallback(() => {
    clearTimeout(draftTimer.current);
    const content = latestDraft.current;
    if (!content || !draftWriter || draftStopped.current) return;
    const snapshot = latestDraftSnapshot.current;
    if (snapshot === lastSavedSnapshot.current) {
      if (isMountedRef.current) setSaveStatus("Saved on this device");
      return;
    }
    draftWriter.save(content).then(
      () => {
        lastSavedSnapshot.current = snapshot;
        if (
          isMountedRef.current &&
          !draftStopped.current &&
          latestDraftSnapshot.current === snapshot
        )
          setSaveStatus("Saved on this device");
      },
      (error) => {
        if (isMountedRef.current)
          setSaveStatus(
            error instanceof Error
              ? error.message
              : "Could not save draft on this device.",
          );
      },
    );
  }, [draftWriter]);
  saveDraftRef.current = (options) => {
    if (!draftWriter || draftStopped.current || !editorRef.current) return;
    const value = editorRef.current.getValue();
    const values = { ...getValues() };
    for (const field of ["to", "cc", "bcc"] as const) {
      const pending = pendingRecipientsRef.current[field].trim();
      if (pending)
        values[field] = [values[field], pending].filter(Boolean).join(", ");
    }
    const content: ReplyDraftContent = {
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
      attachments: attachmentsRef.current.map(
        ({ previewUrl: _previewUrl, ...attachment }) => attachment,
      ),
      sendAt: options?.sendAt ?? sendAt,
      remindAt: options?.remindAt ?? remindAt,
    };
    const snapshot = getReplyDraftSnapshot(content);
    if (snapshot === latestDraftSnapshot.current) return;
    latestDraftSnapshot.current = snapshot;
    latestDraft.current = content;
    setSaveStatus("Saving…");
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(persistDraft, 300);
  };
  useEffect(() => {
    const subscription = watch(() => saveDraftRef.current());
    return () => subscription.unsubscribe();
  }, [watch]);
  useEffect(
    () => () => {
      persistDraft();
    },
    [persistDraft],
  );
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") persistDraft();
    };
    window.addEventListener("pagehide", persistDraft);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistDraft);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [persistDraft]);
  const clearLocalDraft = useCallback(async () => {
    draftStopped.current = true;
    clearTimeout(draftTimer.current);
    await draftWriter?.clear();
  }, [draftWriter]);

  const updateAttachments = useCallback((next: ComposeAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
    saveDraftRef.current();
  }, []);

  const removeUnusedInlineAttachments = useCallback(
    (contentIds: string[]) => {
      const referencedIds = new Set(contentIds);
      const removed = attachmentsRef.current.filter(
        (attachment) =>
          attachment.disposition === "inline" &&
          attachment.contentId &&
          !referencedIds.has(attachment.contentId),
      );
      if (!removed.length) return;

      for (const attachment of removed) revokePreview(attachment);
      updateAttachments(
        attachmentsRef.current.filter(
          (attachment) => !removed.some((item) => item.id === attachment.id),
        ),
      );
    },
    [updateAttachments],
  );

  const handleEditorStateChange = useCallback(
    (state: EmailEditorState) => {
      removeUnusedInlineAttachments(state.inlineContentIds);
      if (!editorInitialized.current) {
        queueMicrotask(() => {
          editorInitialized.current = true;
        });
        return;
      }
      saveDraftRef.current();
    },
    [removeUnusedInlineAttachments],
  );

  const addFiles = useCallback(
    async (files: File[], disposition: ComposeAttachment["disposition"]) => {
      if (disposition === "inline" && initialDraft.mode === "fallback") {
        toastError({
          description:
            "Inline images are unavailable while preserving this draft's original formatting.",
        });
        return;
      }

      const attachmentDrafts = files.map((file) =>
        createComposeAttachmentMetadata(file, disposition),
      );
      const validation = validateEmailAttachmentMetadata([
        ...attachmentsRef.current,
        ...attachmentDrafts,
      ]);
      if (!validation.valid) {
        toastError({ description: validation.error });
        return;
      }

      const contents = await Promise.all(files.map(readFileAsBase64));
      if (!isMountedRef.current) return;

      const currentValidation = validateEmailAttachmentMetadata([
        ...attachmentsRef.current,
        ...attachmentDrafts,
      ]);
      if (!currentValidation.valid) {
        toastError({ description: currentValidation.error });
        return;
      }

      const encodedAttachments = attachmentDrafts.map((attachment, index) => ({
        ...attachment,
        contentBase64: contents[index] ?? "",
      }));
      const contentValidation = validateEmailAttachments([
        ...attachmentsRef.current,
        ...encodedAttachments,
      ]);
      if (!contentValidation.valid) {
        toastError({ description: contentValidation.error });
        return;
      }

      const createdAttachments: ComposeAttachment[] =
        encodedAttachments.flatMap((attachment, index) => {
          if (disposition !== "inline") return [attachment];
          const file = files[index];
          if (!file) return [];
          return [{ ...attachment, previewUrl: URL.createObjectURL(file) }];
        });
      const acceptedAttachments = createdAttachments.filter((attachment) => {
        if (
          attachment.disposition !== "inline" ||
          !attachment.contentId ||
          !attachment.previewUrl
        ) {
          return true;
        }

        const inserted = editorRef.current?.insertInlineImage({
          alt: attachment.filename,
          contentId: attachment.contentId,
          previewUrl: attachment.previewUrl,
        });
        if (inserted) return true;
        revokePreview(attachment);
        return false;
      });

      if (acceptedAttachments.length !== createdAttachments.length) {
        toastError({
          description: "One of the inline images could not be inserted.",
        });
      }
      updateAttachments([...attachmentsRef.current, ...acceptedAttachments]);
    },
    [initialDraft.mode, updateAttachments],
  );

  const removeAttachment = useCallback(
    (attachment: ComposeAttachment) => {
      if (attachment.contentId) {
        editorRef.current?.removeInlineImage(attachment.contentId);
      }
      revokePreview(attachment);
      updateAttachments(
        attachmentsRef.current.filter(
          (candidate) => candidate.id !== attachment.id,
        ),
      );
    },
    [updateAttachments],
  );

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

  const onSubmit: SubmitHandler<ComposeFormValues> = useCallback(
    async (data) => {
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

      const editorValue = editorRef.current?.getValue() ?? {
        editableHtml: initialDraft.editableHtml,
        inlineContentIds: [],
        mode: initialDraft.mode,
        preservedBlockIds: preservedBlocks.map((block) => block.id),
      };
      const inlineContentIds = new Set(editorValue.inlineContentIds);
      const outgoingAttachments = attachmentsRef.current.filter(
        (attachment) =>
          attachment.disposition === "attachment" ||
          (attachment.contentId && inlineContentIds.has(attachment.contentId)),
      );
      const validation = validateEmailAttachments(outgoingAttachments);
      if (!validation.valid) {
        toastError({ description: validation.error });
        return;
      }

      const preservedBlockIds = new Set(editorValue.preservedBlockIds);
      const editableHtml =
        editorValue.mode === "fallback"
          ? editorValue.editableHtml
          : finalizeEditableEmailHtml({
              html: editorValue.editableHtml,
              inlineAttachments: outgoingAttachments,
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
        attachments: outgoingAttachments.map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          content: attachment.contentBase64,
          contentType: attachment.mimeType,
          size: attachment.size,
          disposition: attachment.disposition,
          contentId: attachment.contentId,
        })),
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
      try {
        if (isInlineReply) {
          if (deliveryPath.current === "outbox" && (sendAt || remindAt)) {
            setSubmissionError(
              "This reply was already submitted to the outbox. Check its delivery status before scheduling a new reply.",
            );
            return;
          }
          deliveryPath.current ??= sendAt || remindAt ? "scheduled" : "outbox";
        }
        if (draftWriter) {
          saveDraftRef.current();
          clearTimeout(draftTimer.current);
          if (latestDraft.current) await draftWriter.save(latestDraft.current);
        }
        if (isInlineReply && deliveryPath.current === "scheduled") {
          const result = await scheduleEmailAction(selectedEmailAccountId, {
            clientMutationId: requestId,
            threadId: replyingToEmail!.threadId!,
            messageIds: [draftKeyMessageId!],
            email: enrichedData,
            sendAt: deliveryTimes.sendAt,
            remindAt: deliveryTimes.remindAt,
          });
          if (!result?.data) {
            setSubmissionError(
              getActionErrorMessage(result ?? {}, {
                prefix: "Could not schedule this reply",
              }),
            );
            return;
          }
          try {
            await clearLocalDraft();
          } catch {
            toastError({
              description:
                "Reply scheduled, but its local draft copy could not be cleared.",
            });
          }
          await mutate([
            `/api/user/scheduled-emails?threadId=${encodeURIComponent(replyingToEmail!.threadId!)}`,
            selectedEmailAccountId,
          ]);
          onClose?.();
          refetch?.();
          return;
        }
        const readerThreadId = replyingToEmail?.threadId?.trim();
        const readerMessageId = isInlineReply
          ? draftKeyMessageId
          : replyingToEmail?.messageId;
        if (readerThreadId) {
          let outcome: Awaited<ReturnType<typeof queueReaderEmail>>;
          try {
            outcome = await queueReaderEmail({
              email: enrichedData,
              mutationId: isInlineReply ? requestId : undefined,
              emailAccountId: selectedEmailAccountId,
              messageIds: readerMessageId ? [readerMessageId] : [],
              online: navigator.onLine,
              threadId: readerThreadId,
              onQueued: isInlineReply
                ? async () => {
                    try {
                      await clearLocalDraft();
                    } catch {
                      toastError({
                        description:
                          "Reply queued, but its local draft copy could not be cleared.",
                      });
                    }
                    onClose?.();
                  }
                : undefined,
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
          if (outcome.status === "sent") {
            toastSuccess({ description: "Email sent!" });
            onSuccess?.(outcome.messageId, outcome.threadId);
            refetch?.();
          } else if (outcome.status === "queued") {
            toastSuccess({
              description: getQueuedEmailDescription(outcome.reason),
            });
            onClose?.();
          } else if (outcome.status === "uncertain") {
            if (outcome.ownsNotification) {
              toastError({
                description:
                  "This reply may have sent. Check Sent before retrying.",
              });
            }
            onClose?.();
          } else if (outcome.ownsNotification) {
            toastError({ description: outcome.error });
          }
          return;
        }

        const result = await sendEmailAction(
          selectedEmailAccountId,
          enrichedData,
        );
        if (result?.data) {
          toastSuccess({ description: "Email sent!" });
          onSuccess?.(result.data.messageId ?? "", result.data.threadId ?? "");
        } else {
          toastError({
            description: getActionErrorMessage(result ?? {}, {
              prefix: "There was an error sending the email",
            }),
          });
        }
      } catch (error) {
        console.error(error);
        setSubmissionError(
          "Could not confirm delivery. Check the thread status before trying again.",
        );
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [
      initialDraft,
      isInlineReply,
      sendAt,
      remindAt,
      requestId,
      draftKeyMessageId,
      draftWriter,
      clearLocalDraft,
      mutate,
      onClose,
      onSuccess,
      preservedBlocks,
      refetch,
      replyingToEmail,
      selectedEmailAccountId,
    ],
  );

  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      if (!isSubmitting) formRef.current?.requestSubmit();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      eventListenerOptions: { capture: true },
      preventDefault: true,
    },
  );

  const reconnectContacts = async () => {
    setIsReconnectingContacts(true);

    try {
      const oauthProvider = isMicrosoftProvider(accountProvider)
        ? "microsoft"
        : "google";
      const url = await getAccountLinkingUrl(oauthProvider);
      redirectToSafeUrl(url, { allowExternal: true });
    } catch {
      toastError({
        title: "Error initiating reconnection",
        description: "Please try again or contact support.",
      });
      setIsReconnectingContacts(false);
    }
  };

  const updatePendingRecipient = useCallback(
    (field: ComposeRecipientField, query: string) => {
      pendingRecipientsRef.current[field] = query;
      queueMicrotask(() => {
        if (isMountedRef.current) saveDraftRef.current();
      });
    },
    [],
  );

  const recipientFieldProps = {
    emailAccountId: selectedEmailAccountId,
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

  return (
    <form
      ref={formRef}
      style={
        isInlineReply
          ? ({
              "--email-editor-content-min-height": "100px",
              "--email-editor-content-padding": "0.5rem 0",
            } as CSSProperties)
          : undefined
      }
      onInput={() => saveDraftRef.current()}
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        isComposeWindow
          ? "flex h-full min-h-0 flex-col overflow-hidden [&_[data-email-editor-root]]:min-h-0 [&_[data-email-editor-root]]:flex-1"
          : "space-y-2",
        isInlineReply &&
          "space-y-3 [&_[data-email-editor-root]]:min-h-[120px] [&_[contenteditable]]:min-h-[100px]",
      )}
    >
      <div className={cn(isComposeWindow ? "shrink-0 px-4" : "contents")}>
        {!!fromAccounts?.length && !replyingToEmail && (
          <div
            className={cn(
              "flex items-center gap-2",
              isComposeWindow && "min-h-11 border-b",
            )}
          >
            <ComposeFieldLabel htmlFor="from-account" label="From" />
            <Select
              value={selectedEmailAccountId}
              onValueChange={onSelectEmailAccount}
            >
              <SelectTrigger
                aria-label="From"
                className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0 focus:ring-offset-0"
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
        {replyingToEmail?.to && !editReply ? (
          <button
            type="button"
            className={cn(
              "flex gap-1 text-left",
              isComposeWindow && "min-h-11 items-center border-b",
            )}
            onClick={() => setEditReply(true)}
          >
            <span className="text-muted-foreground text-sm">To</span>{" "}
            <span className="max-w-md break-words text-foreground">
              {extractNameFromEmail(watch("to") || replyingToEmail.to)}
            </span>
          </button>
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-2",
                isComposeWindow && "min-h-11 items-center border-b",
              )}
            >
              {showCcBcc && (
                <button
                  aria-label="Hide Cc/Bcc"
                  className={cn(
                    "order-last mt-2 text-xs text-muted-foreground hover:text-foreground",
                    isComposeWindow && "mt-0",
                  )}
                  onClick={() => setShowCcBcc(false)}
                  ref={hideCcBccButtonRef}
                  type="button"
                >
                  Cc/Bcc
                </button>
              )}
              {isComposeWindow && <ComposeFieldLabel htmlFor="to" label="To" />}
              <div className="min-w-0 flex-1">
                {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
                  <div className="flex space-x-2">
                    {!isComposeWindow && (
                      <div className="mt-2">
                        <Label label="To" name="to" />
                      </div>
                    )}
                    <ComposeContactRecipientField
                      {...recipientFieldProps}
                      active={activeRecipientField === "to"}
                      autoFocus={focusRecipientField}
                      name="to"
                      selectedRecipients={watch("to") ?? ""}
                    />
                  </div>
                ) : (
                  <Input
                    type="text"
                    name="to"
                    label={isComposeWindow ? undefined : "To"}
                    registerProps={{
                      ...register("to", { required: true }),
                      autoFocus: focusRecipientField,
                    }}
                    error={errors.to}
                    className={cn(
                      isComposeWindow &&
                        "h-10 rounded-none border-0 bg-transparent p-0 shadow-none focus:border-transparent focus:ring-0",
                    )}
                  />
                )}
              </div>
              {!showCcBcc && (
                <button
                  className={cn(
                    "mt-2 text-xs text-muted-foreground hover:text-foreground",
                    isComposeWindow && "mt-0",
                  )}
                  onClick={() => {
                    setShowCcBcc(true);
                    requestAnimationFrame(() =>
                      hideCcBccButtonRef.current?.focus(),
                    );
                  }}
                  type="button"
                >
                  Cc/Bcc
                </button>
              )}
            </div>

            {showCcBcc && (
              <div
                className={cn(
                  "grid gap-2 sm:grid-cols-2",
                  isComposeWindow && "border-b py-2",
                )}
              >
                {(["cc", "bcc"] as const).map((field) =>
                  env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
                    <div key={field}>
                      <Label label={RECIPIENT_LABELS[field]} name={field} />
                      <ComposeContactRecipientField
                        {...recipientFieldProps}
                        active={activeRecipientField === field}
                        className="mt-1 border border-slate-300 px-3 shadow-sm focus-within:border-black focus-within:ring-1 focus-within:ring-black dark:border-slate-700 dark:focus-within:border-slate-400 dark:focus-within:ring-slate-400"
                        name={field}
                        selectedRecipients={watch(field) ?? ""}
                      />
                    </div>
                  ) : (
                    <Input
                      error={errors[field]}
                      key={field}
                      label={RECIPIENT_LABELS[field]}
                      name={field}
                      registerProps={register(field)}
                      type="text"
                    />
                  ),
                )}
              </div>
            )}

            <Input
              type="text"
              name="subject"
              registerProps={register("subject", { required: true })}
              error={errors.subject}
              placeholder="Subject"
              className={cn(
                "border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200",
                isComposeWindow &&
                  "h-11 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus:border-border focus:ring-0",
              )}
            />
          </>
        )}
      </div>

      <EmailEditor
        appearance={isComposeWindow || isInlineReply ? "seamless" : "contained"}
        autofocus={!focusRecipientField}
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
        unsupported={initialDraft.unsupported}
      />

      {submissionError && (
        <p role="alert" className="text-destructive text-sm">
          {submissionError}
        </p>
      )}
      {!!attachments.length && (
        <ul
          aria-label="Attachments"
          className={cn(
            "flex flex-wrap gap-2",
            isComposeWindow && "shrink-0 border-t px-3 py-2",
          )}
        >
          {attachments.map((attachment) => (
            <li
              className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              key={attachment.id}
            >
              {attachment.disposition === "inline" ? (
                <ImageIcon aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="max-w-52 truncate">{attachment.filename}</span>
              <span className="text-muted-foreground">
                {formatFileSize(attachment.size)}
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
          isComposeWindow && "shrink-0 border-t px-4 py-2",
        )}
      >
        <div className="flex flex-wrap items-center gap-1">
          {isComposeWindow ? (
            <Button
              className="h-9 px-0 font-semibold text-foreground hover:bg-transparent hover:text-foreground"
              disabled={isSubmitting}
              type="submit"
              variant="ghost"
            >
              {isSubmitting && <ButtonLoader />}
              Send
            </Button>
          ) : (
            <Tooltip content={`${symbol}+Enter`}>
              <Button disabled={isSubmitting} type="submit" variant="gradient">
                {isSubmitting && <ButtonLoader />}
                Send
              </Button>
            </Tooltip>
          )}
          {isInlineReply && (
            <DeliveryOptions
              sendAt={sendAt}
              remindAt={remindAt}
              disabled={isSubmitting}
              onSendAtChange={(value) => {
                const nextRemindAt = getReminderAfterSendTimeChange(
                  value,
                  remindAt,
                );
                setSendAt(value);
                setRemindAt(nextRemindAt);
                saveDraftRef.current({ sendAt: value, remindAt: nextRemindAt });
              }}
              onRemindAtChange={(value) => {
                setRemindAt(value);
                saveDraftRef.current({ remindAt: value });
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-0.5 text-muted-foreground">
          <input
            className="hidden"
            data-testid="compose-attachments-input"
            multiple
            onChange={handleFileInput("attachment")}
            ref={attachmentInputRef}
            type="file"
          />
          <Button
            aria-label="Attach files"
            className={cn(
              isComposeWindow && "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => attachmentInputRef.current?.click()}
            size={isComposeWindow ? "iconSm" : "icon"}
            type="button"
            variant="ghost"
          >
            <PaperclipIcon className="size-4" />
          </Button>
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
            className={cn(
              isComposeWindow && "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => inlineImageInputRef.current?.click()}
            size={isComposeWindow ? "iconSm" : "icon"}
            type="button"
            variant="ghost"
          >
            <ImageIcon className="size-4" />
          </Button>
          {onDiscard && (
            <Button
              aria-label="Discard draft"
              className={cn(
                isComposeWindow &&
                  "text-muted-foreground hover:text-foreground",
              )}
              disabled={isSubmitting}
              onClick={async () => {
                try {
                  await clearLocalDraft();
                  onDiscard();
                } catch (error) {
                  draftStopped.current = false;
                  setSaveStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not discard this draft.",
                  );
                }
              }}
              size={isComposeWindow ? "iconSm" : "icon"}
              title="Discard draft"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {isInlineReply && saveStatus && (
        <p role="status" className="text-xs text-muted-foreground">
          {saveStatus}
        </p>
      )}
    </form>
  );
}

const RECIPIENT_LABELS: Record<ComposeRecipientField, string> = {
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
};

function ComposeContactRecipientField({
  active,
  autoFocus,
  className,
  emailAccountId,
  isReconnectingContacts,
  name,
  onActivate,
  onReconnectContacts,
  onReconnectRequired,
  onSearchQueryChange,
  onSelectedRecipientsChange,
  reconnectRequired,
  selectedRecipients,
}: {
  active: boolean;
  autoFocus?: boolean;
  className?: string;
  emailAccountId: string;
  isReconnectingContacts: boolean;
  name: ComposeRecipientField;
  onActivate: (field: ComposeRecipientField) => void;
  onReconnectContacts: () => void;
  onReconnectRequired: () => void;
  onSearchQueryChange: (field: ComposeRecipientField, query: string) => void;
  onSelectedRecipientsChange: (
    field: ComposeRecipientField,
    recipients: string,
  ) => void;
  reconnectRequired: boolean;
  selectedRecipients: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const label = RECIPIENT_LABELS[name];
  const selectedEmailAddresses = splitRecipientList(selectedRecipients);

  const { data: contacts } = useSWR<ContactsResponse, ContactsFetchError>(
    reconnectRequired
      ? null
      : [
          `/api/user/contacts?query=${encodeURIComponent(searchQuery)}`,
          emailAccountId,
        ],
    {
      keepPreviousData: true,
      onError(error) {
        if (error.info?.reconnectRequired) onReconnectRequired();
      },
    },
  );

  // The local input state resets on unmount (e.g. hiding Cc/Bcc), so the
  // parent's pending entry must reset with it or hidden text would still send.
  useEffect(
    () => () => onSearchQueryChange(name, ""),
    [name, onSearchQueryChange],
  );

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    onSearchQueryChange(name, query);
  };

  const removeSelectedEmail = (emailAddress: string) => {
    onSelectedRecipientsChange(
      name,
      selectedEmailAddresses
        .filter((email) => email !== emailAddress)
        .join(","),
    );
  };

  return (
    <Combobox
      multiple
      onChange={(values) => {
        const selection = resolveRecipientSelection(values);
        if (selection === null) return;
        onSelectedRecipientsChange(name, selection);
        updateSearchQuery("");
      }}
      value={selectedEmailAddresses}
    >
      <div
        className={cn(
          "flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground",
          className,
        )}
      >
        {selectedEmailAddresses.map((emailAddress) => (
          <Badge className="rounded-md" key={emailAddress} variant="secondary">
            <button
              aria-label={`Edit ${emailAddress}`}
              className="cursor-pointer"
              onClick={() => {
                removeSelectedEmail(emailAddress);
                updateSearchQuery(emailAddress);
              }}
              type="button"
            >
              {extractNameFromEmail(emailAddress)}
            </button>
            <button
              aria-label={`Remove ${emailAddress}`}
              onClick={() => removeSelectedEmail(emailAddress)}
              type="button"
            >
              <XIcon className="ml-1.5 size-3" />
            </button>
          </Badge>
        ))}

        <div className="relative min-w-32 flex-1">
          <ComboboxInput
            aria-label={label}
            autoFocus={autoFocus}
            className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
            id={name}
            onChange={(event) => updateSearchQuery(event.target.value)}
            onFocus={() => onActivate(name)}
            onKeyUp={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!isValidEmail(searchQuery.trim())) return;
              onSelectedRecipientsChange(
                name,
                resolveComposeRecipients({
                  selectedRecipients,
                  pendingRecipient: searchQuery,
                }),
              );
              updateSearchQuery("");
            }}
            value={searchQuery}
          />

          {active && reconnectRequired && (
            <div
              className="absolute z-10 mt-1 flex w-80 items-center gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
              role="status"
            >
              <span className="flex-1">
                Reconnect this account to enable contact suggestions.
              </span>
              <Button
                className="h-auto p-0"
                disabled={isReconnectingContacts}
                loading={isReconnectingContacts}
                onClick={onReconnectContacts}
                type="button"
                variant="link"
              >
                Reconnect
              </Button>
            </div>
          )}

          {active && !!contacts?.contacts.length && (
            <ComboboxOptions className="absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-border focus:outline-none sm:text-sm">
              <ComboboxOption
                className="h-0 w-0 overflow-hidden"
                value={searchQuery}
              />
              {contacts.contacts.map((contact) => (
                <ComboboxOption
                  className={({ focus }) =>
                    `cursor-default select-none px-4 py-1 text-foreground ${focus ? "bg-accent" : ""}`
                  }
                  key={contact.emailAddress}
                  value={contact.emailAddress}
                >
                  {({ selected }: { selected: boolean }) => (
                    <div className="my-2 flex items-center">
                      {selected ? (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full">
                          <CheckCircleIcon className="h-6 w-6" />
                        </div>
                      ) : (
                        <Avatar>
                          <AvatarImage
                            alt={contact.emailAddress}
                            src={contact.profilePictureUrl ?? undefined}
                          />
                          <AvatarFallback>
                            {contact.emailAddress.at(0) || "A"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="ml-4 flex flex-col justify-center">
                        {contact.name && (
                          <div className="text-foreground">{contact.name}</div>
                        )}
                        <div className="text-sm font-semibold text-muted-foreground">
                          {contact.emailAddress}
                        </div>
                      </div>
                    </div>
                  )}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          )}
        </div>
      </div>
    </Combobox>
  );
}

type ContactsFetchError = Error & {
  info?: Partial<ContactsErrorResponse>;
  status?: number;
};

function getReplyToEmailPayload(
  replyingToEmail:
    | Pick<
        ReplyingToEmail,
        "threadId" | "headerMessageId" | "references" | "messageId"
      >
    | undefined,
): SendEmailBody["replyToEmail"] | undefined {
  const threadId = replyingToEmail?.threadId?.trim();
  const headerMessageId = replyingToEmail?.headerMessageId?.trim();
  if (!threadId || !headerMessageId) return;
  const references = replyingToEmail?.references;
  const messageId = replyingToEmail?.messageId;

  return {
    threadId,
    headerMessageId,
    ...(references ? { references } : {}),
    ...(messageId ? { messageId } : {}),
  };
}

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

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separator = result.indexOf(",");
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function revokePreview(attachment: ComposeAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
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
      className="shrink-0 text-sm font-medium text-foreground"
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

function getReplyDraftSnapshot(content: ReplyDraftContent) {
  return JSON.stringify({
    ...content,
    attachments: content.attachments.map(
      ({ contentBase64: _content, ...metadata }) => metadata,
    ),
  });
}
