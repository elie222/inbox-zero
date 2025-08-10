"use client";

import { useTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { saveOnboardingAnswersAction } from "@/utils/actions/user";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(landing)/onboarding/IconCircle";
import { ArrowRightIcon, SendIcon } from "lucide-react";
import { USER_ROLES } from "@/app/(landing)/welcome/survey";
import { cn } from "@/utils";
import { ScrollableFadeContainer } from "@/components/ScrollableFadeContainer";
import {
  stepWhoBody,
  type StepWhoBody,
} from "@/utils/actions/onboarding.validation";

interface StepWhoProps {
  initialRole?: string | null;
}

export function StepWho({ initialRole }: StepWhoProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [customRole, setCustomRole] = useState("");

  // Check if the initial role is not in our list (custom role)
  const isCustomRole =
    initialRole && !USER_ROLES.some((role) => role.value === initialRole);
  const defaultRole = isCustomRole ? "Other" : initialRole || "";

  const form = useForm<StepWhoBody>({
    // @ts-expect-error - Type compatibility issue with zodResolver
    resolver: zodResolver(stepWhoBody),
    defaultValues: { role: defaultRole },
  });
  const { watch, setValue } = form;
  const watchedRole = watch("role");

  // Initialize custom role if it's a custom value
  useEffect(() => {
    if (isCustomRole && initialRole) {
      setCustomRole(initialRole);
    }
  }, [isCustomRole, initialRole]);

  // Scroll to selected role on mount
  useEffect(() => {
    if (defaultRole && scrollContainerRef.current) {
      // Find the button with the selected role
      const selectedIndex = USER_ROLES.findIndex(
        (role) => role.value === defaultRole,
      );
      if (selectedIndex !== -1) {
        const buttons = scrollContainerRef.current.querySelectorAll(
          'button[type="button"]',
        );
        const selectedButton = buttons[selectedIndex];
        if (selectedButton) {
          // Use setTimeout to ensure the DOM is ready
          setTimeout(() => {
            selectedButton.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 100);
        }
      }
    }
  }, [defaultRole]);

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
            // Use custom role if "Other" is selected
            const roleToSave =
              values.role === "Other" ? customRole : values.role;

            await saveOnboardingAnswersAction({
              answers: { role: roleToSave },
            });

            startTransition(() => {
              router.push("/onboarding?step=3");
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
            ref={scrollContainerRef}
            className="grid gap-2 px-1 pt-6 pb-6"
            fadeFromClass="from-slate-50"
          >
            {USER_ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <button
                  type="button"
                  key={role.value}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all",
                    watchedRole === role.value &&
                      "border-blue-600 ring-2 ring-blue-100",
                  )}
                  onClick={() => {
                    setValue("role", role.value);
                    if (role.value !== "Other") {
                      setCustomRole("");
                    }
                  }}
                >
                  <IconCircle size="sm">
                    <Icon className="size-4" />
                  </IconCircle>

                  <div>
                    <div className="font-medium">{role.value}</div>
                    <div className="text-sm text-muted-foreground">
                      {role.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </ScrollableFadeContainer>

          {watchedRole === "Other" && (
            <div className="px-1 pb-6">
              <Input
                name="customRole"
                type="text"
                placeholder="Enter your role..."
                registerProps={{
                  value: customRole,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setCustomRole(e.target.value),
                  autoFocus: true,
                }}
                className="w-full border-slate-300 focus:border-blue-600 focus:ring-blue-600 transition-all py-3 px-4 text-lg"
              />
            </div>
          )}

          <div className="flex justify-center">
            <Button
              type="submit"
              disabled={
                isPending || (watchedRole === "Other" && !customRole.trim())
              }
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
