"use client";

import { useHotkeys } from "react-hotkeys-hook";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckCircleIcon, PaperclipIcon, TrashIcon, XIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLoader, Loading } from "@/components/Loading";
import { env } from "@/env";
import { extractNameFromEmail } from "@/utils/email";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { sendEmailAction } from "@/utils/actions/mail";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import type { SendEmailBody } from "@/utils/gmail/mail";
import { CommandShortcut } from "@/components/ui/command";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // Gmail rejects much beyond this anyway

type ComposeAttachment = {
  filename: string;
  contentType: string;
  content: string; // base64
  size: number;
};

export type ReplyingToEmail = {
  threadId?: string;
  headerMessageId?: string;
  messageId?: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
  bcc?: string;
  draftHtml?: string | undefined; // The part being written/edited
  quotedContentHtml?: string | undefined; // The part being quoted/replied to
  date?: string; // The date of the original email
};

type ComposeEmailFormProps = {
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onDiscard?: () => void;
};

// Waits for the account (signature) before mounting the form for new
// compositions, since the editor and form defaults are seeded once at mount.
// AI-drafted replies already carry the signature inside draftHtml.
export const ComposeEmailForm = (props: ComposeEmailFormProps) => {
  const { data: emailAccountData, isLoading } = useEmailAccountFull();

  if (!props.replyingToEmail && isLoading) return <Loading />;

  const signature = props.replyingToEmail
    ? ""
    : emailAccountData?.signature?.trim() || "";

  return <ComposeEmailFormInner {...props} signature={signature} />;
};

