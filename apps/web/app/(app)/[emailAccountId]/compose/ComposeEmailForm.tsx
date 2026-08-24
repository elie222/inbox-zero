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
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import { Input, Label } from "@/components/Input";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandShortcut } from "@/components/ui/command";
import { env } from "@/env";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { sendEmailAction } from "@/utils/actions/mail";
import { extractNameFromEmail, isValidEmail } from "@/utils/email";
import { getActionErrorMessage } from "@/utils/error";
import {
  type SendEmailBody,
  validateSendEmailPayloadSize,
} from "@/utils/types/mail";
import { resolveComposeRecipients } from "./compose-recipients";

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
  const { data: emailAccount, error, isLoading } = useEmailAccountFull();

  return (
    <LoadingContent error={error} loading={isLoading}>
      {emailAccount && (
        <ComposeEmailFormContent
          {...props}
          accountSignatureHtml={emailAccount.signature ?? ""}
        />
      )}
    </LoadingContent>
  );
}

function ComposeEmailFormContent({
  replyingToEmail,
  accountSignatureHtml,
  refetch,
  onSuccess,
  onDiscard,
}: ComposeEmailFormProps & { accountSignatureHtml: string }) {
  const { emailAccountId } = useAccount();
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
        const result = await sendEmailAction(emailAccountId, enrichedData);
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
      emailAccountId,
      initialDraft,
      onSuccess,
      preservedBlocks,
      refetch,
      searchQuery,
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
      preventDefault: true,
    },
  );

  const { data: contacts } = useSWR<ContactsResponse, { error: string }>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED
      ? `/api/google/contacts?query=${searchQuery}`
      : null,
    { keepPreviousData: true },
  );

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
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      {replyingToEmail?.to && !editReply ? (
        <button
          type="button"
          className="flex gap-1 text-left"
          onClick={() => setEditReply(true)}
        >
          <span className="text-green-500">Draft</span>{" "}
          <span className="max-w-md break-words text-foreground">
            to {extractNameFromEmail(replyingToEmail.to)}
          </span>
        </button>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
                <div className="flex space-x-2">
                  <div className="mt-2">
                    <Label name="to" label="To" />
                  </div>
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

                        {!!contacts?.result?.length && (
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-border focus:outline-none sm:text-sm">
                            <ComboboxOption
                              className="h-0 w-0 overflow-hidden"
                              value={searchQuery}
                            />
                            {contacts.result.map((contact) => {
                              const emailAddress =
                                contact.person?.emailAddresses?.[0]?.value;
                              if (!emailAddress) return null;
                              const person = {
                                emailAddress,
                                name: contact.person?.names?.[0]?.displayName,
                                profilePictureUrl:
                                  contact.person?.photos?.[0]?.url,
                              };

                              return (
                                <ComboboxOption
                                  className={({ focus }) =>
                                    `cursor-default select-none px-4 py-1 text-foreground ${focus ? "bg-accent" : ""}`
                                  }
                                  key={person.emailAddress}
                                  value={person.emailAddress}
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
                                              person.profilePictureUrl ??
                                              undefined
                                            }
                                            alt={
                                              person.emailAddress ||
                                              "Profile picture"
                                            }
                                          />
                                          <AvatarFallback>
                                            {person.emailAddress?.[0] || "A"}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <div className="ml-4 flex flex-col justify-center">
                                        <div className="text-foreground">
                                          {person.name}
                                        </div>
                                        <div className="text-sm font-semibold text-muted-foreground">
                                          {person.emailAddress}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </ComboboxOption>
                              );
                            })}
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
                  label="To"
                  registerProps={register("to", { required: true })}
                  error={errors.to}
                />
              )}
            </div>
            <button
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowCcBcc((visible) => !visible)}
              type="button"
            >
              Cc/Bcc
            </button>
          </div>

          {showCcBcc && (
            <div className="grid gap-2 sm:grid-cols-2">
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
            className="border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200"
          />
        </>
      )}

      <EmailEditor
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
        <ul aria-label="Attachments" className="flex flex-wrap gap-2">
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <ButtonLoader />}
            Send
            <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
          </Button>
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
            onClick={() => attachmentInputRef.current?.click()}
            size="icon"
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
            onClick={() => inlineImageInputRef.current?.click()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ImageIcon className="size-4" />
          </Button>
        </div>

        {onDiscard && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={isSubmitting}
            onClick={onDiscard}
          >
            <TrashIcon className="h-4 w-4" />
            <span className="sr-only">Discard</span>
          </Button>
        )}
      </div>
    </form>
  );
}

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

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
