"use client";

import { useCallback } from "react";
import { SparklesIcon } from "lucide-react";
import { DismissibleVideoCard } from "@/components/VideoCard";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

const VIDEO_TITLE = "Getting started with AI Assistant";
const MUX_PLAYBACK_ID = "VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8";

export function AutomationOnboardingVideoCard() {
  const analytics = useProductAnalytics("automation");

  const captureVideoAction = useCallback(
    (
      action:
        | "automation_video_banner_clicked"
        | "automation_video_banner_completed"
        | "automation_video_banner_dismissed"
        | "automation_video_banner_progress"
        | "automation_video_banner_started"
        | "automation_video_banner_viewed",
      properties?: Record<string, unknown>,
    ) => {
      analytics.captureAction(action, {
        video_title: VIDEO_TITLE,
        mux_playback_id: MUX_PLAYBACK_ID,
        ...properties,
      });
    },
    [analytics],
  );

  return (
    <DismissibleVideoCard
      className="my-4"
      icon={<SparklesIcon className="h-5 w-5" />}
      title={VIDEO_TITLE}
      description="Learn how to use the AI Assistant to automatically label, archive, and more."
      muxPlaybackId={MUX_PLAYBACK_ID}
      storageKey="ai-assistant-onboarding-video"
      onDismiss={() => captureVideoAction("automation_video_banner_dismissed")}
      onViewed={() => captureVideoAction("automation_video_banner_viewed")}
      onVideoCompleted={() =>
        captureVideoAction("automation_video_banner_completed")
      }
      onVideoOpened={(trigger) =>
        captureVideoAction("automation_video_banner_clicked", {
          trigger,
        })
      }
      onVideoProgress={(progressPercent) =>
        captureVideoAction("automation_video_banner_progress", {
          progress_percent: progressPercent,
        })
      }
      onVideoStarted={() =>
        captureVideoAction("automation_video_banner_started")
      }
    />
  );
}
