"use client";

import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerCSSProperties } from "@mux/mux-player-react";
import { useRef } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { useVideoProgressMilestones } from "@/hooks/useVideoProgressMilestones";
import { cn } from "@/utils";

interface MuxVideoProps {
  autoPlay?: boolean;
  className?: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
  playbackId: string;
  playerClassName?: string;
  playerStyle?: MuxPlayerCSSProperties;
  thumbnailTime?: number;
  title: string;
}

export function MuxVideo({
  autoPlay,
  playbackId,
  title,
  className,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
  playerClassName,
  playerStyle,
  thumbnailTime,
}: MuxVideoProps) {
  const hasTrackedVideoStart = useRef(false);
  const { resetProgressMilestones, trackProgressMilestones } =
    useVideoProgressMilestones({
      onProgress: onVideoProgress,
    });

  const handleVideoStarted = () => {
    if (hasTrackedVideoStart.current) return;

    hasTrackedVideoStart.current = true;
    onVideoStarted?.();
  };

  const handleVideoProgress = (event: Event) => {
    const video = event.currentTarget as {
      currentTime?: number;
      duration?: number;
    };
    if (!video.duration || Number.isNaN(video.duration)) return;

    trackProgressMilestones(
      Math.floor(((video.currentTime ?? 0) / video.duration) * 100),
    );
  };

  const handleVideoCompleted = () => {
    hasTrackedVideoStart.current = false;
    resetProgressMilestones();
    onVideoCompleted?.();
  };

  return (
    <ClientOnly>
      <div className={cn("group relative", className)}>
        <MuxPlayer
          autoPlay={autoPlay}
          playbackId={playbackId}
          metadata={{ video_title: title }}
          accentColor="#3b82f6"
          thumbnailTime={thumbnailTime}
          className={cn(
            "aspect-video h-full w-full rounded-md shadow ring-1 ring-gray-900/10 transition-all duration-200 ease-out group-hover:brightness-[0.9]",
            playerClassName,
          )}
          style={playerStyle}
          onEnded={handleVideoCompleted}
          onPlay={handleVideoStarted}
          onTimeUpdate={handleVideoProgress}
        />
      </div>
    </ClientOnly>
  );
}
