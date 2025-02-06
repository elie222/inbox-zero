"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckCircleIcon, TrashIcon, XIcon } from "lucide-react";
import React, { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import { Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { env } from "@/env";
import { cn } from "@/utils";
import { extractNameFromEmail } from "@/utils/email";
import { isActionError } from "@/utils/error";
import type { SendEmailBody } from "@/utils/gmail/mail";
import { Tiptap } from "@/components/Tiptap";
import { sendEmailAction } from "@/utils/actions/mail";

export type ReplyingToEmail = {
  threadId: string;
  headerMessageId: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
  messageText: string | undefined;
  messageHtml?: string | undefined;
};

export const ComposeEmailForm = ({
  replyingToEmail,
  submitButtonClassName,
  refetch,
  onSuccess,
  onDiscard,
}: {
  replyingToEmail?: ReplyingToEmail;
  submitButtonClassName?: string;
  refetch?: () => void;
  onSuccess?: () => void;
  onDiscard?: () => void;
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: replyingToEmail,
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      messageHtml: "",
      messageText: "",
    },
  });

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      const enrichedData = {
        ...data,
        messageText: `${data.messageText}\n\n${replyingToEmail?.messageText ?? ""}`,
        messageHtml: `${data.messageHtml ?? ""}\n<br/><br/>${replyingToEmail?.messageHtml ?? ""}`,
      };

      try {
        const res = await sendEmailAction(enrichedData);
        if (isActionError(res))
          toastError({
            description: "There was an error sending the email :(",
          });
        else toastSuccess({ description: "Email sent!" });

        onSuccess?.();
      } catch (error) {
        console.error(error);
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [
      refetch,
      onSuccess,
      replyingToEmail?.messageHtml,
      replyingToEmail?.messageText,
    ],
  );

  const [searchQuery, setSearchQuery] = React.useState("");
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

  const [editReply, setEditReply] = React.useState(false);

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("messageHtml", html);
      // Also set plain text version by stripping HTML tags
      setValue("messageText", html.replace(/<[^>]*>/g, ""));
    },
    [setValue],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      {replyingToEmail?.to && !editReply ? (
        <button
          type="button"
          className="flex gap-1 text-left"
          onClick={() => setEditReply(true)}
        >
          <span className="text-green-500">Draft</span>{" "}
          <span className="max-w-md break-words">
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
                <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500">
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
                      className="w-full border-none p-0 text-sm focus:border-none focus:ring-0"
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
                          "absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm"
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
                                `cursor-default select-none px-4 py-1 text-gray-900 ${
                                  focus && "bg-gray-50"
                                }`
                              }
                              key={person.emailAddress}
                              value={person.emailAddress}
                            >
                              {({ selected }) => (
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
                                    <div>{person.name}</div>
                                    <div className="text-sm font-semibold">
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

      <Tiptap
        initialContent={replyingToEmail?.messageHtml}
        onChange={handleEditorChange}
        className="min-h-[200px]"
      />

      <div
        className={cn(
          "flex items-center justify-between",
          submitButtonClassName,
        )}
      >
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <ButtonLoader />}
          Send
        </Button>

        {onDiscard && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={submitButtonClassName}
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
