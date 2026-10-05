"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The players are heavy and only needed once a dialog opens. DialogContent
// mounts on open, so loading them here keeps them out of every page that
// merely renders a "Watch demo" button.
const MuxVideo = dynamic(
  () => import("@/components/MuxVideo").then((mod) => mod.MuxVideo),
  { ssr: false },
);
const YouTubeVideo = dynamic(
  () => import("@/components/YouTubeVideo").then((mod) => mod.YouTubeVideo),
  { ssr: false },
);

// Width tracks the viewport, minus the heading, so the 16:9 player stays
// inside the centered dialog. A fixed player width wider than the dialog
// clips the YouTube title and leaves the video off-center.
const dialogWidth = "min(94vw, calc((90vh - 9rem) * 16 / 9), 1200px)";

export function VideoPlayerDialog({
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
  videoSrc,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
}: {
  title: string;
  description?: ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
  videoSrc?: string;
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
        youtubeVideoId={youtubeVideoId}
        muxPlaybackId={muxPlaybackId}
        videoSrc={videoSrc}
        onVideoCompleted={onVideoCompleted}
        onVideoProgress={onVideoProgress}
        onVideoStarted={onVideoStarted}
      />
    </DialogContent>
  );
}

function VideoPlayer({
  title,
  youtubeVideoId,
  muxPlaybackId,
  videoSrc,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
}: {
  title: string;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
  videoSrc?: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
}) {
  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black">
      {muxPlaybackId ? (
        <MuxVideo
          playbackId={muxPlaybackId}
          title={title}
          className="size-full"
          playerClassName="size-full"
          autoPlay
          onVideoCompleted={onVideoCompleted}
          onVideoProgress={onVideoProgress}
          onVideoStarted={onVideoStarted}
        />
      ) : youtubeVideoId ? (
        <YouTubeVideo
          videoId={youtubeVideoId}
          title={title}
          className="size-full"
          iframeClassName="h-full w-full"
          onVideoCompleted={onVideoCompleted}
          onVideoProgress={onVideoProgress}
          onVideoStarted={onVideoStarted}
          opts={{
            height: "100%",
            width: "100%",
            playerVars: { autoplay: 1 },
          }}
        />
      ) : videoSrc ? (
        <iframe
          src={`${videoSrc}${videoSrc.includes("?") ? "&" : "?"}autoplay=1&rel=0`}
          className="absolute inset-0 size-full"
          title={title}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        />
      ) : null}
    </div>
  );
}
