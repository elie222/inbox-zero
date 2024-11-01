"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckCircleIcon, TrashIcon, XIcon } from "lucide-react";
import {
  EditorBubble,
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorContent,
  EditorRoot,
} from "novel";
import { handleCommandNavigation } from "novel/extensions";
import React, { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";

import { defaultExtensions } from "@/app/(app)/compose/extensions";
import { ColorSelector } from "@/app/(app)/compose/selectors/color-selector";
import { LinkSelector } from "@/app/(app)/compose/selectors/link-selector";
import { NodeSelector } from "@/app/(app)/compose/selectors/node-selector";
// import { AISelector } from "@/app/(app)/compose/selectors/ai-selector";
import { TextButtons } from "@/app/(app)/compose/selectors/text-buttons";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import { Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { env } from "@/env";
import { cn } from "@/utils";
import { postRequest } from "@/utils/api";
import { extractNameFromEmail } from "@/utils/email";
import { isError } from "@/utils/error";
import type { SendEmailBody, SendEmailResponse } from "@/utils/gmail/mail";
import {
  slashCommand,
  suggestionItems,
} from "@/app/(app)/compose/SlashCommand";
import { Separator } from "@/components/ui/separator";
import "@/styles/prosemirror.css";

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

export const ComposeEmailForm = (props: {
  replyingToEmail?: ReplyingToEmail;
  novelEditorClassName?: string;
  submitButtonClassName?: string;
  refetch?: () => void;
  onSuccess?: () => void;
  onDiscard?: () => void;
}) => {
  const { refetch, onSuccess } = props;

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  // const [openAi, setOpenAi] = useState(false);

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
      const enrichedData = {
        ...data,
        messageText: data.messageText + props.replyingToEmail?.messageText,
        messageHtml:
          (data.messageHtml ?? "") + (props.replyingToEmail?.messageHtml ?? ""),
      };
      try {
        const res = await postRequest<SendEmailResponse, SendEmailBody>(
          "/api/google/messages/send",
          enrichedData,
        );
        if (isError(res))
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
      props.replyingToEmail?.messageHtml,
      props.replyingToEmail?.messageText,
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {props.replyingToEmail?.to && !editReply ? (
        <button type="button" onClick={() => setEditReply(true)}>
          <span className="text-green-500">Draft</span> to{" "}
          {extractNameFromEmail(props.replyingToEmail.to)}
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
                nullable={true}
              >
                <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-2 rounded-md border border-gray-300 px-2 py-2 shadow-sm focus-within:border-black focus-within:ring-black disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:ring-gray-200 sm:text-sm">
                  {selectedEmailAddressses.map((emailAddress) => (
                    <Badge
                      key={emailAddress}
                      variant="outline"
                      className="h-8 rounded-md border-black bg-black text-white"
                    >
                      {extractNameFromEmail(emailAddress)}

                      <button
                        type="button"
                        onClick={() => onRemoveSelectedEmail(emailAddress)}
                      >
                        <XIcon className="ml-1.5 h-3 w-3" />
                      </button>
                    </Badge>
                  ))}

                  <div className="relative flex-1">
                    <ComboboxInput
                      value={searchQuery}
                      className="w-full border-none py-0 focus:border-none focus:ring-0"
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
          />
        </>
      )}

      <EditorRoot>
        {/* TODO onUpdate runs on every change. In most cases, you will want to debounce the updates to prevent too many state changes. */}
        <EditorContent
          extensions={[...defaultExtensions, slashCommand]}
          onUpdate={({ editor }) => {
            setValue("messageText", editor.getText());
            setValue("messageHtml", editor.getHTML());
          }}
          className={cn(
            "relative min-h-32 w-full max-w-screen-lg rounded-xl border bg-background sm:rounded-lg",
            props.novelEditorClassName,
          )}
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            attributes: {
              class:
                "prose-lg prose-stone dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full",
            },
          }}
        >
          <EditorCommand className="z-50 h-auto max-h-[330px] w-72 overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-muted-foreground">
              No results
            </EditorCommandEmpty>
            {suggestionItems.map((item) => (
              <EditorCommandItem
                value={item.title}
                onCommand={(val) => item.command?.(val)}
                className={
                  "flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
                }
                key={item.title}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                  {item.icon}
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </EditorCommandItem>
            ))}
          </EditorCommand>

          <EditorBubble
            tippyOptions={{ placement: "top" }}
            className="flex w-fit max-w-[90vw] overflow-hidden rounded border border-muted bg-background shadow-xl"
          >
            <Separator orientation="vertical" />
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />
            <Separator orientation="vertical" />
            <LinkSelector open={openLink} onOpenChange={setOpenLink} />
            <Separator orientation="vertical" />
            <TextButtons />
            <Separator orientation="vertical" />
            <ColorSelector open={openColor} onOpenChange={setOpenColor} />
            {/* <Separator orientation="vertical" />
            <AISelector open={openAi} onOpenChange={setOpenAi} /> */}
          </EditorBubble>
        </EditorContent>
      </EditorRoot>

      <div
        className={cn(
          "flex items-center justify-between",
          props.submitButtonClassName,
        )}
      >
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting && <ButtonLoader />}
          Send
        </Button>

        {props.onDiscard && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={props.submitButtonClassName}
            disabled={isSubmitting}
            onClick={props.onDiscard}
          >
            <TrashIcon className="h-4 w-4" />
            <span className="sr-only">Discard</span>
          </Button>
        )}
      </div>
    </form>
  );
};
