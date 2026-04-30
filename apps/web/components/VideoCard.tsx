"use client";

import React, { useState, useEffect, useRef } from "react";
import type { ComponentProps } from "react";
import Image from "next/image";
import { PlayIcon, X } from "lucide-react";
import { CardGreen } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MutedText } from "@/components/Typography";
import { MuxVideo } from "@/components/MuxVideo";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import {
  useVideoAnalytics,
  type VideoAnalyticsConfig,
} from "@/hooks/useVideoAnalytics";

type VideoCardProps = ComponentProps<typeof VideoCard> & {
  storageKey: string;
  onDismiss?: () => void;
  onViewed?: () => void;
};

export function DismissibleVideoCard({
  storageKey,
  onDismiss,
  onViewed,
  ...props
}: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasTrackedView = useRef(false);
  const videoAnalytics = useVideoAnalytics(
    getVideoAnalyticsConfig({
      muxPlaybackId: props.muxPlaybackId,
      title: props.title,
      videoAnalytics: props.videoAnalytics,
      youtubeVideoId: props.youtubeVideoId,
    }),
  );

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === "true";
    setIsVisible(!isDismissed);
    setIsLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!isLoaded || !isVisible || hasTrackedView.current) return;

    hasTrackedView.current = true;
    videoAnalytics.trackViewed();
    onViewed?.();
  }, [isLoaded, isVisible, onViewed, videoAnalytics]);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "true");
    videoAnalytics.trackDismissed();
    onDismiss?.();
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
    videoSrc?: string;
    thumbnailSrc?: string;
    muxPlaybackId?: string;
    onClose?: () => void;
    onVideoCompleted?: () => void;
    onVideoOpened?: (trigger: "button" | "thumbnail") => void;
    onVideoProgress?: (progressPercent: number) => void;
    onVideoStarted?: () => void;
    videoAnalytics?: Omit<
      VideoAnalyticsConfig,
      "muxPlaybackId" | "provider" | "title" | "youtubeVideoId"
    > & {
      title?: string;
    };
    youtubeVideoId?: string;
  }
>(
  (
    {
      className,
      icon,
      title,
      description,
      videoSrc,
      thumbnailSrc,
      muxPlaybackId,
      onClose,
      onVideoCompleted,
      onVideoOpened,
      onVideoProgress,
      onVideoStarted,
      videoAnalytics,
      youtubeVideoId,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const analytics = useVideoAnalytics(
      getVideoAnalyticsConfig({
        muxPlaybackId,
        title,
        videoAnalytics,
        youtubeVideoId,
      }),
    );

    const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
    };

    const openVideo = (trigger: "button" | "thumbnail") => {
      setIsOpen(true);
      analytics.trackOpened({ trigger });
      onVideoOpened?.(trigger);
    };

    const handleVideoStarted = () => {
      analytics.trackStarted();
      onVideoStarted?.();
    };

    const handleVideoProgress = (progressPercent: number) => {
      analytics.trackProgress(progressPercent);
      onVideoProgress?.(progressPercent);
    };

    const handleVideoCompleted = () => {
      analytics.trackCompleted();
      onVideoCompleted?.();
    };

    return (
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
                <MutedText className="mt-1">{description}</MutedText>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="primaryBlack"
                  onClick={() => openVideo("button")}
                  Icon={PlayIcon}
                >
                  Watch Video
                </Button>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 flex-shrink-0">
              <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Play video"
                    onClick={() => openVideo("thumbnail")}
                    className="group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 rounded-lg overflow-hidden"
                  >
                    <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <Image
                        src={
                          muxPlaybackId
                            ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg`
                            : thumbnailSrc ||
                              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
                        }
                        alt={title}
                        fill
                        className="object-cover transition-all duration-200 group-hover:scale-105"
                        sizes="(max-width: 128px) 100vw, 128px"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors duration-200">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 group-hover:bg-white transition-colors duration-200">
                          <PlayIcon className="size-3 text-gray-800 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-6xl border-0 bg-transparent p-0 overflow-hidden">
                  <DialogTitle className="sr-only">Video: {title}</DialogTitle>
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                    {muxPlaybackId ? (
                      <MuxVideo
                        playbackId={muxPlaybackId}
                        className="size-full rounded-lg"
                        playerClassName="size-full rounded-lg"
                        playerStyle={{ overflow: "hidden" }}
                        title={title}
                        autoPlay
                        onVideoCompleted={handleVideoCompleted}
                        onVideoProgress={handleVideoProgress}
                        onVideoStarted={handleVideoStarted}
                      />
                    ) : youtubeVideoId ? (
                      <YouTubeVideo
                        videoId={youtubeVideoId}
                        title={`Video: ${title}`}
                        onVideoCompleted={handleVideoCompleted}
                        onVideoProgress={handleVideoProgress}
                        onVideoStarted={handleVideoStarted}
                        opts={{
                          playerVars: { autoplay: 1 },
                        }}
                      />
                    ) : (
                      <iframe
                        src={`${videoSrc}${videoSrc?.includes("?") ? "&" : "?"}autoplay=1&rel=0`}
                        className="size-full rounded-lg"
                        title={`Video: ${title}`}
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      />
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CardGreen>
    );
  },
);
VideoCard.displayName = "ActionCard";

export { VideoCard };

function getVideoAnalyticsConfig({
  muxPlaybackId,
  title,
  videoAnalytics,
  youtubeVideoId,
}: {
  muxPlaybackId?: string;
  title: string;
  videoAnalytics?:
    | (Omit<
        VideoAnalyticsConfig,
        "muxPlaybackId" | "provider" | "title" | "youtubeVideoId"
      > & {
        title?: string;
      })
    | undefined;
  youtubeVideoId?: string;
}): VideoAnalyticsConfig | undefined {
  if (!videoAnalytics) return;

  if (muxPlaybackId) {
    return {
      ...videoAnalytics,
      muxPlaybackId,
      provider: "mux",
      title: videoAnalytics.title ?? title,
    };
  }

  if (youtubeVideoId) {
    return {
      ...videoAnalytics,
      provider: "youtube",
      title: videoAnalytics.title ?? title,
      youtubeVideoId,
    };
  }
}
