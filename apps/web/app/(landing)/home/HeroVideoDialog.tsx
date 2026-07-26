"use client";

import { usePostHog } from "posthog-js/react";
import { LiquidGlassButton } from "@/components/new-landing/LiquidGlassButton";
import { Play } from "@/components/new-landing/icons/Play";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

export function HeroVideoDialog() {
  const posthog = usePostHog();

  return (
    <Dialog>
      <DialogTrigger
        asChild
        onClick={() => landingPageAnalytics.videoClicked(posthog)}
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
        <DialogTitle className="sr-only">Video player</DialogTitle>
        <div className="relative aspect-video w-full">
          <iframe
            src="https://www.youtube.com/embed/UusnveLKwWM?autoplay=1&rel=0"
            className="size-full rounded-lg"
            title="Video content"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
