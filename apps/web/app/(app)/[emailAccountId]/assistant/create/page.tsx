"use client";

import { useCallback } from "react";
import Link from "next/link";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AlertBasic } from "@/components/Alert";
import { Input } from "@/components/Input";
import {
  PageHeading,
  SectionDescription,
  TypographyH3,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { createAutomationAction } from "@/utils/actions/ai-rule";
import { toastError } from "@/components/Toast";
import { examples } from "@/app/(app)/[emailAccountId]/assistant/create/examples";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { CreateAutomationBody } from "@/utils/actions/ai-rule.validation";
import { prefixPath } from "@/utils/path";

// not in use anymore
export default function AutomationSettingsPage() {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<CreateAutomationBody>();

  const onSubmit: SubmitHandler<CreateAutomationBody> = useCallback(
    async (data) => {
      if (data.prompt) {
        const result = await createAutomationAction(emailAccountId, {
          prompt: data.prompt,
        });

        if (result?.serverError) {
          toastError({
            description: `There was an error creating the rule. ${result.serverError || ""}`,
          });
        } else if (!result) {
          toastError({
            description: "There was an error creating the rule.",
          });
        } else {
          router.push(
            prefixPath(
              emailAccountId,
              `/assistant/rule/${result.data?.id}?new=true`,
            ),
          );
        }
      }
    },
    [emailAccountId, router],
  );

  const prompt = watch("prompt");

  return (
    <div className="mb-16 mt-6 md:mt-10">
      <PageHeading className="text-center">
        Add a new rule to your AI Personal Assistant
      </PageHeading>
      <SectionDescription className="mx-auto max-w-prose text-center">
        The easiest way to create rules is using the prompt screen, but if you
        prefer, you can use this screen to add rules manually.
      </SectionDescription>

      <div className="mx-auto mt-6 max-w-xl px-4 md:mt-10">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {typeof prompt === "string" ? (
            <>
              <TypographyH3>
                Instruct the AI how to process an incoming email
              </TypographyH3>

              <Input
                type="text"
                autosizeTextarea
                rows={3}
                name="prompt"
                placeholder={"e.g. Forward receipts to alice@accountant.com."}
                className="mt-2"
                registerProps={register("prompt")}
                error={errors.prompt}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setValue("prompt", "");
                  }}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  <span className="sr-only">Back</span>
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !prompt || prompt.length < 5}
                  loading={isSubmitting}
                >
                  Preview Automation
                </Button>
              </div>
            </>
          ) : (
            <>
              <TypographyH3>Start from an example</TypographyH3>

              <div className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
                {examples.map((example, i) => {
                  return (
                    <Link
                      key={example.title}
                      className="block w-full text-left"
                      href={prefixPath(
                        emailAccountId,
                        `/assistant/rule/create?example=${i}`,
                      )}
                    >
                      <AlertBasic
                        title={example.title}
                        description={example.description}
                        icon={example.icon}
                        className="cursor-pointer hover:bg-muted"
                      />
                    </Link>
                  );
                })}
              </div>

              <TypographyH3 className="pt-8">
                Or set up a rule yourself
              </TypographyH3>
              <div className="flex space-x-2 pb-8">
                <Button variant="outline" asChild>
                  <Link
                    href={prefixPath(emailAccountId, "/assistant/rule/create")}
                  >
                    Create rule
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setValue("prompt", "");
                  }}
                >
                  Generate rule with AI
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
