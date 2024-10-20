"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
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
import { saveRulesPromptAction } from "@/utils/actions/ai-rule";
import { isActionError } from "@/utils/error";
import { handleActionCall } from "@/utils/server-action";
import { toastError } from "@/components/Toast";
import { RulesExamplesResponse } from "@/app/api/user/rules/examples/route";
import { LoadingContent } from "@/components/LoadingContent";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
import { Badge } from "@/components/ui/badge";
import { decodeSnippet } from "@/utils/gmail/decode";

const emailAssistantSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
});

type EmailAssistantInputs = z.infer<typeof emailAssistantSchema>;

export function OnboardingAIEmailAssistant() {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="space-y-6">
      <EmailAssistantForm setPrompt={setPrompt} />

      <EmailAssistantTestResults prompt={prompt} />

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </div>
  );
}

const defaultPrompt = `* Label newsletters as "Newsletter" and archive them.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my calendar link: https://cal.com/example`;

function EmailAssistantForm({
  setPrompt,
}: {
  setPrompt: (prompt: string) => void;
}) {
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

    const result = await handleActionCall("saveRulesPromptAction", () =>
      saveRulesPromptAction({ rulesPrompt: data.prompt }),
    );

    if (isActionError(result)) {
      toastError({
        title: "Error saving rules",
        description: result.error,
      });
      return;
    }
  };

  return (
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
      <Button type="submit" loading={isSubmitting}>
        Test
      </Button>
    </form>
  );
}

function EmailAssistantTestResults({ prompt }: { prompt: string }) {
  const { data, isLoading, error } = useSWR<RulesExamplesResponse>(
    prompt
      ? `/api/user/rules/examples?rulesPrompt=${encodeURIComponent(prompt)}`
      : null,
  );

  if (!prompt) return null;

  return (
    <div>
      <SectionDescription>
        Here is how the AI assistant would have handled some of your previous
        emails:
      </SectionDescription>

      <Card className="mt-4">
        <LoadingContent loading={isLoading} error={error}>
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
                    <Badge variant="green" className="text-center">
                      {match.rule}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </div>
  );
}
