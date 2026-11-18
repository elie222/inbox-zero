"use client";

import { useLingui } from "@lingui/react/macro";
import { AnnouncementVideo } from "@/components/feature-announcements/AnnouncementVideo";
import { EMAIL_CLIENT_LAUNCH_VIDEO_ID } from "@/utils/announcements";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepMailApp({
  onNext,
  optional,
}: {
  onNext: () => void;
  // AI-first users keep their current inbox, so the app is pitched as an extra.
  optional?: boolean;
}) {
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
      title={
        optional ? t`Want a faster inbox too?` : t`Meet your new email app`
      }
      description={
        optional
          ? t`Inbox Zero works in Gmail or Outlook, so you don't need to switch. If you want, use our email app on web, desktop, iPhone, and Android.`
          : t`Read and send email on web, desktop, iPhone, and Android. Add the AI assistant anytime.`
      }
      onNext={onNext}
    />
  );
}
