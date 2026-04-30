"use client";

import { useCallback } from "react";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import type { AppPage } from "@/utils/analytics/product";

export type VideoAnalyticsConfig = {
  muxPlaybackId?: string;
  page?: AppPage;
  provider: "mux" | "youtube";
  surface: string;
  title: string;
  youtubeVideoId?: string;
};

type VideoAction =
  | "video_completed"
  | "video_dismissed"
  | "video_opened"
  | "video_progress"
  | "video_started"
  | "video_viewed";

export function useVideoAnalytics(config?: VideoAnalyticsConfig) {
  const analytics = useProductAnalytics(config?.page);

  const capture = useCallback(
    (action: VideoAction, properties?: Record<string, unknown>) => {
      if (!config) return;

      analytics.captureAction(action, {
        video_title: config.title,
        video_provider: config.provider,
        video_surface: config.surface,
        ...(config.muxPlaybackId
          ? { mux_playback_id: config.muxPlaybackId }
          : {}),
        ...(config.youtubeVideoId
          ? { youtube_video_id: config.youtubeVideoId }
          : {}),
        ...properties,
      });
    },
    [analytics, config],
  );

  return {
    trackCompleted: useCallback(() => {
      capture("video_completed");
    }, [capture]),
    trackDismissed: useCallback(() => {
      capture("video_dismissed");
    }, [capture]),
    trackOpened: useCallback(
      (properties?: Record<string, unknown>) => {
        capture("video_opened", properties);
      },
      [capture],
    ),
    trackProgress: useCallback(
      (progressPercent: number) => {
        capture("video_progress", { progress_percent: progressPercent });
      },
      [capture],
    ),
    trackStarted: useCallback(() => {
      capture("video_started");
    }, [capture]),
    trackViewed: useCallback(() => {
      capture("video_viewed");
    }, [capture]),
  };
}
