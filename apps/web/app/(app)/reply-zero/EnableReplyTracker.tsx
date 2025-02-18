"use client";

import { toast } from "sonner";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Badge } from "@/components/Badge";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastSuccess } from "@/components/Toast";
import { toastError } from "@/components/Toast";
import { SectionDescription } from "@/components/Typography";
import {
  enableReplyTrackerAction,
  processPreviousSentEmailsAction,
} from "@/utils/actions/reply-tracking";
import { isActionError } from "@/utils/error";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";

export function EnableReplyTracker() {
  const [, setEnabled] = useQueryState(
    "enabled",
    parseAsBoolean.withDefault(false),
  );

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
        <div className="mt-4">
          <p>
            <SectionDescription className="text-left">
              We label your emails with:
            </SectionDescription>
          </p>

          <SectionDescription className="text-left">
            <Badge color="green">{NEEDS_REPLY_LABEL_NAME}</Badge> - emails you
            need to reply to.
          </SectionDescription>
          <SectionDescription className="text-left">
            <Badge color="blue">{AWAITING_REPLY_LABEL_NAME}</Badge> - emails
            where you're waiting for a response.
          </SectionDescription>
        </div>
      }
      imageSrc="/images/illustrations/communication.svg"
      imageAlt="Reply tracking"
      buttonText="Enable"
      onEnable={async () => {
        const result = await enableReplyTrackerAction();

        if (isActionError(result)) {
          toastError({
            title: "Error enabling Reply Zero",
            description: result.error,
          });
        } else {
          toastSuccess({
            title: "Reply Zero enabled",
            description: "We've enabled Reply Zero for you!",
          });
        }

        toast.promise(
          async () => {
            const previousSentPromise = processPreviousSentEmailsAction();
            // this will force the page to hide the enable feature card
            setEnabled(true);
            const previousSentResult = await previousSentPromise;
            if (isActionError(previousSentResult))
              throw new Error(previousSentResult.error);
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