const ComposeEmailFormInner = ({
  replyingToEmail,
  refetch,
  onSuccess,
  onDiscard,
  signature,
}: ComposeEmailFormProps & { signature: string }) => {
  const { emailAccountId } = useAccount();
  const [showFullContent, setShowFullContent] = useState(false);
  const { symbol } = useModifierKey();
  const formRef = useRef<HTMLFormElement>(null);

  const initialMessageHtml = replyingToEmail
    ? replyingToEmail.draftHtml
    : signature
      ? `<br><br>${signature}`
      : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: getReplyToEmailPayload(replyingToEmail),
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      bcc: replyingToEmail?.bcc,
      messageHtml: initialMessageHtml,
    },
  });

  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!files.length) return;

      try {
        const newAttachments = await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            content: await fileToBase64(file),
            size: file.size,
          })),
        );

        setAttachments((current) => {
          const combined = [...current, ...newAttachments];
          const totalBytes = combined.reduce(
            (sum, attachment) => sum + attachment.size,
            0,
          );
          if (totalBytes > MAX_ATTACHMENT_BYTES) {
            toastError({
              description: "Attachments can't exceed 10MB in total",
            });
            return current;
          }
          return combined;
        });
      } catch (error) {
        console.error("Failed to read attachment:", error);
        toastError({ description: "Failed to read the selected file" });
      }
    },
    [],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }, []);

  const [showCcBcc, setShowCcBcc] = useState(
    Boolean(replyingToEmail?.cc || replyingToEmail?.bcc),
  );

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      const enrichedData = {
        ...data,
        replyToEmail: getReplyToEmailPayload(data.replyToEmail),
        messageHtml: showFullContent
          ? data.messageHtml || ""
          : `${data.messageHtml || ""}<br>${replyingToEmail?.quotedContentHtml || ""}`,
        attachments: attachments.length
          ? attachments.map(({ filename, contentType, content }) => ({
              filename,
              contentType,
              content,
            }))
          : undefined,
      };

      try {
        const res = await sendEmailAction(emailAccountId, enrichedData);
        if (res?.serverError) {
          toastError({
            description: "There was an error sending the email :(",
          });
        } else if (res?.data) {
          toastSuccess({ description: "Email sent!" });
          onSuccess?.(res.data.messageId ?? "", res.data.threadId ?? "");
        }
      } catch (error) {
        console.error(error);
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [
      refetch,
      onSuccess,
      showFullContent,
      replyingToEmail,
      emailAccountId,
      attachments,
    ],
  );

  useHotkeys(
    "mod+enter",
    (e) => {
      e.preventDefault();
      if (!isSubmitting) {
        formRef.current?.requestSubmit();
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    },
  );

  const [searchQuery, setSearchQuery] = useState("");
  const { data } = useSWR<ContactsResponse, { error: string }>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED
      ? `/api/google/contacts?query=${searchQuery}`
      : null,
    {
      keepPreviousData: true,
    },
  );

  // TODO not in love with how this was implemented
  const selectedEmailAddressses = watch("to", "").split(",").filter(Boolean);

  const onRemoveSelectedEmail = (emailAddress: string) => {
    const filteredEmailAddresses = selectedEmailAddressses.filter(
      (email) => email !== emailAddress,
    );
    setValue("to", filteredEmailAddresses.join(","));
  };

  const handleComboboxOnChange = (values: string[]) => {
    // this assumes last value given by combobox is user typed value
    const lastValue = values[values.length - 1];

    const { success } = z.string().email().safeParse(lastValue);
    if (success) {
      setValue("to", values.join(","));
      setSearchQuery("");
    }
  };

  const [editReply, setEditReply] = useState(false);

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("messageHtml", html);
    },
    [setValue],
  );

  const editorRef = useRef<TiptapHandle>(null);

  const showExpandedContent = useCallback(() => {
    if (!showFullContent) {
      try {
        editorRef.current?.appendContent(
          replyingToEmail?.quotedContentHtml ?? "",
        );
      } catch (error) {
        console.error("Failed to append content:", error);
        toastError({ description: "Failed to show full content" });
        return; // Don't set showFullContent to true if append failed
      }
    }
    setShowFullContent(true);
  }, [showFullContent, replyingToEmail?.quotedContentHtml]);

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
          {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
            <div className="flex space-x-2">
              <div className="mt-2">
                <Label name="to" label="To" />
              </div>
              <Combobox
                value={selectedEmailAddressses}
                onChange={handleComboboxOnChange}
                multiple
              >
                <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                  {selectedEmailAddressses.map((emailAddress) => (
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
                        type="button"
                        onClick={() => onRemoveSelectedEmail(emailAddress)}
                      >
                        <XIcon className="ml-1.5 size-3" />
                      </button>
                    </Badge>
                  ))}

                  <div className="relative flex-1">
                    <ComboboxInput
                      value={searchQuery}
                      className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyUp={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setValue(
                            "to",
                            [...selectedEmailAddressses, searchQuery].join(","),
                          );
                          setSearchQuery("");
                        }
                      }}
                    />

                    {!!data?.result?.length && (
                      <ComboboxOptions
                        className={
                          "absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-border focus:outline-none sm:text-sm"
                        }
                      >
                        <ComboboxOption
                          className="h-0 w-0 overflow-hidden"
                          value={searchQuery}
                        />
                        {data?.result.map((contact) => {
                          const person = {
                            emailAddress:
                              contact.person?.emailAddresses?.[0].value,
                            name: contact.person?.names?.[0].displayName,
                            profilePictureUrl: contact.person?.photos?.[0].url,
                          };

                          return (
                            <ComboboxOption
                              className={({ focus }) =>
                                `cursor-default select-none px-4 py-1 text-foreground ${
                                  focus && "bg-accent"
                                }`
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
                                        src={person.profilePictureUrl!}
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

          {showCcBcc ? (
            <>
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
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Add Cc/Bcc
            </button>
          )}

          <Input
            type="text"
            name="subject"
            registerProps={register("subject", { required: true })}
            error={errors.subject}
            placeholder="Subject"
            className="border border-input bg-background focus:border-ring focus:ring-0 focus:ring-ring"
          />
        </>
      )}

      <Tiptap
        ref={editorRef}
        initialContent={initialMessageHtml}
        autofocus={replyingToEmail ? true : "start"}
        onChange={handleEditorChange}
        className="min-h-[200px]"
        onMoreClick={
          !replyingToEmail?.quotedContentHtml || showFullContent
            ? undefined
            : showExpandedContent
        }
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment, index) => (
            <Badge
              key={`${attachment.filename}-${index}`}
              variant="secondary"
              className="max-w-60 gap-1 rounded-md"
            >
              <PaperclipIcon className="size-3 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(attachment.size)}
              </span>
              {/* The glyph stays small; the hit area is finger-sized so
                  removing an attachment isn't a tap lottery */}
              <button
                type="button"
                aria-label={`Remove ${attachment.filename}`}
                className="-my-2 -mr-2 flex size-8 shrink-0 items-center justify-center"
                onClick={() => removeAttachment(index)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <ButtonLoader />}
            Send
            <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSubmitting}
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="h-4 w-4" />
            <span className="sr-only">Attach files</span>
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
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      if (base64 === undefined) {
        reject(new Error("Could not read file"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  return {
    threadId,
    headerMessageId,
    ...(replyingToEmail?.references
      ? { references: replyingToEmail.references }
      : {}),
    ...(replyingToEmail?.messageId
      ? { messageId: replyingToEmail.messageId }
      : {}),
  };
}
