"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/TagInput";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  inviteMemberAction,
  createOrganizationAndInviteAction,
} from "@/utils/actions/organization";
import { isValidEmail } from "@/utils/email";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

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
      return;
    }

    setIsSubmitting(true);

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

    if (successCount > 0) {
      onNext();
    }
  }, [emails, emailAccountId, organizationId, userName, onNext]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="mb-6"
        >
          <IconCircle size="lg">
            <UsersIcon className="size-6" />
          </IconCircle>
        </motion.div>

        <PageHeading className="mb-3">Invite your team</PageHeading>
        <TypographyP className="text-muted-foreground mb-6">
          Collaborate with your team on Inbox Zero. You can always add more
          members later.
        </TypographyP>

        <TagInput
          value={emails}
          onChange={handleEmailsChange}
          validate={(email) =>
            isValidEmail(email) ? null : "Please enter a valid email address"
          }
          label="Email addresses"
          id="email-input"
          placeholder="Enter email addresses separated by commas"
          className="w-full text-left"
        />

        <div className="flex flex-col gap-2 w-full max-w-xs mt-6">
          <Button
            type="button"
            className="w-full"
            onClick={handleInviteAndContinue}
            loading={isSubmitting}
            disabled={emails.length === 0}
          >
            Invite & Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onNext}
            disabled={isSubmitting}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
