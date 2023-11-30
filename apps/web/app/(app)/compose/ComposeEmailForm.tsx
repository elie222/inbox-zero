"use client";

import React, { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isError } from "@/utils/error";
import { ContactsResponse } from "@/app/api/google/contacts/route";
import { Combobox } from "@/components/Combobox";
import { SendEmailBody, SendEmailResponse } from "@/utils/gmail/mail";
import { postRequest } from "@/utils/api";
import { env } from "@/env.mjs";

export const ComposeEmailForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>();

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
        <div className="space-y-2">
          <Label name="to" label="Recipient" />
          <Combobox
            options={
              data?.result.map((contact) => ({
                value: contact.person?.emailAddresses?.[0].value!,
                label: `${contact.person?.names?.[0].displayName || ""} <${
                  contact.person?.emailAddresses?.[0].value || ""
                }>`,
              })) || []
            }
            placeholder="Select contact..."
            emptyText="No contacts found."
            value={watch("to")}
            onChangeValue={(value) => {
              setValue("to", value);
            }}
            search={searchQuery}
            onSearch={setSearchQuery}
          />
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
        label="Subject"
        registerProps={register("subject", { required: true })}
        error={errors.subject}
      />
      <Input
        type="text"
        as="textarea"
        rows={6}
        name="message"
        label="Message"
        registerProps={register("messageText", { required: true })}
        error={errors.messageText}
      />
      <Button type="submit" loading={isSubmitting}>
        Send
      </Button>
    </form>
  );
};
