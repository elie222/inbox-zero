"use client";

import { Suspense } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";

const emailAssistantSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
});

type EmailAssistantInputs = z.infer<typeof emailAssistantSchema>;

export function OnboardingAIEmailAssistant() {
  return (
    <div className="space-y-6">
      <EmailAssistantForm />

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </div>
  );
}

const defaultPrompt = `* Label newsletters as "Newsletter" and archive them.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my calendar link: https://cal.com/example`;

function EmailAssistantForm() {
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
    // TODO: Implement the submission logic here
    console.log(data);
    // You might want to call a server action here to process the prompt
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
        Save
      </Button>
    </form>
  );
}
