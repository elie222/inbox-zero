"use client";

import { useEffect, useRef } from "react";
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
  const durationRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const hasTrackedVideoStart = useRef(false);
  const { resetProgressMilestones, trackProgressMilestones } =
    useVideoProgressMilestones({
      onProgress: props.onVideoProgress,
    });

  const stopProgressPolling = () => {
    if (!progressIntervalRef.current) return;

    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  };

  const trackCurrentProgress = async () => {
    const player = playerRef.current;
    if (!player) return;

    let duration = durationRef.current;
    if (duration === null) {
      duration = await player.getDuration();
      if (!duration || Number.isNaN(duration)) return;
      durationRef.current = duration;
    }

    const currentTime = await player.getCurrentTime();
    trackProgressMilestones(Math.floor((currentTime / duration) * 100));
  };

  const startProgressPolling = () => {
    stopProgressPolling();
    progressIntervalRef.current = setInterval(() => {
      trackCurrentProgress().catch(() => {});
    }, 1000);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on videoId change to clear cached duration/milestones
  useEffect(() => {
    durationRef.current = null;
    hasTrackedVideoStart.current = false;
    resetProgressMilestones();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [props.videoId, resetProgressMilestones]);

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
    trackCurrentProgress().catch(() => {});
    stopProgressPolling();
    resetProgressMilestones();
    durationRef.current = null;
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
