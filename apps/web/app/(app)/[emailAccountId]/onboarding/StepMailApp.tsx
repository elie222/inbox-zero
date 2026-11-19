"use client";

import { useLingui } from "@lingui/react/macro";
import { AnnouncementVideo } from "@/components/feature-announcements/AnnouncementVideo";
import { EMAIL_CLIENT_LAUNCH_VIDEO_ID } from "@/utils/announcements";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepMailApp({ onNext }: { onNext: () => void }) {
  const { t } = useLingui();

  return (
    <OnboardingFeatureStep
      illustration={
        <div className="w-[400px] max-w-[calc(100vw-2rem)]">
          <AnnouncementVideo
            playbackId={EMAIL_CLIENT_LAUNCH_VIDEO_ID}
            thumbnailTime={1.5}
            title={t`Meet the Inbox Zero email app`}
          />
        </div>
      }
      title={t`Meet your new email app`}
      description={t`Read and send email on web, desktop, and iPhone. Add the AI assistant anytime.`}
      onNext={onNext}
    />
  );
}
