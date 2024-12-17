"use client";

import { useCallback, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  saveRulesPromptAction,
  generateRulesPromptAction,
} from "@/utils/actions/ai-rule";
import { isActionError } from "@/utils/error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/Input";
import {
  saveRulesPromptBody,
  type SaveRulesPromptBody,
} from "@/utils/actions/validation";
import { SectionHeader } from "@/components/Typography";
import type { RulesPromptResponse } from "@/app/api/user/rules/prompt/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { handleActionCall } from "@/utils/server-action";

export const examplePrompts = [
  'Label newsletters as "Newsletter" and archive them',
  'Label marketing emails as "Marketing" and archive them',
  'Label emails that require a reply as "Reply Required"',
  'Label urgent emails as "Urgent"',
  'Label receipts as "Receipt" and forward them to jane@accounting.com',
  'Label pitch decks as "Pitch Deck" and forward them to john@investing.com',
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  'Label high priority emails as "High Priority"',
  "If a founder asks to set up a call, send them my Cal link: https://cal.com/example",
  "If someone asks to cancel a plan, ask to set up a call by sending my Cal link",
  'If a founder sends me an investor update, label it "Investor Update" and archive it',
  'If someone pitches me their startup, label it as "Investing", archive it, and respond with a friendly reply that I no longer have time to look at the email but if they get a warm intro, that\'s their best bet to get funding from me',
  "If someone asks for a discount, reply with the discount code INBOX20",
  "If someone asks for help with MakerPad, tell them I no longer work there, but they should reach out to the Zapier team for support",
  "Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question",
  'If people ask me to speak at an event, label the email "Speaker Opportunity" and archive it',
  'Label customer emails as "Customer"',
  'Label legal documents as "Legal"',
  'Label server errors as "Error"',
  'Label Stripe emails as "Stripe"',
];

export function RulesPrompt() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesPromptResponse,
    { error: string }
  >("/api/user/rules/prompt");

  return (
    <LoadingContent loading={isLoading} error={error}>
      <RulesPromptForm
        rulesPrompt={data?.rulesPrompt || undefined}
        mutate={mutate}
      />
    </LoadingContent>
  );
}

function RulesPromptForm({
  rulesPrompt,
  mutate,
}: {
  rulesPrompt?: string;
  mutate: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt },
  });
  const router = useRouter();

  const onSubmit = useCallback(
    async (data: SaveRulesPromptBody) => {
      setIsSubmitting(true);

      const saveRulesPromise = async (data: SaveRulesPromptBody) => {
        setIsSubmitting(true);
        const result = await handleActionCall("saveRulesPromptAction", () =>
          saveRulesPromptAction(data),
        );

        if (isActionError(result)) {
          setIsSubmitting(false);
          throw new Error(result.error);
        }

        router.push("/automation?tab=rules");
        mutate();
        setIsSubmitting(false);

        return result;
      };

      toast.promise(() => saveRulesPromise(data), {
        loading: "Saving rules... This may take a while to process...",
        success: (result) => {
          const { createdRules, editedRules, removedRules } = result || {};

          const message = [
            createdRules ? `${createdRules} rules created.` : "",
            editedRules ? `${editedRules} rules edited.` : "",
            removedRules ? `${removedRules} rules removed.` : "",
          ]
            .filter(Boolean)
            .join(" ");

          return `Rules saved successfully! ${message}`;
        },
        error: (err) => {
          return `Error saving rules: ${err.message}`;
        },
      });
    },
    [router, mutate],
  );

  const addExamplePrompt = useCallback(
    (example: string) => {
      setValue(
        "rulesPrompt",
        `${getValues("rulesPrompt")}\n* ${example.trim()}`.trim(),
      );
    },
    [setValue, getValues],
  );

  return (
    <Card className="grid grid-cols-1 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <CardHeader>
          <CardTitle>
            How your AI personal assistant should handle incoming emails
          </CardTitle>
          <CardDescription>
            Write a prompt for your assistant to follow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 sm:col-span-2">
              <Input
                className="min-h-[300px]"
                registerProps={register("rulesPrompt", { required: true })}
                name="rulesPrompt"
                type="text"
                autosizeTextarea
                rows={25}
                maxRows={50}
                error={errors.rulesPrompt}
                placeholder={`Here's an example of what your prompt might look like.
You can use the examples on the right or come up with your own.
Feel free to add as many as you want:

* Label and archive newsletters as "Newsletter".
* Archive all marketing emails.
* Label receipts as "Receipt" and forward them to jane@accounting.com.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my Cal link: https://cal.com/example
* Review any emails from questions@pr.com and see if any are about finance. If so, respond with a friendly draft a reply that answers the question.`}
              />

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isSubmitting || isGenerating}
                  loading={isSubmitting}
                >
                  Save
                </Button>

                <Tooltip content="Our AI will analyze your Gmail inbox and create a customized prompt for your assistant.">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isGenerating}
                    onClick={async () => {
                      if (isSubmitting || isGenerating) return;
                      toast.promise(
                        async () => {
                          setIsGenerating(true);
                          const result = await handleActionCall(
                            "generateRulesPromptAction",
                            generateRulesPromptAction,
                          );

                          if (isActionError(result)) {
                            setIsGenerating(false);
                            throw new Error(result.error);
                          }

                          const currentPrompt = getValues("rulesPrompt");
                          const updatedPrompt = currentPrompt
                            ? `${currentPrompt}\n\n${result.rulesPrompt}`
                            : result.rulesPrompt;
                          setValue("rulesPrompt", updatedPrompt.trim());

                          setIsGenerating(false);

                          return result;
                        },
                        {
                          loading: "Generating prompt...",
                          success: (result) => {
                            return "Prompt generated successfully!";
                          },
                          error: (err) => {
                            return `Error generating prompt: ${err.message}`;
                          },
                        },
                      );
                    }}
                    loading={isGenerating}
                  >
                    <SparklesIcon className="mr-2 size-4" />
                    Give me ideas
                  </Button>
                </Tooltip>
              </div>
            </div>
          </form>
        </CardContent>
      </div>
      <div className="px-6 pb-4 sm:mt-8 sm:p-0">
        <SectionHeader>Examples</SectionHeader>

        <ScrollArea className="mt-2 sm:h-[600px] sm:max-h-[600px]">
          <div className="grid grid-cols-1 gap-2 sm:pr-3">
            {examplePrompts.map((example) => (
              <Button
                key={example}
                variant="outline"
                onClick={() => addExamplePrompt(example)}
                className="h-auto w-full justify-start text-wrap py-2 text-left"
              >
                {example}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
