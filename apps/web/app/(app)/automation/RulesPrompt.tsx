"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { saveRulesPromptAction } from "@/utils/actions/ai-rule";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
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
import { ButtonLoader } from "@/components/Loading";
import { SectionHeader } from "@/components/Typography";
import type { RulesPromptResponse } from "@/app/api/user/rules/prompt/route";
import { LoadingContent } from "@/components/LoadingContent";

const examplePrompts = [
  'Label newsletters as "Newsletter" and archive them',
  'Label marketing emails as "Marketing" and archive them',
  'Label emails that require a reply as "Reply Required"',
  'Label urgent emails as "Urgent"',
  'Label receipts as "Receipt" and forward them to jane@accounting.com',
  'Label pitch decks as "Pitch Deck" and forward them to john@investing.com',
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  'Label high priority emails as "High Priority"',
  "If a founder asks to set up a call, send them my Cal link: https://cal.com/max",
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
  >(`/api/user/rules/prompt`);

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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    setValue,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt },
  });
  const router = useRouter();

  const onSubmit = async (data: SaveRulesPromptBody) => {
    toastInfo({
      title: "Saving...",
      description: "This may take a while to process...",
      duration: 20_000,
    });

    const result = await saveRulesPromptAction(data);

    if (isActionError(result)) {
      toastError({
        title: "Error saving rules",
        description: result.error,
      });
    } else {
      const { createdRules, editedRules, removedRules } = result || {};

      toastSuccess({
        description:
          `Rules saved successfully! ` +
          [
            createdRules ? `${createdRules} rules created. ` : "",
            editedRules ? `${editedRules} rules edited. ` : "",
            removedRules ? `${removedRules} rules removed. ` : "",
          ].join(""),
      });
    }

    mutate();

    router.push("/automation?tab=rules");
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

  return (
    <Card className="grid grid-cols-1 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <CardHeader>
          <CardTitle>
            How your AI personal assistant should handle your emails
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
                as="textarea"
                rows={25}
                error={errors.rulesPrompt}
                placeholder={`Here's an example of what your prompt might look like.
You can use the examples on the right or come up with your own.
Feel free to add as many as you want:

* Label and archive newsletters as "Newsletter".
* Archive all marketing emails.
* Label receipts as "Receipt" and forward them to jane@accounting.com.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my Cal link: https://cal.com/max
* Review any emails from questions@pr.com and see if any are about finance. If so, respond with a friendly draft a reply that answers the question.
            `}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <ButtonLoader />}
                  Save
                </Button>

                <Button type="button" variant="outline" asChild>
                  <Link href="/automation/create">Create Rules Manually</Link>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </div>
      <div className="px-6 sm:mt-8 sm:p-0">
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
