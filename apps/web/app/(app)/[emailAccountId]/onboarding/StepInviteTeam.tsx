"use client";

import { useState } from "react";
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
  inviteMemberAction,
  createOrganizationAndInviteAction,
} from "@/utils/actions/organization";
import { isValidEmail } from "@/utils/email";

type InviteFormValues = {
  emails: { value: string }[];
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<InviteFormValues>({
    defaultValues: {
      emails: [{ value: "" }, { value: "" }, { value: "" }],
    },
  });

  const { fields } = useFieldArray({
    name: "emails",
    control,
  });

  const watchedEmails = watch("emails");
  const filledEmailCount = watchedEmails.filter(
    (e) => e.value.trim().length > 0,
  ).length;

  const onSubmit = handleSubmit(async (data) => {
    const emails = data.emails
      .map((e) => e.value.trim().toLowerCase())
      .filter(Boolean);

    if (emails.length === 0) return;

    setIsSubmitting(true);

    const captureSubmitted = (
      successfulInvites: number,
      failedInvites: number,
    ) => {
      if (successfulInvites === 0) return;
      posthog.capture("onboarding_invite_team_submitted", {
        variant: "onboarding",
        inviteCount: emails.length,
        successfulInvites,
        failedInvites,
        hasExistingOrganization: Boolean(organizationId),
      });
    };

    if (!organizationId) {
      const result = await createOrganizationAndInviteAction(emailAccountId, {
        emails,
        userName,
      });

      setIsSubmitting(false);

      if (result?.serverError || result?.validationErrors) {
        toastError({
          description: "Failed to create organization and send invitations",
        });
        return;
      }

      if (result?.data) {
        const successCount = result.data.results.filter(
          (r) => r.success,
        ).length;
        const errorCount = result.data.results.filter((r) => !r.success).length;

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

        captureSubmitted(successCount, errorCount);
        onNext();
      }

      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      const result = await inviteMemberAction({
        email,
        role: "member",
        organizationId,
      });

      if (result?.serverError || result?.validationErrors) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    setIsSubmitting(false);

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

    captureSubmitted(successCount, errorCount);
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
          <div className="mt-6 w-full mx-auto space-y-2 text-left">
            {fields.map((field, i) => (
              <Input
                key={field.id}
                type="email"
                name={`emails.${i}.value`}
                registerProps={register(`emails.${i}.value`, {
                  validate: (v) =>
                    !v || isValidEmail(v) || "Enter a valid email",
                })}
                placeholder="name@company.com"
                error={errors.emails?.[i]?.value}
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
