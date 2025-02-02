"use client";

import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastSuccess } from "@/components/Toast";
import { toastError } from "@/components/Toast";
import { enableReplyTrackerAction } from "@/utils/actions/reply-tracking";
import { isActionError } from "@/utils/error";

export function EnableReplyTracker() {
  return (
    <EnableFeatureCard
      title="Reply Tracker"
      description="Enable reply tracking to automatically track both emails you need to respond to and responses you're waiting for from others. Never miss a follow-up again."
      imageSrc="https://illustrations.popsy.co/amber/communication.svg"
      imageAlt="Reply tracking"
      buttonText="Enable Reply Tracker"
      onEnable={async () => {
        const result = await enableReplyTrackerAction();

        if (isActionError(result)) {
          toastError({
            title: "Error enabling reply tracker",
            description: result.error,
          });
        } else {
          toastSuccess({
            title: "Reply tracker enabled",
            description: "We've enabled reply tracking for you!",
          });
        }
      }}
    />
  );
}
