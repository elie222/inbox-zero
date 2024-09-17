"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { saveRulesPromptAction } from "@/utils/actions/ai-rule";
import { toastError, toastSuccess } from "@/components/Toast";
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
  SaveRulesPromptBody,
} from "@/utils/actions/validation";
import { ButtonLoader } from "@/components/Loading";
import { SectionHeader } from "@/components/Typography";
import { useCallback } from "react";

const examplePrompts = [
  "Archive all marketing emails",
  'Label and archive newsletters as "Newsletter"',
  'Label emails that require a reply as "Reply Required"',
  'Label urgent emails as "Urgent"',
  'Label receipts as "Receipt" and forward them to jane@accounting.com',
  'Label customer emails as "Customer"',
  'Label pitch decks as "Pitch Deck" and forward them to john@investing.com',
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  'Label high priority emails as "High Priority"',
  'Label legal documents as "Legal"',
  'Label server errors as "Error"',
  'Label Stripe emails as "Stripe"',
  "If a founder asks to set up a call, set them my Cal link: https://cal.com/max",
  "If someone asks to cancel a plan, ask to set up a call by sending my Cal link",
  'If a founder sends me an investor update, label it "Investor Update" and archive it',
  'If someone pitches me their startup, label it as "Investing", archive it, and respond with a friendly reply that I no longer have time to look at the email but if they get a warm intro into that\'s their best bet to get funding from me',
  "If someone asks for a discount, reply with the discount code INBOX20",
  "If someone asks for help with MakerPad, tell them I no longer work there, but they should reach out to the Zapier team for support",
  "Review any emails from questions@pr.com and see if any are about productivity. If so, respond with a friendly reply answering the question and mention I'm the CEO of Inbox Zero",
  'If people ask me to speak at an event, label the email "Speaker Opportunity" and archive it',
];

export function RulesPrompt() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    setValue,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
  });

  const onSubmit = async (data: SaveRulesPromptBody) => {
    const result = await saveRulesPromptAction(data);

    if (isActionError(result)) {
      toastError({
        title: "Error saving rules",
        description: result.error,
      });
    } else {
      toastSuccess({ description: "Rules saved successfully!" });
    }
  };

  const addExamplePrompt = useCallback((example: string) => {
    setValue(
      "rulesPrompt",
      `${getValues("rulesPrompt")}\n* ${example.trim()}`.trim(),
    );
  }, []);

  return (
    <Card className="grid grid-cols-1 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <CardHeader>
          <CardTitle>How to handle emails</CardTitle>
          <CardDescription>
            Write a prompt for your AI assistant to follow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 sm:col-span-2">
              <Input
                registerProps={register("rulesPrompt", { required: true })}
                name="rulesPrompt"
                type="text"
                as="textarea"
                rows={25}
                placeholder={`* Archive all marketing emails.
* Label and archive newsletters as "Newsletter".
* Label emails that require a reply as "Reply Required".
* Label urgent emails as "Urgent".
* Label receipts as "Receipt" and forward them to jane@accounting.com.
* Label customer emails as "Customer".
* Label pitch decks as "Pitch Deck" and forward them to john@investing.com.
* Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam.
* Label high priority emails as "High Priority".
* Label legal documents as "Legal".
* Label server errors as "Error".
* Label Stripe emails as "Stripe".
* If a founder asks to set up a call, set them my Cal link: https://cal.com/max
* If someone asks to cancel a plan, ask to set up a call by sending my Cal link.
* If a founder sends me an investor update, label it "Investor Update" and archive it.
* If someone pitches me their startup, label it as "Investing", archive it, and respond with a friendly reply that I don't have time to look at the email but if they get a warm intro into that's their best bet to get funding from me.
* If someone asks for a discount, reply with the discount code INBOX20.
* If someone asks for help with MakerPad, tell them I no longer work there, but they should reach out to the Zapier team for support.	
* Review any emails from questions@pr.com and see if any are about productivity. If so, respond with a friendly reply answering the question and mention I'm the CEO of Inbox Zero.
* If people ask me to speak at an event, label the email "Speaker Opportunity" and archive it.
            `}
                className="min-h-[300px]"
              />
              {errors.rulesPrompt && (
                <p className="text-sm text-red-500">
                  {errors.rulesPrompt.message}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <ButtonLoader />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </div>
      <div className="px-6 sm:mt-8 sm:p-0">
        <SectionHeader>Examples</SectionHeader>

        <ScrollArea className="mt-2 sm:h-[600px] sm:max-h-[600px]">
          <div className="grid grid-cols-1 gap-2 sm:pr-3">
            {examplePrompts.map((example, index) => (
              <Button
                key={index}
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
