"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowRightIcon, SendIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/Input";
import { saveOnboardingAnswersAction } from "@/utils/actions/onboarding";
import { MutedText, PageHeading, TypographyP } from "@/components/Typography";
import { usersRolesInfo } from "@/app/(app)/[emailAccountId]/new-onboarding/config";
import { USER_ROLES } from "@/utils/constants/user-roles";
import { cn } from "@/utils";
import { ScrollableFadeContainer } from "@/components/ScrollableFadeContainer";
import {
  stepWhoSchema,
  type StepWhoSchema,
} from "@/utils/actions/onboarding.validation";
import { IconCircle } from "@/app/(app)/[emailAccountId]/new-onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/new-onboarding/OnboardingWrapper";
import { updateEmailAccountRoleAction } from "@/utils/actions/email-account";
import { Button } from "@/components/ui/button";

export function StepWho({
  initialRole,
  emailAccountId,
  onNext,
}: {
  initialRole?: string | null;
  emailAccountId: string;
  onNext: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [customRole, setCustomRole] = useState("");

  // Check if the initial role is not in our list (custom role)
  const isCustomRole =
    initialRole && !USER_ROLES.some((role) => role.value === initialRole);
  const defaultRole = isCustomRole ? "Other" : initialRole || "";

  const form = useForm<StepWhoSchema>({
    resolver: zodResolver(stepWhoSchema),
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
    <OnboardingWrapper>
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
          onSubmit={form.handleSubmit((values) => {
            const roleToSave =
              values.role === "Other" ? customRole : values.role;

            // Optimistic UI: navigate immediately, save in background
            onNext();

            // Fire and forget - save role data in background
            Promise.all([
              updateEmailAccountRoleAction(emailAccountId, {
                role: roleToSave,
              }),
              saveOnboardingAnswersAction({
                answers: { role: roleToSave },
              }),
            ]).catch((error) => {
              console.error("Failed to save role:", error);
            });
          })}
        >
          <ScrollableFadeContainer
            ref={scrollContainerRef}
            className="grid gap-2 px-1 pt-6 pb-6"
            fadeFromClass="from-slate-50"
          >
            {Object.entries(usersRolesInfo).map(([roleName, role]) => {
              const Icon = role.icon;
              const description = USER_ROLES.find(
                (r) => r.value === roleName,
              )?.description;

              return (
                <button
                  type="button"
                  key={roleName}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all",
                    watchedRole === roleName &&
                      "border-blue-600 ring-2 ring-blue-100",
                  )}
                  onClick={() => {
                    setValue("role", roleName);
                    if (roleName !== "Other") {
                      setCustomRole("");
                    }
                  }}
                >
                  <IconCircle size="sm">
                    <Icon className="size-4" />
                  </IconCircle>

                  <div>
                    <div className="font-medium">{roleName}</div>
                    <MutedText>{description}</MutedText>
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
              size="sm"
              disabled={
                !watchedRole || (watchedRole === "Other" && !customRole.trim())
              }
            >
              Continue
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </OnboardingWrapper>
  );
}
