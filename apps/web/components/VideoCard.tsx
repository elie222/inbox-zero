"use client";

import React, { useState, useEffect } from "react";
import type { ComponentProps } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";
import { CardGreen } from "@/components/ui/card";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

type VideoCardProps = ComponentProps<typeof VideoCard> & {
  storageKey: string;
};

export function DismissibleVideoCard({ storageKey, ...props }: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === "true";
    setIsVisible(!isDismissed);
    setIsLoaded(true);
  }, [storageKey]);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "true");
  };

  if (!isLoaded || !isVisible) {
    return null;
  }

  return <VideoCard {...props} onClose={handleClose} />;
}

const VideoCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon?: React.ReactNode;
    title: string;
    description: string;
    videoId?: string;
    thumbnailSrc?: string;
    thumbnailAlt?: string;
    onClose?: () => void;
  }
>(
  (
    {
      className,
      icon,
      title,
      description,
      videoId,
      thumbnailSrc,
      thumbnailAlt = "Video thumbnail",
      onClose,
      ...props
    },
    ref,
  ) => (
    <CardGreen ref={ref} className={className} {...props}>
      <div className="relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors duration-200"
          >
            <X className="w-4 h-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
          </button>
        )}
        <div className="flex items-center justify-between gap-6 p-6 pr-12">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400">
                {icon}
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {videoId && thumbnailSrc && (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Play video"
                    className="group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 rounded-lg overflow-hidden"
                  >
                    <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <Image
                        src={thumbnailSrc}
                        alt={thumbnailAlt}
                        fill
                        className="object-cover transition-all duration-200 group-hover:scale-105"
                        sizes="(max-width: 128px) 100vw, 128px"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors duration-200">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 group-hover:bg-white transition-colors duration-200">
                          <Play className="w-3 h-3 text-gray-800 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl border-0 bg-transparent p-0">
                  <DialogTitle className="sr-only">Video: {title}</DialogTitle>
                  <div className="relative aspect-video w-full">
                    <YouTubeVideo
                      videoId={videoId}
                      title={`Video: ${title}`}
                      opts={{
                        playerVars: {
                          autoplay: 1,
                        },
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>
    </CardGreen>
  ),
);
VideoCard.displayName = "ActionCard";

export { VideoCard };
