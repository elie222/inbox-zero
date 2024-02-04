"use client";

import React, { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Editor as NovelEditor } from "novel";
import { Combobox } from "@headlessui/react";
import Image from "next/image";
import { z } from "zod";
import clsx from "clsx";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isError } from "@/utils/error";
import { ContactsResponse } from "@/app/api/google/contacts/route";
import { SendEmailBody, SendEmailResponse } from "@/utils/gmail/mail";
import { postRequest } from "@/utils/api";
import { env } from "@/env.mjs";
import "./novelEditorStyles.css";

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
}) => {
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

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(async (data) => {
    try {
      const res = await postRequest<SendEmailResponse, SendEmailBody>(
        "/api/google/messages/send",
        data,
      );
      if (isError(res))
        toastError({ description: `There was an error sending the email :(` });
      else toastSuccess({ description: `Email sent!` });
    } catch (error) {
      console.error(error);
      toastError({ description: `There was an error sending the email :(` });
    }
  }, []);

  const [searchQuery, setSearchQuery] = React.useState("");
  const { data, isLoading, error } = useSWR<
    ContactsResponse,
    { error: string }
  >(
    env.NEXT_PUBLIC_CONTACTS_ENABLED
      ? `/api/google/contacts?query=${searchQuery}`
      : null,
    {
      keepPreviousData: true,
    },
  );

  const selectedEmailAddressses = watch("to", "").split(",").filter(Boolean);

  const handleBadgeClose = (emailAddress: string) => {
    const filteredEmailAddresses = selectedEmailAddressses.filter(
      (e) => e !== emailAddress,
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
            <div className="space-y-2">
              <Label name="to" label="Recipient" />
              <Combobox
                value={selectedEmailAddressses}
                onChange={handleComboboxOnChange}
                multiple
                nullable={true}
              >
                <div className="border-1 flex rounded-md border">
                  {selectedEmailAddressses.map((emailAddress) => (
                    <span
                      key={emailAddress}
                      className="m-2 inline-flex items-center rounded-md bg-gray-50 p-4 px-2 py-1 text-sm font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"
                    >
                      {emailAddress}
                      <button
                        type="button"
                        onClick={() => handleBadgeClose(emailAddress)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="mx-1 h-4 w-4"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z"
                            fill="#0F1729"
                          />
                        </svg>
                      </button>
                    </span>
                  ))}

                  <Combobox.Input
                    value={searchQuery}
                    className="w-full rounded-md border-none py-1 text-lg outline-0 focus:border-none focus:ring-0"
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
                <Combobox.Options
                  className={clsx(
                    data?.result && data.result.length === 0 && "hidden",
                    "mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm",
                  )}
                >
                  <Combobox.Option
                    className="h-0 w-0 overflow-hidden"
                    value={searchQuery}
                  />
                  {data?.result.map((contact) => {
                    const person = {
                      emailAddress: contact.person?.emailAddresses?.[0].value,
                      name: contact.person?.names?.[0].displayName,
                      profilePictureUrl: contact.person?.photos?.[0].url,
                    };

                    return (
                      <Combobox.Option
                        className={({ active }) =>
                          `cursor-default select-none px-4 py-1 text-gray-900 ${
                            active && "bg-gray-200"
                          }`
                        }
                        key={person.emailAddress}
                        value={person.emailAddress}
                      >
                        {({ selected }) => (
                          <div className="my-2 flex">
                            {!selected ? (
                              <Image
                                src={person.profilePictureUrl!}
                                alt="profile-picture"
                                className="h-12 rounded-full"
                                width={48}
                                height={48}
                              />
                            ) : (
                              <svg
                                className="h-12 rounded-full"
                                version="1.1"
                                id="Capa_1"
                                xmlns="http://www.w3.org/2000/svg"
                                xmlnsXlink="http://www.w3.org/1999/xlink"
                                viewBox="0 0 17.837 17.837"
                                xmlSpace="preserve"
                              >
                                <g>
                                  <path
                                    className="fill-gray-500"
                                    d="M16.145,2.571c-0.272-0.273-0.718-0.273-0.99,0L6.92,10.804l-4.241-4.27
                           c-0.272-0.274-0.715-0.274-0.989,0L0.204,8.019c-0.272,0.271-0.272,0.717,0,0.99l6.217,6.258c0.272,0.271,0.715,0.271,0.99,0
                           L17.63,5.047c0.276-0.273,0.276-0.72,0-0.994L16.145,2.571z"
                                  />
                                </g>
                              </svg>
                            )}
                            <div className="mx-2 flex flex-col items-center justify-center">
                              <div>{person.name}</div>
                              <div>{person.emailAddress}</div>
                            </div>
                          </div>
                        )}
                      </Combobox.Option>
                    );
                  })}
                </Combobox.Options>
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
        <NovelEditor
          defaultValue=""
          disableLocalStorage={true}
          completionApi="api/ai/compose-autocomplete"
          onUpdate={(editor) => {
            editor = editor!; // TODO how this help anything?
            // TODO do we really need to set both each time?
            setValue("messageText", editor.getText());
            setValue("messageHtml", editor.getHTML());
          }}
          className="h-40 overflow-auto"
        />
      </div>

      <Button
        type="submit"
        loading={isSubmitting}
        // issue: https://github.com/steven-tey/novel/pull/232
        style={{ backgroundColor: "rgb(17, 24, 39)" }}
        className="mx-8"
      >
        Send
      </Button>
    </form>
  );
};
