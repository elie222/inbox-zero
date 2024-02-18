"use client";

import { useCallback, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { capitalCase } from "capital-case";
import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import { SlideOverSheet } from "@/components/SlideOverSheet";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { ActResponse } from "@/app/api/ai/act/controller";
import { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { AlertBasic } from "@/components/Alert";
import { TestRulesMessage } from "@/app/(app)/cold-email-blocker/TestRulesMessage";

export function TestRules(props: { disabled?: boolean }) {
  return (
    <SlideOverSheet
      title="Test Rules"
      description="Test how your rules perform against real emails."
      content={<TestRulesContent />}
    >
      <Button color="white" disabled={props.disabled}>
        <BookOpenCheckIcon className="mr-2 h-4 w-4" />
        Test Rules
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
  const [plan, setPlan] = useState<ActResponse>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestRulesInputs>();

  const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(async (data) => {
    const res = await postRequest<ActResponse, ActBodyWithHtml>("/api/ai/act", {
      email: {
        from: "",
        to: "",
        date: "",
        replyTo: "",
        cc: "",
        subject: "",
        textPlain: data.message,
        textHtml: "",
        snippet: data.message,
        threadId: "",
        messageId: "",
        headerMessageId: "",
        references: "",
      },
      allowExecute: false,
    });

    if (isError(res)) {
      console.error(res);
      toastError({ description: `Error checking email.` });
    } else {
      setPlan(res);
    }
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
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
          Test Rules
        </Button>
      </form>
      {plan && (
        <div className="mt-4">
          <Plan plan={plan} />
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

  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<ActResponse>();

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
            loading={planning}
            onClick={async () => {
              setPlanning(true);

              const res = await postRequest<ActResponse, ActBodyWithHtml>(
                "/api/ai/act",
                {
                  email: {
                    from: message.parsedMessage.headers.from,
                    to: message.parsedMessage.headers.to,
                    date: message.parsedMessage.headers.date,
                    replyTo: message.parsedMessage.headers["reply-to"],
                    cc: message.parsedMessage.headers.cc,
                    subject: message.parsedMessage.headers.subject,
                    textPlain: message.parsedMessage.textPlain || null,
                    textHtml: message.parsedMessage.textHtml || null,
                    snippet: message.snippet || null,
                    threadId: message.threadId || "",
                    messageId: message.id || "",
                    headerMessageId:
                      message.parsedMessage.headers["message-id"] || "",
                    references: message.parsedMessage.headers.references,
                  },
                  allowExecute: false,
                },
              );

              if (isError(res)) {
                console.error(res);
                toastError({
                  description: `There was an error planning the email.`,
                });
              } else {
                setPlan(res);
              }
              setPlanning(false);
            }}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            Test
          </Button>
        </div>
      </div>
      <div className="pb-4">
        <Plan plan={plan} />
      </div>
    </div>
  );
}

function Plan(props: { plan: ActResponse }) {
  const { plan } = props;

  if (!plan) return null;

  if (!plan.rule) {
    return (
      <AlertBasic
        variant="destructive"
        title="No rule found"
        description={
          <div className="space-y-2">
            <div>This email does not match any of the rules you have set.</div>
            <div>
              <strong>AI reason:</strong> {plan.reason}
            </div>
          </div>
        }
      />
    );
  }

  if (plan.plannedAction?.actions) {
    const MAX_LENGTH = 280;

    const aiGeneratedContent = Object.entries(plan.plannedAction.args).map(
      ([key, value]) => {
        return (
          <div key={key}>
            <strong>{capitalCase(key)}: </strong>
            {value}
          </div>
        );
      },
    );

    return (
      <AlertBasic
        title={`Rule found: "${plan.rule.name}"`}
        variant="blue"
        description={
          <div className="mt-4 space-y-4">
            {!!aiGeneratedContent.length && (
              <div>
                <strong>AI generated content: </strong>
                {aiGeneratedContent}
              </div>
            )}
            {!!plan.reason && (
              <div>
                <strong>AI reason: </strong>
                {plan.reason}
              </div>
            )}
            <div>
              <strong>Instructions: </strong>
              {plan.rule.instructions.substring(0, MAX_LENGTH) +
                (plan.rule.instructions.length < MAX_LENGTH ? "" : "...")}
            </div>
          </div>
        }
        icon={<CheckCircle2Icon className="h-4 w-4" />}
      />
    );
  }
}
