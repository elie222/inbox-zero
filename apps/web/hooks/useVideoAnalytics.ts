"use client";

import { useMemo } from "react";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import {
  PRODUCT_ANALYTICS_ACTIONS,
  type AppPage,
} from "@/utils/analytics/product";

export type VideoSurface =
  | "dismissible_card"
  | "onboarding_modal"
  | "page_header";

export type VideoAnalyticsConfig = {
  muxPlaybackId?: string;
  page?: AppPage;
  surface: VideoSurface;
  title: string;
  youtubeVideoId?: string;
};

const VIDEO_ACTIONS = PRODUCT_ANALYTICS_ACTIONS.video;
type VideoAction = (typeof VIDEO_ACTIONS)[keyof typeof VIDEO_ACTIONS];

export function useVideoAnalytics(config?: VideoAnalyticsConfig) {
  const { muxPlaybackId, page, surface, title, youtubeVideoId } = config ?? {};
  const analytics = useProductAnalytics(page);

  return useMemo(() => {
    const isActive = surface !== undefined && title !== undefined;

    const capture = (
      action: VideoAction,
      properties?: Record<string, unknown>,
    ) => {
      if (!isActive) return;

      analytics.captureAction(action, {
        video_title: title,
        video_surface: surface,
        ...(muxPlaybackId
          ? { mux_playback_id: muxPlaybackId, video_provider: "mux" }
          : youtubeVideoId
            ? { youtube_video_id: youtubeVideoId, video_provider: "youtube" }
            : {}),
        ...properties,
      });
    };

    return {
      trackCompleted: () => capture(VIDEO_ACTIONS.completed),
      trackDismissed: () => capture(VIDEO_ACTIONS.dismissed),
      trackOpened: (properties?: Record<string, unknown>) =>
        capture(VIDEO_ACTIONS.opened, properties),
      trackProgress: (progressPercent: number) =>
        capture(VIDEO_ACTIONS.progress, { progress_percent: progressPercent }),
      trackStarted: () => capture(VIDEO_ACTIONS.started),
      trackViewed: () => capture(VIDEO_ACTIONS.viewed),
    };
  }, [analytics, muxPlaybackId, surface, title, youtubeVideoId]);
}
