"use client";

import { useCallback, useEffect, useRef } from "react";
import YouTube from "react-youtube";
import type { YouTubeEvent, YouTubePlayer } from "react-youtube";
import { useVideoProgressMilestones } from "@/hooks/useVideoProgressMilestones";
import { cn } from "@/utils";

export function YouTubeVideo(props: {
  videoId: string;
  title?: string;
  iframeClassName?: string;
  className?: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
  opts?: {
    height?: string;
    width?: string;
    playerVars?: {
      autoplay?: number;
    };
  };
}) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const hasTrackedVideoStart = useRef(false);
  const { resetProgressMilestones, trackProgressMilestones } =
    useVideoProgressMilestones({
      onProgress: props.onVideoProgress,
    });

  const stopProgressPolling = useCallback(() => {
    if (!progressIntervalRef.current) return;

    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }, []);

  const trackCurrentProgress = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;

    const [currentTime, duration] = await Promise.all([
      player.getCurrentTime(),
      player.getDuration(),
    ]);
    if (!duration || Number.isNaN(duration)) return;

    trackProgressMilestones(Math.floor((currentTime / duration) * 100));
  }, [trackProgressMilestones]);

  const trackCurrentProgressSafely = useCallback(() => {
    trackCurrentProgress().catch(() => {});
  }, [trackCurrentProgress]);

  const startProgressPolling = useCallback(() => {
    stopProgressPolling();
    trackCurrentProgressSafely();
    progressIntervalRef.current = setInterval(() => {
      trackCurrentProgressSafely();
    }, 1000);
  }, [stopProgressPolling, trackCurrentProgressSafely]);

  useEffect(() => stopProgressPolling, [stopProgressPolling]);

  const handleReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
  };

  const handlePlay = () => {
    if (!hasTrackedVideoStart.current) {
      hasTrackedVideoStart.current = true;
      props.onVideoStarted?.();
    }

    startProgressPolling();
  };

  const handlePause = () => {
    stopProgressPolling();
  };

  const handleEnd = () => {
    trackCurrentProgressSafely();
    stopProgressPolling();
    resetProgressMilestones();
    hasTrackedVideoStart.current = false;
    props.onVideoCompleted?.();
  };

  return (
    <YouTube
      videoId={props.videoId}
      title={props.title}
      className={cn("aspect-video h-full w-full rounded-lg", props.className)}
      iframeClassName={props.iframeClassName}
      onReady={handleReady}
      onPlay={handlePlay}
      onPause={handlePause}
      onEnd={handleEnd}
      opts={{
        ...props.opts,
        rel: 0,
      }}
    />
  );
}
