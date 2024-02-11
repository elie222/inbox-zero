"use client";

import React, { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Combobox } from "@headlessui/react";
import { z } from "zod";
import { CheckCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isError } from "@/utils/error";
import { ContactsResponse } from "@/app/api/google/contacts/route";
import { SendEmailBody, SendEmailResponse } from "@/utils/gmail/mail";
import { postRequest } from "@/utils/api";
import { env } from "@/env.mjs";
import "./novelEditorStyles.css";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/Loading";

export type ReplyingToEmail = {
  threadId: string;
  headerMessageId: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
};

export const ComposeEmailForm = (props: {
  replyingToEmail?: ReplyingToEmail;
  novelEditorClassName?: string;
  submitButtonClassName?: string;
  refetch?: () => void;
  onSuccess?: () => void;
}) => {
  const { refetch, onSuccess } = props;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: props.replyingToEmail,
      subject: props.replyingToEmail?.subject,
      to: props.replyingToEmail?.to,
      cc: props.replyingToEmail?.cc,
    },
  });

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      try {
        const res = await postRequest<SendEmailResponse, SendEmailBody>(
          "/api/google/messages/send",
          data,
        );
        if (isError(res))
          toastError({
            description: `There was an error sending the email :(`,
          });
        else toastSuccess({ description: `Email sent!` });

        onSuccess?.();
      } catch (error) {
        console.error(error);
        toastError({ description: `There was an error sending the email :(` });
      }

      refetch?.();
    },
    [refetch, onSuccess],
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!props.replyingToEmail && (
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
                nullable={true}
              >
                <div className="flex w-full flex-wrap items-center">
                  {selectedEmailAddressses.map((emailAddress) => (
                    <Badge
                      key={emailAddress}
                      variant="outline"
                      className="mr-1.5"
                    >
                      {emailAddress}

                      <button
                        type="button"
                        onClick={() => onRemoveSelectedEmail(emailAddress)}
                      >
                        <XIcon className="ml-1.5 h-3 w-3" />
                      </button>
                    </Badge>
                  ))}

                  <div className="relative flex-1">
                    <Combobox.Input
                      value={searchQuery}
                      // styles copied and pasted from Input.tsx
                      className="block w-full flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm"
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
                      <Combobox.Options
                        className={
                          "absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm"
                        }
                      >
                        <Combobox.Option
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
                            <Combobox.Option
                              className={({ active }) =>
                                `cursor-default select-none px-4 py-1 text-gray-900 ${
                                  active && "bg-gray-50"
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
                            </Combobox.Option>
                          );
                        })}
                      </Combobox.Options>
                    )}
                  </div>
                </div>
              </Combobox>
            </div>
          ) : (
            <Input
              type="text"
              name="to"
              label="Recipient"
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
          />
        </>
      )}

      <div className="compose-novel">
        <NovelComponent
          defaultValue=""
          disableLocalStorage
          completionApi="api/ai/compose-autocomplete"
          onUpdate={(editor) => {
            if (editor) {
              // TODO do we really need to set both each time?
              setValue("messageText", editor.getText());
              setValue("messageHtml", editor.getHTML());
            }
          }}
          className={props.novelEditorClassName}
        />
      </div>

      <Button
        type="submit"
        loading={isSubmitting}
        // issue: https://github.com/steven-tey/novel/pull/232
        style={{ backgroundColor: "rgb(17, 24, 39)" }}
        className={props.submitButtonClassName}
      >
        Send
      </Button>
    </form>
  );
};

// import dynamically to stop Novel's Tailwind styling from overriding our own styling
const NovelComponent = dynamic(
  () => import("novel").then((mod) => mod.Editor),
  {
    loading: () => <Loading />,
  },
);
