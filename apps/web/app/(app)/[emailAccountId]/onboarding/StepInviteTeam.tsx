"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  inviteMembersAction,
  createOrganizationAndInviteAction,
} from "@/utils/actions/organization";
import { isValidEmail } from "@/utils/email";

type InviteFormValues = {
  emails: { email: string }[];
};

export function StepInviteTeam({
  emailAccountId,
  organizationId,
  userName,
  onNext,
  onSkip,
}: {
  emailAccountId: string;
  organizationId?: string;
  userName?: string | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const posthog = usePostHog();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    defaultValues: {
      emails: [{ email: "" }, { email: "" }, { email: "" }],
    },
  });

  const { fields } = useFieldArray({ name: "emails", control });

  const filledEmailCount = watch("emails").filter(
    (e) => e.email.trim().length > 0,
  ).length;

  const onSubmit = handleSubmit(async (data) => {
    const emails = data.emails
      .map((e) => e.email.trim().toLowerCase())
      .filter(Boolean);

    if (emails.length === 0) return;

    let successCount = 0;
    let errorCount = 0;

    if (organizationId) {
      const result = await inviteMembersAction({
        organizationId,
        invitations: emails.map((email) => ({ email, role: "member" })),
      });

      if (result?.serverError || result?.validationErrors) {
        toastError({ description: "Failed to send invitations" });
        return;
      }

      if (!result?.data) return;

      successCount = result.data.results.filter((r) => r.success).length;
      errorCount = result.data.results.filter((r) => !r.success).length;
    } else {
      const result = await createOrganizationAndInviteAction(emailAccountId, {
        emails,
        userName,
      });

      if (result?.serverError || result?.validationErrors) {
        toastError({
          description: "Failed to create organization and send invitations",
        });
        return;
      }

      if (!result?.data) return;

      successCount = result.data.results.filter((r) => r.success).length;
      errorCount = result.data.results.filter((r) => !r.success).length;
    }

    if (successCount > 0) {
      toastSuccess({
        description: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully!`,
      });
    }
    if (errorCount > 0) {
      toastError({
        description: `Failed to send ${errorCount} invitation${errorCount > 1 ? "s" : ""}`,
      });
    }

    if (successCount > 0) {
      posthog.capture("onboarding_invite_team_submitted", {
        variant: "onboarding",
        inviteCount: emails.length,
        successfulInvites: successCount,
        failedInvites: errorCount,
        hasExistingOrganization: Boolean(organizationId),
      });
    }

    onNext();
  });

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle size="lg" className="mx-auto">
        <UsersIcon className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>Invite your team</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          Add more anytime from settings.
        </TypographyP>

        <form onSubmit={onSubmit}>
          <div className="mt-6 max-w-md mx-auto space-y-2 text-left">
            {fields.map((field, i) => (
              <Input
                key={field.id}
                type="email"
                name={`emails.${i}.email`}
                registerProps={register(`emails.${i}.email`, {
                  validate: (v) =>
                    !v || isValidEmail(v) || "Enter a valid email",
                })}
                placeholder="name@company.com"
                error={errors.emails?.[i]?.email}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 w-full max-w-xs mx-auto mt-6">
            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              disabled={filledEmailCount === 0}
            >
              Send invites
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                posthog.capture("onboarding_invite_team_skipped", {
                  variant: "onboarding",
                  inviteCount: filledEmailCount,
                  hasExistingOrganization: Boolean(organizationId),
                });
                onSkip();
              }}
              disabled={isSubmitting}
            >
              Skip
            </Button>
          </div>
        </form>
      </div>
    </OnboardingWrapper>
  );
}
