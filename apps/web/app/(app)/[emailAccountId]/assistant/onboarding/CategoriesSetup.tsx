"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ControllerRenderProps } from "react-hook-form";
import {
  Mail,
  Newspaper,
  Megaphone,
  Calendar,
  Receipt,
  Bell,
  Users,
} from "lucide-react";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useDigestEnabled } from "@/hooks/useFeatureFlags";

const NEXT_URL = "/assistant/onboarding/draft-replies";

export function CategoriesSetup({
  emailAccountId,
  defaultValues,
}: {
  emailAccountId: string;
  defaultValues?: Partial<CreateRulesOnboardingBody>;
}) {
  const router = useRouter();

  const form = useForm<CreateRulesOnboardingBody>({
    resolver: zodResolver(createRulesOnboardingBody),
    defaultValues: {
      toReply: {
        action: defaultValues?.toReply?.action || "label",
        hasDigest: defaultValues?.toReply?.hasDigest || false,
      },
      newsletter: {
        action: defaultValues?.newsletter?.action || "label",
        hasDigest: defaultValues?.newsletter?.hasDigest || false,
      },
      marketing: {
        action: defaultValues?.marketing?.action || "label_archive",
        hasDigest: defaultValues?.marketing?.hasDigest || false,
      },
      calendar: {
        action: defaultValues?.calendar?.action || "label",
        hasDigest: defaultValues?.calendar?.hasDigest || false,
      },
      receipt: {
        action: defaultValues?.receipt?.action || "label",
        hasDigest: defaultValues?.receipt?.hasDigest || false,
      },
      notification: {
        action: defaultValues?.notification?.action || "label",
        hasDigest: defaultValues?.notification?.hasDigest || false,
      },
      coldEmail: {
        action: defaultValues?.coldEmail?.action || "label_archive",
        hasDigest: defaultValues?.coldEmail?.hasDigest || false,
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
          You can add custom categories and rules later.
        </TypographyP>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <CategoryCard
            id="toReply"
            label="To Reply"
            tooltipText="Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses"
            icon={<Mail className="h-5 w-5 text-blue-500" />}
            form={form}
          />
          <CategoryCard
            id="newsletter"
            label="Newsletter"
            tooltipText="Newsletters, blogs, and publications"
            icon={<Newspaper className="h-5 w-5 text-purple-500" />}
            form={form}
          />
          <CategoryCard
            id="marketing"
            label="Marketing"
            tooltipText="Promotional emails about sales and offers"
            icon={<Megaphone className="h-5 w-5 text-green-500" />}
            form={form}
          />
          <CategoryCard
            id="calendar"
            label="Calendar"
            tooltipText="Events, appointments, and reminders"
            icon={<Calendar className="h-5 w-5 text-yellow-500" />}
            form={form}
          />
          <CategoryCard
            id="receipt"
            label="Receipt"
            tooltipText="Invoices, receipts, and payments"
            icon={<Receipt className="h-5 w-5 text-orange-500" />}
            form={form}
          />
          <CategoryCard
            id="notification"
            label="Notification"
            tooltipText="Alerts, status updates, and system messages"
            icon={<Bell className="h-5 w-5 text-red-500" />}
            form={form}
          />
          <CategoryCard
            id="coldEmail"
            label="Cold Email"
            tooltipText="Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before"
            icon={<Users className="h-5 w-5 text-indigo-500" />}
            form={form}
          />
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
  const digestEnabled = useDigestEnabled();
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
          {digestEnabled && (
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
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value?.hasDigest}
                      onCheckedChange={(checked) => {
                        field.onChange({
                          ...field.value,
                          hasDigest: checked,
                        });
                      }}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal">Digest</FormLabel>
                </FormItem>
              )}
            />
          )}
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
