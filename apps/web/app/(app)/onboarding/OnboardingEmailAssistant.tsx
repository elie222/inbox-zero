"use client";

import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import type { SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { InferSafeActionFnResult } from "next-safe-action";
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
import { LoadingContent } from "@/components/LoadingContent";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Loading } from "@/components/Loading";
import { getRuleExamplesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import {
  rulesExamplesBody,
  type RulesExamplesBody,
} from "@/utils/actions/rule.validation";
import { examplePrompts } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { convertLabelsToDisplay } from "@/utils/mention";
import { useAccount } from "@/providers/EmailAccountProvider";

type RulesExamplesResponse = InferSafeActionFnResult<
  typeof getRuleExamplesAction
>["data"];

export function OnboardingAIEmailAssistant({ step }: { step: number }) {
  const [showNextButton, setShowNextButton] = useState(false);

  return (
    <div className="space-y-6">
      <EmailAssistantForm setShowNextButton={setShowNextButton} step={step} />
      {showNextButton && <OnboardingNextButton />}
    </div>
  );
}

const defaultPrompt = `* Label newsletters as "Newsletter" and archive them.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my calendar link: https://cal.com/example`;

function EmailAssistantForm({
  setShowNextButton,
  step,
}: {
  setShowNextButton: (show: boolean) => void;
  step: number;
}) {
  const { emailAccountId } = useAccount();
  const [data, setData] = useState<RulesExamplesResponse>();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RulesExamplesBody>({
    resolver: zodResolver(rulesExamplesBody),
    defaultValues: {
      rulesPrompt: defaultPrompt,
    },
  });

  const onSubmit: SubmitHandler<RulesExamplesBody> = async (data) => {
    const result = await getRuleExamplesAction(emailAccountId, data);

    setShowNextButton(true);

    if (result?.serverError) {
      toastError({
        title: "Error getting rule examples",
        description: result.serverError,
      });
      return;
    }
    if (result?.data) {
      setData(result.data);
    }
  };

  const addExamplePrompt = useCallback(
    (example: string) => {
      setValue(
        "rulesPrompt",
        `${getValues("rulesPrompt")}\n* ${example.trim()}`.trim(),
      );
    },
    [setValue, getValues],
  );

  const [showExamples, setShowExamples] = useState(false);

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="text"
          autosizeTextarea
          rows={5}
          name="rulesPrompt"
          placeholder={`This is where you tell the AI assistant how to handle your emails. For example:

${defaultPrompt}`}
          registerProps={register("rulesPrompt")}
          error={errors.rulesPrompt}
        />

        {showExamples && (
          <div className="grid gap-2 lg:grid-cols-2">
            {examplePrompts.slice(0, 10).map((example) => (
              <Button
                key={example}
                variant="outline"
                className="h-auto w-full justify-start text-wrap py-2 text-left"
                onClick={() => addExamplePrompt(example)}
              >
                {convertLabelsToDisplay(example)}
              </Button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={isSubmitting}>
            Test
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => setShowExamples(!showExamples)}
          >
            {showExamples ? "Hide" : "Examples"}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href={`/onboarding?step=${step + 1}`} scroll={false}>
              Skip
            </Link>
          </Button>
        </div>
      </form>

      <div className="mt-4">
        <EmailAssistantTestResults isLoading={isSubmitting} data={data} />
      </div>
    </div>
  );
}

function EmailAssistantTestResults({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data?: RulesExamplesResponse;
}) {
  if (!data && !isLoading) return null;

  return (
    <>
      <SectionDescription>
        Here is how the AI assistant would have handled some of your previous
        emails:
      </SectionDescription>

      <Card className="mt-4">
        <LoadingContent
          loading={isLoading}
          loadingComponent={
            <div className="flex flex-col items-center justify-center pb-8">
              <Loading />
              <p className="text-sm text-muted-foreground">
                Loading example matches... This may take a minute.
              </p>
            </div>
          }
        >
          {data?.matches?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rule</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.matches?.map((match) => (
                  <TableRow key={match.emailId}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{match.from}</p>
                        <p className="text-base font-semibold">
                          {match.subject}
                        </p>
                        <p className="line-clamp-2 text-sm text-slate-600">
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
          ) : (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No matches found 😔
            </p>
          )}
        </LoadingContent>
      </Card>
    </>
  );
}
