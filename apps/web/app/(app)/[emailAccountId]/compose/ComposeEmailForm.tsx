"use client";

import { useHotkeys } from "react-hotkeys-hook";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  CheckCircleIcon,
  TrashIcon,
  XIcon,
  CornerDownLeftIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { env } from "@/env";
import { extractNameFromEmail } from "@/utils/email";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { sendEmailAction } from "@/utils/actions/mail";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import type { SendEmailBody } from "@/utils/gmail/mail";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";

export type ReplyingToEmail = {
  threadId: string;
  headerMessageId: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
  bcc?: string;
  draftHtml?: string | undefined; // The part being written/edited
  quotedContentHtml?: string | undefined; // The part being quoted/replied to
  date?: string; // The date of the original email
};

export const ComposeEmailForm = ({
  replyingToEmail,
  refetch,
  onSuccess,
  onDiscard,
}: {
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onDiscard?: () => void;
}) => {
  const { emailAccountId } = useAccount();
  const [showFullContent, setShowFullContent] = useState(false);
  const [showCc, setShowCc] = useState(!!replyingToEmail?.cc);
  const [showBcc, setShowBcc] = useState(!!replyingToEmail?.bcc);
  const { symbol } = useModifierKey();
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: replyingToEmail,
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      messageHtml: replyingToEmail?.draftHtml,
    },
  });

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      const enrichedData = {
        ...data,
        messageHtml: showFullContent
          ? data.messageHtml || ""
          : `${data.messageHtml || ""}<br>${replyingToEmail?.quotedContentHtml || ""}`,
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
    [refetch, onSuccess, showFullContent, replyingToEmail, emailAccountId],
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
    <form
      ref={formRef}
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm"
    >
      {/* Recipients Section */}
      <div className="border-b border-border">
        {replyingToEmail?.to && !editReply ? (
          <button
            type="button"
            className="flex w-full gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
            onClick={() => setEditReply(true)}
          >
            <span className="text-sm font-medium text-green-600 dark:text-green-500">
              Draft
            </span>{" "}
            <span className="max-w-md truncate text-sm text-foreground">
              to {extractNameFromEmail(replyingToEmail.to)}
            </span>
          </button>
        ) : (
          <div className="space-y-0">
            {/* To Field */}
            <div className="flex items-center border-b border-border/50 px-3 py-2">
              <div className="flex w-full items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  To:
                </span>
                {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
                  <Combobox
                    value={selectedEmailAddressses}
                    onChange={handleComboboxOnChange}
                    multiple
                  >
                    <div className="flex min-h-8 w-full flex-1 flex-wrap items-center gap-1.5 text-sm">
                      {selectedEmailAddressses.map((emailAddress) => (
                        <Badge
                          key={emailAddress}
                          variant="secondary"
                          className="cursor-pointer rounded-md bg-muted/60 px-2 py-0.5 text-xs font-normal transition-colors hover:bg-muted"
                          onClick={() => {
                            onRemoveSelectedEmail(emailAddress);
                            setSearchQuery(emailAddress);
                          }}
                        >
                          {extractNameFromEmail(emailAddress)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveSelectedEmail(emailAddress);
                            }}
                          >
                            <XIcon className="ml-1 size-3 text-muted-foreground" />
                          </button>
                        </Badge>
                      ))}

                      <div className="relative flex-1">
                        <ComboboxInput
                          value={searchQuery}
                          className="w-full border-none bg-transparent p-0 text-sm focus:border-none focus:outline-none focus:ring-0"
                          placeholder="Enter email address"
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          onKeyUp={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              setValue(
                                "to",
                                [...selectedEmailAddressses, searchQuery].join(
                                  ",",
                                ),
                              );
                              setSearchQuery("");
                            }
                          }}
                        />

                        {!!data?.result?.length && (
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 overflow-auto rounded-md border bg-popover py-1 text-base shadow-lg focus:outline-none sm:text-sm">
                            <ComboboxOption
                              className="h-0 w-0 overflow-hidden"
                              value={searchQuery}
                            />
                            {data?.result.map((contact) => {
                              const person = {
                                emailAddress:
                                  contact.person?.emailAddresses?.[0].value,
                                name: contact.person?.names?.[0].displayName,
                                profilePictureUrl:
                                  contact.person?.photos?.[0].url,
                              };

                              return (
                                <ComboboxOption
                                  className={({ focus }) =>
                                    cn(
                                      "cursor-default select-none px-4 py-1 text-foreground",
                                      focus && "bg-accent",
                                    )
                                  }
                                  key={person.emailAddress}
                                  value={person.emailAddress}
                                >
                                  {({ selected }) => (
                                    <div className="my-2 flex items-center">
                                      {selected ? (
                                        <div className="flex size-10 items-center justify-center rounded-full">
                                          <CheckCircleIcon className="size-5 text-primary" />
                                        </div>
                                      ) : (
                                        <Avatar className="size-10">
                                          <AvatarImage
                                            src={person.profilePictureUrl!}
                                            alt={
                                              person.emailAddress ||
                                              "Profile picture"
                                            }
                                          />
                                          <AvatarFallback className="text-xs">
                                            {person.emailAddress?.[0] || "A"}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <div className="ml-3 flex flex-col justify-center">
                                        <div className="text-sm font-medium text-foreground">
                                          {person.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
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
                ) : (
                  <input
                    type="text"
                    {...register("to", { required: true })}
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                    placeholder="Enter email address"
                  />
                )}
              </div>

              {/* Cc/Bcc Toggle Buttons */}
              <div className="flex gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-sm font-medium transition-colors",
                    showCc
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => setShowCc(!showCc)}
                >
                  Cc
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-sm font-medium transition-colors",
                    showBcc
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => setShowBcc(!showBcc)}
                >
                  Bcc
                </button>
              </div>
            </div>

            {/* Cc Field */}
            {showCc && (
              <div className="flex items-center border-b border-border/50 px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Cc:
                </span>
                <input
                  type="text"
                  {...register("cc")}
                  className="ml-2 flex-1 bg-transparent text-sm focus:outline-none"
                  placeholder="Enter Cc recipients"
                />
              </div>
            )}

            {/* Bcc Field */}
            {showBcc && (
              <div className="flex items-center border-b border-border/50 px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Bcc:
                </span>
                <input
                  type="text"
                  {...register("bcc")}
                  className="ml-2 flex-1 bg-transparent text-sm focus:outline-none"
                  placeholder="Enter Bcc recipients"
                />
              </div>
            )}

            {/* Subject Field */}
            <div className="flex items-center px-3 py-2">
              <span className="text-sm font-medium text-muted-foreground">
                Subject:
              </span>
              <input
                type="text"
                {...register("subject", { required: true })}
                className="ml-2 flex-1 bg-transparent text-sm focus:outline-none"
                placeholder="Enter subject"
              />
            </div>
          </div>
        )}
      </div>

      {/* Editor Section */}
      <div className="flex-1 bg-background">
        <Tiptap
          ref={editorRef}
          initialContent={replyingToEmail?.draftHtml}
          onChange={handleEditorChange}
          className="min-h-[200px]"
          onMoreClick={
            !replyingToEmail?.quotedContentHtml || showFullContent
              ? undefined
              : showExpandedContent
          }
        />
      </div>

      {/* Actions Section */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2.5">
        <Button type="submit" disabled={isSubmitting} size="sm">
          {isSubmitting && <ButtonLoader />}
          Send
          <span className="ml-2 flex items-center gap-0.5 rounded bg-primary-foreground/10 px-1.5 py-0.5 text-xs">
            {symbol}
            <CornerDownLeftIcon className="size-3" />
          </span>
        </Button>

        {onDiscard && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSubmitting}
            onClick={onDiscard}
            className="size-8 text-muted-foreground hover:text-destructive"
          >
            <TrashIcon className="size-4" />
            <span className="sr-only">Discard</span>
          </Button>
        )}
      </div>
    </form>
  );
};
