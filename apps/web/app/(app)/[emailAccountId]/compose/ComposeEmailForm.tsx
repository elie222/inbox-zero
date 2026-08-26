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
  type EmailEditorPreservedBlock,
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
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandShortcut } from "@/components/ui/command";
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
import { extractNameFromEmail, isValidEmail } from "@/utils/email";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import { cn } from "@/utils";
import { resolveComposeRecipients } from "./compose-recipients";
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
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
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

  return (
    <LoadingContent error={error} loading={isLoading}>
      {emailAccount && (
        <ComposeEmailFormContent
          {...props}
          accountProvider={selectedAccountProvider}
          accountSignatureHtml={emailAccount.signature ?? ""}
          key={selectedEmailAccountId}
          onSelectEmailAccount={setSelectedEmailAccountId}
          selectedEmailAccountId={selectedEmailAccountId}
        />
      )}
    </LoadingContent>
  );
}

function ComposeEmailFormContent({
  layout = "default",
  replyingToEmail,
  fromAccounts,
  accountProvider,
  accountSignatureHtml,
  selectedEmailAccountId,
  onSelectEmailAccount,
  refetch,
  onSuccess,
  onDiscard,
}: ComposeEmailFormProps & {
  accountProvider: string;
  accountSignatureHtml: string;
  selectedEmailAccountId: string;
  onSelectEmailAccount: (emailAccountId: string) => void;
}) {
  const isComposeWindow = layout === "window";
  const [initialComposer] = useState(() => {
    const draft = prepareEmailDraft({
      html: replyingToEmail?.draftHtml ?? "",
      quotedHtml: replyingToEmail?.quotedContentHtml,
      signatureHtml:
        replyingToEmail?.signatureHtml ?? accountSignatureHtml ?? undefined,
    });
    const preservedBlocks: EmailEditorPreservedBlock[] = [
      ...(draft.signatureHtml
        ? [
            {
              id: "signature",
              kind: "signature" as const,
              html: draft.signatureHtml,
              collapsed: false,
            },
          ]
        : []),
      ...(draft.quotedHtml
        ? [
            {
              id: "quote",
              kind: "quote" as const,
              html: draft.quotedHtml,
              collapsed: true,
            },
          ]
        : []),
    ];
    return { draft, preservedBlocks };
  });
  const { draft: initialDraft, preservedBlocks } = initialComposer;
  const [searchQuery, setSearchQuery] = useState("");
  const [contactsReconnectRequired, setContactsReconnectRequired] =
    useState(false);
  const [isReconnectingContacts, setIsReconnectingContacts] = useState(false);
  const [editReply, setEditReply] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(
    Boolean(replyingToEmail?.cc || replyingToEmail?.bcc),
  );
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const attachmentsRef = useRef<ComposeAttachment[]>([]);
  const isMountedRef = useRef(true);
  const editorRef = useRef<EmailEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const { symbol } = useModifierKey();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<ComposeFormValues>({
    defaultValues: {
      replyToEmail: getReplyToEmailPayload(replyingToEmail),
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      bcc: replyingToEmail?.bcc,
    },
  });

  const updateAttachments = useCallback((next: ComposeAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
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
      for (const attachment of attachmentsRef.current) {
        revokePreview(attachment);
      }
    };
  }, []);

  const onSubmit: SubmitHandler<ComposeFormValues> = useCallback(
    async (data) => {
      const to = resolveComposeRecipients({
        selectedRecipients: data.to,
        pendingRecipient: searchQuery,
      });
      if (!to) {
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
        to,
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

      try {
        const readerThreadId = replyingToEmail?.threadId?.trim();
        const readerMessageId = replyingToEmail?.messageId;
        if (readerThreadId) {
          let outcome: Awaited<ReturnType<typeof queueReaderEmail>>;
          try {
            outcome = await queueReaderEmail({
              email: enrichedData,
              emailAccountId: selectedEmailAccountId,
              messageIds: readerMessageId ? [readerMessageId] : [],
              online: navigator.onLine,
              threadId: readerThreadId,
            });
          } catch (error) {
            console.error(error);
            toastError({
              description: "Couldn't queue this email. It hasn't been sent.",
            });
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
            onDiscard?.();
          } else if (outcome.status === "uncertain") {
            if (outcome.ownsNotification) {
              toastError({
                description:
                  "This reply may have sent. Check Sent before retrying.",
              });
            }
            onDiscard?.();
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
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [
      initialDraft,
      onDiscard,
      onSuccess,
      preservedBlocks,
      refetch,
      replyingToEmail,
      searchQuery,
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

  const { data: contacts } = useSWR<ContactsResponse, ContactsFetchError>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED && !contactsReconnectRequired
      ? [
          `/api/user/contacts?query=${encodeURIComponent(searchQuery)}`,
          selectedEmailAccountId,
        ]
      : null,
    {
      keepPreviousData: true,
      onError(error) {
        if (error.info?.reconnectRequired) {
          setContactsReconnectRequired(true);
        }
      },
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

  const selectedEmailAddresses = watch("to", "").split(",").filter(Boolean);

  const onRemoveSelectedEmail = (emailAddress: string) => {
    setValue(
      "to",
      selectedEmailAddresses
        .filter((email) => email !== emailAddress)
        .join(","),
    );
  };

  const handleComboboxOnChange = (values: string[]) => {
    const lastValue = values.at(-1);
    if (lastValue && isValidEmail(lastValue)) {
      setValue("to", values.join(","));
      setSearchQuery("");
    }
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
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        isComposeWindow
          ? "flex h-full min-h-0 flex-col overflow-hidden [&_[data-email-editor-root]]:min-h-0 [&_[data-email-editor-root]]:flex-1"
          : "space-y-2",
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
            <span className="text-green-500">Draft</span>{" "}
            <span className="max-w-md break-words text-foreground">
              to {extractNameFromEmail(replyingToEmail.to)}
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
              {isComposeWindow && <ComposeFieldLabel htmlFor="to" label="To" />}
              <div className="min-w-0 flex-1">
                {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
                  <div className="flex space-x-2">
                    {!isComposeWindow && (
                      <div className="mt-2">
                        <Label name="to" label="To" />
                      </div>
                    )}
                    <Combobox
                      value={selectedEmailAddresses}
                      onChange={handleComboboxOnChange}
                      multiple
                    >
                      <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground">
                        {selectedEmailAddresses.map((emailAddress) => (
                          <Badge
                            key={emailAddress}
                            variant="secondary"
                            className="cursor-pointer rounded-md"
                            onClick={() => {
                              onRemoveSelectedEmail(emailAddress);
                              setSearchQuery(emailAddress);
                            }}
                          >
                            {extractNameFromEmail(emailAddress)}
                            <button
                              aria-label={`Remove ${emailAddress}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemoveSelectedEmail(emailAddress);
                              }}
                            >
                              <XIcon className="ml-1.5 size-3" />
                            </button>
                          </Badge>
                        ))}

                        <div className="relative flex-1">
                          <ComboboxInput
                            aria-label="To"
                            id="to"
                            value={searchQuery}
                            className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
                            onChange={(event) =>
                              setSearchQuery(event.target.value)
                            }
                            onKeyUp={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              if (!isValidEmail(searchQuery.trim())) return;
                              setValue(
                                "to",
                                resolveComposeRecipients({
                                  selectedRecipients: watch("to"),
                                  pendingRecipient: searchQuery,
                                }),
                              );
                              setSearchQuery("");
                            }}
                          />

                          {contactsReconnectRequired && (
                            <div
                              className="absolute z-10 mt-1 flex w-80 items-center gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
                              role="status"
                            >
                              <span className="flex-1">
                                Reconnect this account to enable contact
                                suggestions.
                              </span>
                              <Button
                                className="h-auto p-0"
                                disabled={isReconnectingContacts}
                                loading={isReconnectingContacts}
                                onClick={reconnectContacts}
                                type="button"
                                variant="link"
                              >
                                Reconnect
                              </Button>
                            </div>
                          )}

                          {!!contacts?.contacts.length && (
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
                                            src={
                                              contact.profilePictureUrl ??
                                              undefined
                                            }
                                            alt={contact.emailAddress}
                                          />
                                          <AvatarFallback>
                                            {contact.emailAddress[0] || "A"}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <div className="ml-4 flex flex-col justify-center">
                                        {contact.name && (
                                          <div className="text-foreground">
                                            {contact.name}
                                          </div>
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
                  </div>
                ) : (
                  <Input
                    type="text"
                    name="to"
                    label={isComposeWindow ? undefined : "To"}
                    registerProps={register("to", { required: true })}
                    error={errors.to}
                    className={cn(
                      isComposeWindow &&
                        "h-10 rounded-none border-0 bg-transparent p-0 shadow-none focus:border-transparent focus:ring-0",
                    )}
                  />
                )}
              </div>
              <button
                className={cn(
                  "mt-2 text-xs text-muted-foreground hover:text-foreground",
                  isComposeWindow && "mt-0",
                )}
                onClick={() => setShowCcBcc((visible) => !visible)}
                type="button"
              >
                Cc/Bcc
              </button>
            </div>

            {showCcBcc && (
              <div
                className={cn(
                  "grid gap-2 sm:grid-cols-2",
                  isComposeWindow && "border-b py-2",
                )}
              >
                <Input
                  type="text"
                  name="cc"
                  label="Cc"
                  registerProps={register("cc")}
                  error={errors.cc}
                />
                <Input
                  type="text"
                  name="bcc"
                  label="Bcc"
                  registerProps={register("bcc")}
                  error={errors.bcc}
                />
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
        appearance={isComposeWindow ? "seamless" : "contained"}
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
          "flex items-center justify-between",
          isComposeWindow && "shrink-0 border-t px-4 py-2",
        )}
      >
        <div className="flex items-center">
          <Button
            className={cn(
              isComposeWindow &&
                "h-9 px-0 font-semibold text-foreground hover:bg-transparent hover:text-foreground",
            )}
            disabled={isSubmitting}
            type="submit"
            variant={isComposeWindow ? "ghost" : "default"}
          >
            {isSubmitting && <ButtonLoader />}
            Send
            {!isComposeWindow && (
              <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
            )}
          </Button>
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
              onClick={onDiscard}
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
    </form>
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
  const id = crypto.randomUUID();
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
