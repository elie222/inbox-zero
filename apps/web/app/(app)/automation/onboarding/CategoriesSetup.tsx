"use client";

import { useCallback } from "react";
import Link from "next/link";
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
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRulesOnboardingAction } from "@/utils/actions/rule";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";
import {
  createRulesOnboardingBody,
  type CreateRulesOnboardingBody,
} from "@/utils/actions/rule.validation";

const NEXT_URL = "/automation/onboarding/draft-replies";

export function CategoriesSetup() {
  const router = useRouter();

  const form = useForm<CreateRulesOnboardingBody>({
    resolver: zodResolver(createRulesOnboardingBody),
    defaultValues: {
      toReply: "label",
      newsletters: "label",
      marketing: "label_archive",
      calendar: "label",
      receipts: "label",
      notifications: "label",
      coldEmails: "label_archive",
    },
  });

  const onSubmit = useCallback(
    async (data: CreateRulesOnboardingBody) => {
      // runs in background so we can move on to next step faster
      createRulesOnboardingAction(data);
      router.push(NEXT_URL);
    },
    [router],
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <TypographyH3 className="mt-2">Set up your assistant</TypographyH3>

        <TypographyP className="mt-2">
          Choose how you want your emails organized.
          <br />
          You can add custom categories and rules later.
        </TypographyP>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <CategoryCard
            label="To Reply"
            id="toReply"
            icon={<Mail className="h-5 w-5 text-blue-500" />}
            form={form}
          />
          <CategoryCard
            label="Newsletters"
            id="newsletters"
            icon={<Newspaper className="h-5 w-5 text-purple-500" />}
            form={form}
          />
          <CategoryCard
            label="Marketing"
            id="marketing"
            icon={<Megaphone className="h-5 w-5 text-green-500" />}
            form={form}
          />
          <CategoryCard
            label="Calendar"
            id="calendar"
            icon={<Calendar className="h-5 w-5 text-yellow-500" />}
            form={form}
          />
          <CategoryCard
            label="Receipts"
            id="receipts"
            icon={<Receipt className="h-5 w-5 text-orange-500" />}
            form={form}
          />
          <CategoryCard
            label="Notifications"
            id="notifications"
            icon={<Bell className="h-5 w-5 text-red-500" />}
            form={form}
          />
          <CategoryCard
            label="Cold Emails"
            id="coldEmails"
            icon={<Users className="h-5 w-5 text-indigo-500" />}
            form={form}
          />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button type="submit" className="w-full" size="lg">
            Next
          </Button>

          <Button className="w-full" size="lg" variant="outline" asChild>
            <Link href={NEXT_URL}>Skip</Link>
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
}: {
  id: keyof CreateRulesOnboardingBody;
  label: string;
  icon: React.ReactNode;
  form: ReturnType<typeof useForm<CreateRulesOnboardingBody>>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {icon}
        <div className="flex-1">{label}</div>
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
                  onValueChange={field.onChange}
                  defaultValue={field.value}
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
