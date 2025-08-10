"use client";

import { z } from "zod";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { saveOnboardingAnswersAction } from "@/utils/actions/user";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(landing)/onboarding/IconCircle";
import { ArrowRightIcon, CircleUserRoundIcon, SendIcon } from "lucide-react";
import { survey } from "@/app/(landing)/welcome/survey";
import { cn } from "@/utils";
import { ScrollableFadeContainer } from "@/components/ScrollableFadeContainer";

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
  const { watch } = form;

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
      <div className="flex justify-center">
        <IconCircle size="lg">
          <SendIcon className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">
          Let's understand how you use email
        </PageHeading>
        <TypographyP className="mt-2">
          Your role helps us design a smarter, clearer inbox with AI tailored
          just for you.
        </TypographyP>
      </div>

      <Form {...form}>
        <form
          className="space-y-6 mt-4"
          onSubmit={form.handleSubmit(async (values) => {
            const responses = { role: values.role, about: values.about ?? "" };
            await saveOnboardingAnswersAction({ answers: responses });
            startTransition(() => {
              router.push("/welcome-v2?step=2");
            });
          })}
        >
          {/* <FormField
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
          /> */}

          {/* <ButtonList
            items={
              survey.questions[1].choices?.map((choice) => ({
                id: choice,
                name: choice,
              })) || []
            }
            onSelect={(id) => {
              form.setValue("role", id);
            }}
            // onSelect={(id) => {
            //   onSelect(id);
            //   setIsOpen(false);
            // }}
            emptyMessage=""
            columns={2}
                    /> */}

          <ScrollableFadeContainer
            className="grid gap-2 px-1 pt-6 pb-6"
            fadeFromClass="from-slate-50"
          >
            {(
              survey.questions[1].choices?.map((choice) => ({
                id: choice,
                name: choice,
              })) || []
            ).map((item) => (
              <button
                type="button"
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all",
                  watch("role") === item.id &&
                    "border-blue-600 ring-2 ring-blue-100",
                )}
                onClick={() => {
                  form.setValue("role", item.id);
                }}
              >
                <IconCircle size="sm">
                  <CircleUserRoundIcon className="size-4" />
                </IconCircle>

                <div>
                  <div className="font-medium">{item.name}</div>
                  {/* <div className="text-sm text-muted-foreground">
                    {"item.description"}
                  </div> */}
                </div>
              </button>
            ))}
          </ScrollableFadeContainer>

          <div className="flex justify-center">
            <Button
              type="submit"
              disabled={isPending}
              variant="primaryBlue"
              size="sm"
            >
              {isPending ? "Saving…" : "Continue"}
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
