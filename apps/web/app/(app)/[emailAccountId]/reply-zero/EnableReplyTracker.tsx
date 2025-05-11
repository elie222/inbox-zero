"use client";

import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastSuccess } from "@/components/Toast";
import { toastError } from "@/components/Toast";
import { SectionDescription } from "@/components/Typography";
import {
  enableReplyTrackerAction,
  processPreviousSentEmailsAction,
} from "@/utils/actions/reply-tracking";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import {
  markOnboardingAsCompleted,
  REPLY_ZERO_ONBOARDING_COOKIE,
} from "@/utils/cookies";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function EnableReplyTracker({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  return (
    <EnableFeatureCard
      title="Reply Zero"
      description={
        <>
          Your inbox is filled with emails that don't need your attention.
          <br />
          Reply Zero only shows you the ones that do.
        </>
      }
      extraDescription={
        <div className="mt-4 text-left">
          <SectionDescription>We label your emails with:</SectionDescription>

          <SectionDescription>
            <Badge color="green">{NEEDS_REPLY_LABEL_NAME}</Badge> - emails you
            need to reply to.
          </SectionDescription>
          <SectionDescription>
            <Badge color="blue">{AWAITING_REPLY_LABEL_NAME}</Badge> - emails
            where you're waiting for a response.
          </SectionDescription>

          <SectionDescription className="mt-4">
            You can also enable auto-drafting of replies that appear in your
            inbox.
          </SectionDescription>
        </div>
      }
      imageSrc="/images/illustrations/communication.svg"
      imageAlt="Reply tracking"
      buttonText={enabled ? "Got it!" : "Enable Reply Zero"}
      onEnable={async () => {
        markOnboardingAsCompleted(REPLY_ZERO_ONBOARDING_COOKIE);

        if (enabled) {
          router.push(prefixPath(emailAccountId, "/reply-zero"));
          return;
        }

        const result = await enableReplyTrackerAction(emailAccountId);

        if (result?.serverError) {
          toastError({
            title: "Error enabling Reply Zero",
            description: result.serverError,
          });
        } else {
          toastSuccess({
            title: "Reply Zero enabled",
            description: "We've enabled Reply Zero for you!",
          });
        }

        toast.promise(
          async () => {
            await processPreviousSentEmailsAction(emailAccountId);

            router.push(prefixPath(emailAccountId, "/reply-zero?enabled=true"));
          },
          {
            loading:
              "Processing previously sent emails... This will take a few minutes. Refresh the page to view updated progress.",
            success: "Previously sent emails processed",
            error: "Error processing previously sent emails",
          },
        );
      }}
    />
  );
}
