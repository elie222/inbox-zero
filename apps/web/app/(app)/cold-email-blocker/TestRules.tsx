// this is a copy/paste of the automation/TestRules.tsx file
// can probably extract some common components from it

"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { SparklesIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import type { MessagesResponse } from "@/app/api/google/messages/route";
import { Separator } from "@/components/ui/separator";
import { AlertBasic } from "@/components/Alert";
import type {
  ColdEmailBlockerBody,
  ColdEmailBlockerResponse,
} from "@/app/api/ai/cold-email/route";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { SearchForm } from "@/components/SearchForm";
import { TableCell, TableRow } from "@/components/ui/table";
import { CardContent } from "@/components/ui/card";

export function TestRulesContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, error } = useSWR<MessagesResponse>(
    `/api/google/messages?q=${searchQuery}`,
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  const session = useSession();
  const email = session.data?.user.email;

  return (
    <div>
      <CardContent>
        <TestRulesForm />

        <div className="mt-4 max-w-sm">
          <SearchForm onSearch={setSearchQuery} />
        </div>
      </CardContent>

      <Separator />

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
  const [coldEmailResponse, setColdEmailResponse] =
    useState<ColdEmailBlockerResponse | null>(null);

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
        textHtml: null,
        textPlain: data.message,
        snippet: null,
        threadId: null,
      },
    });

    if (isError(res)) {
      console.error(res);
      toastError({
        title: "Error checking if cold email.",
        description: res.error,
      });
    } else {
      setColdEmailResponse(res);
    }
  }, []);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="text"
          autosizeTextarea
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
      {coldEmailResponse && (
        <div className="mt-4">
          <Result coldEmailResponse={coldEmailResponse} />
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

  const [testing, setTesting] = useState(false);
  const [coldEmailResponse, setColdEmailResponse] =
    useState<ColdEmailBlockerResponse | null>(null);

  return (
    <TableRow
      className={
        testing ? "animate-pulse bg-blue-50 dark:bg-blue-950/20" : undefined
      }
    >
      <TableCell>
        <div className="flex items-center justify-between">
          <EmailMessageCell
            from={message.headers.from}
            subject={message.headers.subject}
            snippet={message.snippet}
            userEmail={props.userEmail}
            threadId={message.threadId}
            messageId={message.id}
          />
          <div className="ml-4">
            <Button
              color="white"
              loading={testing}
              onClick={async () => {
                setTesting(true);

                const res = await postRequest<
                  ColdEmailBlockerResponse,
                  ColdEmailBlockerBody
                >("/api/ai/cold-email", {
                  email: {
                    from: message.headers.from,
                    subject: message.headers.subject,
                    textHtml: message.textHtml || null,
                    textPlain: message.textPlain || null,
                    snippet: message.snippet || null,
                    threadId: message.threadId,
                  },
                });

                if (isError(res)) {
                  console.error(res);
                  toastError({
                    title: "Error checking whether it's a cold email.",
                    description: res.error,
                  });
                } else {
                  setColdEmailResponse(res);
                }
                setTesting(false);
              }}
            >
              <SparklesIcon className="mr-2 h-4 w-4" />
              Test
            </Button>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Result coldEmailResponse={coldEmailResponse} />
      </TableCell>
    </TableRow>
  );
}

function Result(props: { coldEmailResponse: ColdEmailBlockerResponse | null }) {
  const { coldEmailResponse } = props;

  if (!coldEmailResponse) return null;

  if (coldEmailResponse.isColdEmail) {
    return (
      <AlertBasic
        variant="destructive"
        title="Email is a cold email!"
        description={coldEmailResponse.aiReason}
      />
    );
  }
  return (
    <AlertBasic
      variant="success"
      title={
        coldEmailResponse.reason === "hasPreviousEmail"
          ? "This person has previously emailed you. This is not a cold email!"
          : "Our AI determined this is not a cold email!"
      }
      description={coldEmailResponse.aiReason}
    />
  );
}
