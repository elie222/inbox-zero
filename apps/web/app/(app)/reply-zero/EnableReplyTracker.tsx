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
          Most emails don't need a reply — Reply Zero surfaces the ones that do.
          <br />
          We'll track what needs your attention and who hasn't responded yet.
        </>
      }
      extraDescription={
        <div className="mt-4">
          <SectionDescription className="text-left">
            <Badge color="green">{NEEDS_REPLY_LABEL_NAME}</Badge> label
            highlights emails you need to reply to.
          </SectionDescription>
          <SectionDescription className="text-left">
            <Badge color="blue">{AWAITING_REPLY_LABEL_NAME}</Badge> label marks
            conversations where you’re waiting for others.
          </SectionDescription>
        </div>
      }
      imageSrc="https://illustrations.popsy.co/amber/communication.svg"
      imageAlt="Reply tracking"
      buttonText="Get Started"
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
