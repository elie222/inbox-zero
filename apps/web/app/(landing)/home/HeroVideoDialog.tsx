"use client";

import { usePostHog } from "posthog-js/react";
import { LazyMuxVideo } from "@/components/LazyMuxVideo";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

// Recorded on every hero video event so videos can be compared by video_id.
const HERO_VIDEO_ID = "YeTrweHxCIM5tcBMXlvRbmDuPqL028lJrmJ3F6ZgwnDY";

export function HeroVideoDialog({
  playbackId = HERO_VIDEO_ID,
  thumbnailTime,
  title = "Inbox Zero product video",
}: {
  playbackId?: string;
  thumbnailTime?: number;
  title?: string;
}) {
  const posthog = usePostHog();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) landingPageAnalytics.videoClosed(posthog, playbackId);
      }}
    >
      <DialogTrigger
        asChild
        onClick={() => landingPageAnalytics.videoClicked(posthog, playbackId)}
      >
        <LiquidGlassButton
          aria-label="Play product demo video"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div>
            <Play className="translate-x-[2px]" />
          </div>
        </LiquidGlassButton>
      </DialogTrigger>
      <DialogContent className="max-w-7xl border-0 bg-transparent p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          <LazyMuxVideo
            playbackId={playbackId}
            thumbnailTime={thumbnailTime}
            title={title}
            className="size-full"
            playerClassName="size-full"
            autoPlay
            onVideoStarted={() =>
              landingPageAnalytics.videoStarted(posthog, playbackId)
            }
            onVideoProgress={(progressPercent: number) =>
              landingPageAnalytics.videoProgress(
                posthog,
                playbackId,
                progressPercent,
              )
            }
            onVideoCompleted={() =>
              landingPageAnalytics.videoCompleted(posthog, playbackId)
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
