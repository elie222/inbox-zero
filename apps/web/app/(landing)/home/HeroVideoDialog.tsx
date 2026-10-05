"use client";

import dynamic from "next/dynamic";
import { usePostHog } from "posthog-js/react";
import { Loader2Icon } from "lucide-react";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

// Recorded on every hero video event so a future video swap can be compared
// with this one by video_id.
const HERO_VIDEO_ID = "YeTrweHxCIM5tcBMXlvRbmDuPqL028lJrmJ3F6ZgwnDY";

// Most visitors never open the video, so the player loads only when the
// dialog does (DialogContent mounts on open).
const MuxVideo = dynamic(
  () => import("@/components/MuxVideo").then((mod) => mod.MuxVideo),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Loader2Icon className="size-8 animate-spin text-white/70" />
      </div>
    ),
  },
);

export function HeroVideoDialog() {
  const posthog = usePostHog();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) landingPageAnalytics.videoClosed(posthog, HERO_VIDEO_ID);
      }}
    >
      <DialogTrigger
        asChild
        onClick={() =>
          landingPageAnalytics.videoClicked(posthog, HERO_VIDEO_ID)
        }
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
        <DialogTitle className="sr-only">Inbox Zero product video</DialogTitle>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          <MuxVideo
            playbackId={HERO_VIDEO_ID}
            title="Inbox Zero product video"
            className="size-full"
            playerClassName="size-full"
            autoPlay
            onVideoStarted={() =>
              landingPageAnalytics.videoStarted(posthog, HERO_VIDEO_ID)
            }
            onVideoProgress={(progressPercent: number) =>
              landingPageAnalytics.videoProgress(
                posthog,
                HERO_VIDEO_ID,
                progressPercent,
              )
            }
            onVideoCompleted={() =>
              landingPageAnalytics.videoCompleted(posthog, HERO_VIDEO_ID)
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
