// this is a copy/paste of the automation/TestRules.tsx file
// can probably extract some common components from it

"use client";

import { useCallback, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { BookOpenCheckIcon, SparklesIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import { SlideOverSheet } from "@/components/SlideOverSheet";
import { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { AlertBasic } from "@/components/Alert";
import {
  ColdEmailBlockerBody,
  ColdEmailBlockerResponse,
} from "@/app/api/ai/cold-email/route";
import { TestRulesMessage } from "@/app/(app)/cold-email-blocker/TestRulesMessage";

export function TestRules() {
  return (
    <SlideOverSheet
      title="Test Cold Emails"
      description="Test which emails are flagged as cold emails. We also check if the sender has emailed you before and if it includes unsubscribe links."
      content={<TestRulesContent />}
    >
      <Button color="white" type="button">
        <BookOpenCheckIcon className="mr-2 h-4 w-4" />
        Test
      </Button>
    </SlideOverSheet>
  );
}

function TestRulesContent() {
  const { data, isLoading, error } = useSWR<MessagesResponse>(
    "/api/google/messages",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  const session = useSession();
  const email = session.data?.user.email;

  return (
    <div>
      <div className="mt-4">
        <TestRulesForm />
      </div>

      <div className="mt-4">
        <Separator />
      </div>

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            {data.messages.map((message) => {
              return (
                <TestRulesContentRow
                  key={message.id}
                  message={message}
                  userEmail={email!}
                />
              );
            })}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

type TestRulesInputs = { message: string };

const TestRulesForm = () => {
  const [isColdEmail, setIsColdEmail] = useState<boolean | null | undefined>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestRulesInputs>({
    defaultValues: {
      message:
        "Hey, I run a development agency. I was wondering if you need extra hands on your team?",
    },
  });

  const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(async (data) => {
    const res = await postRequest<
      ColdEmailBlockerResponse,
      ColdEmailBlockerBody
    >("/api/ai/cold-email", {
      email: {
        from: "",
        subject: "",
        body: data.message,
      },
    });

    if (isError(res)) {
      console.error(res);
      toastError({ description: `Error checking if cold email.` });
    } else {
      setIsColdEmail(res.isColdEmail);
    }
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="text"
          as="textarea"
          rows={3}
          name="message"
          label="Email to test against"
          placeholder="Hey, I run a marketing agency, and would love to chat."
          registerProps={register("message", { required: true })}
          error={errors.message}
        />
        <Button type="submit" loading={isSubmitting}>
          <SparklesIcon className="mr-2 h-4 w-4" />
          Test
        </Button>
      </form>
      {typeof isColdEmail === "boolean" && (
        <div className="mt-4">
          <Result isColdEmail={isColdEmail} />
        </div>
      )}
    </div>
  );
};

function TestRulesContentRow(props: {
  message: MessagesResponse["messages"][number];
  userEmail: string;
}) {
  const { message } = props;

  const [loading, setLoading] = useState(false);
  const [isColdEmail, setIsColdEmail] = useState<boolean | null | undefined>();

  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center justify-between py-2">
        <TestRulesMessage
          from={message.parsedMessage.headers.from}
          subject={message.parsedMessage.headers.subject}
          snippet={message.snippet?.trim() || ""}
          userEmail={props.userEmail}
        />
        <div className="ml-4">
          <Button
            color="white"
            loading={loading}
            onClick={async () => {
              setLoading(true);

              const text = message.snippet || message.parsedMessage.textPlain;

              if (!text) {
                toastError({
                  description: `Unable to check if cold email. No text found in email.`,
                });

                setLoading(false);
                return;
              }

              const res = await postRequest<
                ColdEmailBlockerResponse,
                ColdEmailBlockerBody
              >("/api/ai/cold-email", {
                email: {
                  from: message.parsedMessage.headers.from,
                  subject: message.parsedMessage.headers.subject,
                  body: text,
                  textHtml: message.parsedMessage.textHtml,
                },
              });

              if (isError(res)) {
                console.error(res);
                toastError({
                  description: `There was an error checking whether it's a cold email.`,
                });
              } else {
                setIsColdEmail(res.isColdEmail);
              }
              setLoading(false);
            }}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            Test
          </Button>
        </div>
      </div>
      <div className="pb-4">
        <Result isColdEmail={isColdEmail} />
      </div>
    </div>
  );
}

function Result(props: ColdEmailBlockerResponse) {
  const { isColdEmail } = props;

  if (isColdEmail === null || isColdEmail === undefined) return null;

  if (isColdEmail)
    return (
      <AlertBasic
        variant="destructive"
        title="Email is a cold email!"
        description=""
      />
    );
  else
    return (
      <AlertBasic
        variant="success"
        title="Email is not a cold email!"
        description=""
      />
    );
}
