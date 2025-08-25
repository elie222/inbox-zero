"use client";

import { useCallback } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/utils";
import { usePostHog } from "posthog-js/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface HeroVideoProps {
  videoSrc: string;
  thumbnailSrc: string;
  thumbnailAlt?: string;
  className?: string;
}

export default function HeroVideoDialog({
  videoSrc,
  thumbnailSrc,
  thumbnailAlt = "Video thumbnail",
  className,
}: HeroVideoProps) {
  const posthog = usePostHog();

  const handleOpenVideo = useCallback(() => {
    posthog.capture("Landing Page Video Clicked");
  }, [posthog]);

  return (
    <Dialog>
      <div className={cn("relative", className)}>
        <DialogTrigger asChild>
          <button
            type="button"
            onClick={handleOpenVideo}
            aria-label="Play video"
            className="group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
          >
            <div className="relative -m-2 rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:-m-4 lg:rounded-2xl lg:p-4">
              <Image
                src={thumbnailSrc}
                alt={thumbnailAlt}
                width={2432}
                height={1442}
                priority
                className="rounded-md shadow ring-1 ring-gray-900/10 transition-all duration-200 ease-out group-hover:brightness-[0.9]"
              />
            </div>
            <div className="absolute inset-0 flex scale-[0.9] items-center justify-center rounded-2xl transition-all duration-200 ease-out group-hover:scale-100">
              <div className="flex size-28 items-center justify-center rounded-full bg-blue-500/10 backdrop-blur-md">
                <div className="relative flex size-20 scale-100 items-center justify-center rounded-full bg-gradient-to-b from-blue-500/30 to-blue-500 shadow-md transition-all duration-200 ease-out group-hover:scale-[1.2]">
                  <Play
                    className="size-8 scale-100 fill-white text-white transition-transform duration-200 ease-out group-hover:scale-105"
                    style={{
                      filter:
                        "drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))",
                    }}
                  />
                </div>
              </div>
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0">
          <DialogTitle className="sr-only">Video player</DialogTitle>
          <div className="relative aspect-video w-full">
            <iframe
              src={videoSrc}
              className="size-full rounded-lg"
              title="Video content"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            />
          </div>
        </DialogContent>
      </div>
    </Dialog>
  );
}
