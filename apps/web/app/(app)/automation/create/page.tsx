"use client";

import { useCallback } from "react";
import Link from "next/link";
import { SubmitHandler, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import {
  ForwardIcon,
  ShieldAlertIcon,
  MailQuestionIcon,
  NewspaperIcon,
  ArrowLeftIcon,
  PenLineIcon,
} from "lucide-react";
import { AlertBasic } from "@/components/Alert";
import { Input } from "@/components/Input";
import {
  PageHeading,
  SectionDescription,
  TypographyH3,
} from "@/components/Typography";
import { Button, ButtonLoader } from "@/components/ui/button";
import { createAutomationAction } from "@/utils/actions/ai-rule";
import { captureException } from "@/utils/error";
import { toastError, toastInfo } from "@/components/Toast";

const examples = [
  {
    title: "Forward receipts",
    description: "Forward receipts to alice@accountant.com.",
    icon: <ForwardIcon className="h-4 w-4" />,
  },
  {
    title: "Archive and label newsletters",
    description: `Archive newsletters and label them as "Newsletter".`,
    icon: <NewspaperIcon className="h-4 w-4" />,
  },
  {
    title: "Label high priority emails",
    description: `Mark high priority emails as "High Priority". Examples include:
* Customer wants to cancel their plan
* Customer wants to purchase
* Customer complaint`,
    icon: <ShieldAlertIcon className="h-4 w-4" />,
  },
  {
    title: "Respond to question",
    description: `If someone asks how much the premium plan is, respond: "Our premium plan is $10 per month."`,
    icon: <MailQuestionIcon className="h-4 w-4" />,
  },
  {
    title: "Custom rule",
    description: "",
    icon: <PenLineIcon className="h-4 w-4" />,
  },
];

type Inputs = { prompt?: string };

export default function AutomationSettingsPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = useCallback(async (data) => {
    if (data.prompt) {
      try {
        const rule = await createAutomationAction(data.prompt);
        if (rule.existingRuleId) {
          toastInfo({
            title: "Rule for group already exists",
            description: "Edit the existing rule to create your automation.",
          });
          router.push(`/automation/rule/${rule.existingRuleId}`);
        } else {
          router.push(`/automation/rule/${rule.id}/examples`);
        }
      } catch (error) {
        console.error(error);
        captureException(error, {
          extra: {
            page: "automation/settings",
            action: "create automation",
            prompt: data.prompt,
          },
        });
        toastError({
          description:
            "There was an error creating your automation. " +
            (error as Error)?.message,
        });
      }
    }
  }, []);

  const prompt = watch("prompt");

  return (
    <div>
      <PageHeading className="mt-10 text-center">
        Get started with AI Automation
      </PageHeading>
      <SectionDescription className="text-center">
        Automate your email with AI.
      </SectionDescription>

      <div className="mx-auto mt-16 max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {typeof prompt === "string" ? (
            <>
              <TypographyH3>
                Instruct the AI how to process an incoming email
              </TypographyH3>

              <Input
                type="text"
                as="textarea"
                rows={4}
                name="prompt"
                placeholder={`eg. Forward receipts to alice@accountant.com.`}
                className="mt-2 min-w-[500px]"
                registerProps={register("prompt")}
                error={errors.prompt}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setValue("prompt", undefined);
                  }}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  <span className="sr-only">Back</span>
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !prompt || prompt.length < 5}
                >
                  {isSubmitting && <ButtonLoader />}
                  Preview Automation
                </Button>
              </div>
            </>
          ) : (
            <>
              <TypographyH3>Start from an example</TypographyH3>

              <div className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
                {examples.map((example) => {
                  return (
                    <button
                      key={example.title}
                      className="w-full text-left"
                      onClick={() => {
                        setValue("prompt", example.description);
                      }}
                    >
                      <AlertBasic
                        title={example.title}
                        description={example.description}
                        icon={example.icon}
                        className="cursor-pointer hover:bg-gray-100"
                      />
                    </button>
                  );
                })}
              </div>

              <TypographyH3 className="pt-8">
                Or set up a rule yourself
              </TypographyH3>
              <Button variant="outline" asChild>
                <Link href="/automation/rule/create">Create rule</Link>
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
