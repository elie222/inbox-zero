"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ControllerRenderProps } from "react-hook-form";
import { PencilLineIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { prefixPath } from "@/utils/path";
import { categoryConfig } from "@/utils/category-config";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDelayedActionsEnabled } from "@/hooks/useFeatureFlags";

// copy paste of old file
export function CategoriesSetup({
  defaultValues,
}: {
  defaultValues?: Partial<CreateRulesOnboardingBody>;
}) {
  const router = useRouter();
  const { emailAccountId } = useAccount();

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
      router.push(prefixPath(emailAccountId, "/onboarding?step=4"));
    },
    [emailAccountId, router],
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="text-sm font-medium mb-2">SUGGESTED FOR YOU</div>

        <div className="grid grid-cols-1 gap-2">
          {categoryConfig.slice(0, 4).map((category) => (
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

        <div className="text-sm font-medium mt-8 mb-2">BASIC LABELS</div>

        <div className="grid grid-cols-1 gap-2">
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

          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <PencilLineIcon className="h-5 w-5 text-purple-500" />
              <div className="flex flex-1 items-center gap-2">Custom</div>
              <div className="ml-auto flex items-center gap-4 text-muted-foreground text-sm">
                You can set your own custom categories later
              </div>
            </CardContent>
          </Card>
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
  const delayedActionsEnabled = useDelayedActionsEnabled();

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
                      Label + skip inbox
                    </SelectItem>
                    {delayedActionsEnabled && (
                      <SelectItem value="label_archive_delayed">
                        Label + archive after a week
                      </SelectItem>
                    )}
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
