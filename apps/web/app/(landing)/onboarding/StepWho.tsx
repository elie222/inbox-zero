"use client";

import { z } from "zod";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { saveOnboardingAnswersAction } from "@/utils/actions/user";
import { PageHeading, TypographyP } from "@/components/Typography";

const schema = z.object({
  role: z.string().min(1, "Please select your role."),
  about: z.string().max(2000).optional(),
});

export function StepWho() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { role: "", about: "" },
  });

  const roles = useMemo(
    () => [
      "Founder",
      "Executive",
      "Manager",
      "Engineer",
      "Designer",
      "Sales",
      "Marketing",
      "Realtor",
      "Other",
    ],
    [],
  );

  return (
    <div>
      <PageHeading>Let's understand how you use email</PageHeading>
      <TypographyP className="mt-2">
        Your role helps us design a smarter, clearer inbox with AI tailored just
        for you.
      </TypographyP>

      <Form {...form}>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit(async (values) => {
            const responses = { role: values.role, about: values.about ?? "" };
            await saveOnboardingAnswersAction({ answers: responses });
            startTransition(() => {
              router.push("/welcome-v2?step=2");
            });
          })}
        >
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your role</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="about"
            render={({ field }) => (
              <FormItem>
                <FormLabel>About you</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Tell us a little about your work…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
