"use client";

import { AnnouncementVideo } from "@/components/feature-announcements/AnnouncementVideo";
import { EMAIL_CLIENT_LAUNCH_VIDEO_ID } from "@/utils/announcements";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepMailApp({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={
        <div className="w-[400px] max-w-[calc(100vw-2rem)]">
          <AnnouncementVideo
            playbackId={EMAIL_CLIENT_LAUNCH_VIDEO_ID}
            thumbnailTime={1.5}
            title="Meet the Inbox Zero email app"
          />
        </div>
      }
      title="Meet your new email app"
      description="Read and send email on web, desktop, and iPhone. Add the AI assistant anytime."
      onNext={onNext}
    />
  );
}
