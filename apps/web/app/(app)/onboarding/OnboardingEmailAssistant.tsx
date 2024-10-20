"use client";

import { useState } from "react";
import useSWR from "swr";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { SectionDescription } from "@/components/Typography";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { RulesExamplesResponse } from "@/app/api/user/rules/examples/route";
import { LoadingContent } from "@/components/LoadingContent";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Loading } from "@/components/Loading";

const emailAssistantSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
});

type EmailAssistantInputs = z.infer<typeof emailAssistantSchema>;

export function OnboardingAIEmailAssistant() {
  const [showNextButton, setShowNextButton] = useState(false);

  return (
    <div className="space-y-6">
      <EmailAssistantForm setShowNextButton={setShowNextButton} />
      {showNextButton && <OnboardingNextButton />}
    </div>
  );
}

const defaultPrompt = `* Label newsletters as "Newsletter" and archive them.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my calendar link: https://cal.com/example`;

function EmailAssistantForm({
  setShowNextButton,
}: {
  setShowNextButton: (show: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const { data, isLoading, error } = useSWR<RulesExamplesResponse>(
    prompt
      ? `/api/user/rules/examples?rulesPrompt=${encodeURIComponent(prompt)}`
      : null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailAssistantInputs>({
    resolver: zodResolver(emailAssistantSchema),
    defaultValues: {
      prompt: defaultPrompt,
    },
  });

  const onSubmit: SubmitHandler<EmailAssistantInputs> = async (data) => {
    setPrompt(data.prompt);
    setShowNextButton(true);
    // const result = await handleActionCall("saveRulesPromptAction", () =>
    //   saveRulesPromptAction({ rulesPrompt: data.prompt }),
    // );

    // if (isActionError(result)) {
    //   toastError({
    //     title: "Error saving rules",
    //     description: result.error,
    //   });
    //   return;
    // }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="text"
          as="textarea"
          rows={5}
          name="prompt"
          placeholder={`This is where you tell the AI assistant how to handle your emails. For example:

${defaultPrompt}`}
          registerProps={register("prompt")}
          error={errors.prompt}
        />
        <Button type="submit" loading={isSubmitting || isLoading}>
          Test
        </Button>
      </form>

      {!!prompt && (
        <div className="mt-4">
          <EmailAssistantTestResults
            isLoading={isLoading}
            error={error}
            data={data}
          />
        </div>
      )}
    </div>
  );
}

function EmailAssistantTestResults({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error?: any;
  data?: RulesExamplesResponse;
}) {
  return (
    <>
      <SectionDescription>
        Here is how the AI assistant would have handled some of your previous
        emails:
      </SectionDescription>

      <Card className="mt-4">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={
            <div className="flex flex-col items-center justify-center pb-8">
              <Loading />
              <p className="text-sm text-gray-500">
                Loading example matches... This may take a minute.
              </p>
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.matches.map((match) => (
                <TableRow key={match.emailId}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{match.from}</p>
                      <p className="text-base font-semibold">{match.subject}</p>
                      <p className="line-clamp-2 text-sm text-gray-600">
                        {decodeSnippet(match.snippet)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge color="green" className="text-center">
                      {match.rule}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </>
  );
}
