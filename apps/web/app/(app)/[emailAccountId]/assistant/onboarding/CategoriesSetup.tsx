"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ControllerRenderProps } from "react-hook-form";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRulesOnboardingAction } from "@/utils/actions/rule";
import {
  createRulesOnboardingBody,
  type CreateRulesOnboardingBody,
} from "@/utils/actions/rule.validation";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import Image from "next/image";
import {
  ExampleDialog,
  SeeExampleDialogButton,
} from "@/app/(app)/[emailAccountId]/assistant/onboarding/ExampleDialog";
import { categoryConfig } from "@/utils/category-config";
import { useAccount } from "@/providers/EmailAccountProvider";

const NEXT_URL = "/assistant/onboarding/draft-replies";

export function CategoriesSetup({
  defaultValues,
}: {
  defaultValues?: Partial<CreateRulesOnboardingBody>;
}) {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  const [showExampleDialog, setShowExampleDialog] = useState(false);

  const form = useForm<CreateRulesOnboardingBody>({
    resolver: zodResolver(createRulesOnboardingBody),
    defaultValues: {
      toReply: {
        action: defaultValues?.toReply?.action || "label",
      },
      newsletter: {
        action: defaultValues?.newsletter?.action || "label",
      },
      marketing: {
        action: defaultValues?.marketing?.action || "label_archive",
      },
      calendar: {
        action: defaultValues?.calendar?.action || "label",
      },
      receipt: {
        action: defaultValues?.receipt?.action || "label",
      },
      notification: {
        action: defaultValues?.notification?.action || "label",
      },
      coldEmail: {
        action: defaultValues?.coldEmail?.action || "label_archive",
      },
    },
  });

  const onSubmit = useCallback(
    async (data: CreateRulesOnboardingBody) => {
      // runs in background so we can move on to next step faster
      createRulesOnboardingAction(emailAccountId, data);
      router.push(prefixPath(emailAccountId, NEXT_URL));
    },
    [emailAccountId, router],
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <TypographyH3 className="mt-2">
          How do you want your emails organized?
        </TypographyH3>

        <TypographyP className="mt-2">
          We'll automatically categorize your emails to help you focus on what
          matters.
          <br />
          You can add custom categories and rules later.{" "}
          <SeeExampleDialogButton onClick={() => setShowExampleDialog(true)} />
        </TypographyP>

        <ExampleDialog
          open={showExampleDialog}
          onOpenChange={setShowExampleDialog}
          title="Organize your emails"
          description="This is an example of what your inbox will look like. You can add more labels later."
          image={
            <Image
              src="/images/assistant/labels.png"
              alt="Categorize your emails"
              width={1200}
              height={800}
              className="mx-auto rounded border-4 border-blue-50 shadow-sm"
            />
          }
        />

        <div className="mt-4 grid grid-cols-1 gap-4">
          {categoryConfig.map((category) => (
            <CategoryCard
              key={category.key}
              id={category.key}
              label={category.label}
              tooltipText={category.tooltipText}
              icon={category.icon}
              form={form}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button type="submit" className="w-full" size="lg">
            Next
          </Button>

          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={() => {
              markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
              router.push(prefixPath(emailAccountId, "/automation"));
            }}
          >
            Skip
          </Button>
        </div>
      </form>
    </Form>
  );
}

function CategoryCard({
  id,
  label,
  icon,
  form,
  tooltipText,
}: {
  id: keyof CreateRulesOnboardingBody;
  label: string;
  icon: React.ReactNode;
  form: ReturnType<typeof useForm<CreateRulesOnboardingBody>>;
  tooltipText?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {icon}
        <div className="flex flex-1 items-center gap-2">
          {label}
          {tooltipText && (
            <TooltipExplanation
              text={tooltipText}
              className="text-muted-foreground"
            />
          )}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <FormField
            control={form.control}
            name={id}
            render={({
              field,
            }: {
              field: ControllerRenderProps<
                CreateRulesOnboardingBody,
                keyof CreateRulesOnboardingBody
              >;
            }) => (
              <FormItem>
                <Select
                  onValueChange={(value) => {
                    field.onChange({
                      ...(field.value ?? {}),
                      action: value,
                    });
                  }}
                  defaultValue={field.value.action}
                >
                  <FormControl>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="label">Label</SelectItem>
                    <SelectItem value="label_archive">
                      Label + Skip Inbox
                    </SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
