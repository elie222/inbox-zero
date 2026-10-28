"use client";

import type { ReactNode } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LazyMuxVideo } from "@/components/LazyMuxVideo";

// Width tracks the viewport, minus the heading, so the 16:9 player stays
// inside the centered dialog. A fixed player width wider than the dialog
// leaves the video clipped and off-center.
const dialogWidth = "min(94vw, calc((90vh - 9rem) * 16 / 9), 1200px)";

export function VideoPlayerDialog({
  title,
  description,
  muxPlaybackId,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
}: {
  title: string;
  description?: ReactNode;
  muxPlaybackId: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
}) {
  return (
    <DialogContent
      className="max-w-none gap-4 bg-background p-6"
      style={{ width: dialogWidth }}
    >
      <DialogHeader className="text-left">
        <DialogTitle className="text-xl">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-base text-muted-foreground">
            {description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
      </DialogHeader>
      <VideoPlayer
        title={title}
        muxPlaybackId={muxPlaybackId}
        onVideoCompleted={onVideoCompleted}
        onVideoProgress={onVideoProgress}
        onVideoStarted={onVideoStarted}
      />
    </DialogContent>
  );
}

function VideoPlayer({
  title,
  muxPlaybackId,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
}: {
  title: string;
  muxPlaybackId: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
}) {
  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black">
      <LazyMuxVideo
        playbackId={muxPlaybackId}
        title={title}
        className="size-full"
        playerClassName="size-full"
        autoPlay
        onVideoCompleted={onVideoCompleted}
        onVideoProgress={onVideoProgress}
        onVideoStarted={onVideoStarted}
      />
    </div>
  );
}
