"use client";

import { useState, useCallback } from "react";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/TagInput";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  inviteMemberAction,
  createOrganizationAndInviteAction,
} from "@/utils/actions/organization";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  const normalizedEmail = email.toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return "Please enter a valid email address";
  }
  return null;
}

export function StepInviteTeam({
  emailAccountId,
  organizationId,
  userName,
  onNext,
}: {
  emailAccountId: string;
  organizationId?: string;
  userName?: string | null;
  onNext: () => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailsChange = useCallback((newEmails: string[]) => {
    setEmails(newEmails.map((e) => e.toLowerCase()));
  }, []);

  const handleInviteAndContinue = useCallback(async () => {
    if (emails.length === 0) {
      onNext();
      return;
    }

    setIsSubmitting(true);

    if (!organizationId) {
      const result = await createOrganizationAndInviteAction(emailAccountId, {
        emails,
        userName,
      });

      setIsSubmitting(false);

      if (result?.serverError) {
        toastError({
          description: "Failed to create organization and send invitations",
        });
      } else if (result?.data) {
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
      }

      onNext();
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

      if (result?.serverError) {
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

    onNext();
  }, [emails, emailAccountId, organizationId, userName, onNext]);

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle size="lg" className="mx-auto">
        <UsersIcon className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>Invite your team</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          Collaborate with your team on Inbox Zero. You can always add more
          members later.
        </TypographyP>

        <TagInput
          value={emails}
          onChange={handleEmailsChange}
          validate={validateEmail}
          label="Email addresses"
          id="email-input"
          placeholder="Enter email addresses separated by commas"
          className="mt-6 max-w-md mx-auto text-left"
        />

        <div className="flex flex-col items-center gap-2 mt-6">
          <Button
            type="button"
            size="sm"
            onClick={handleInviteAndContinue}
            loading={isSubmitting}
          >
            {emails.length > 0 ? "Invite & Continue" : "Continue"}
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNext}
            disabled={isSubmitting}
          >
            Skip
          </Button>
        </div>
      </div>
    </OnboardingWrapper>
  );
}
