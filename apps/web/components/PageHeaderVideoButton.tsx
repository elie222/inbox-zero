"use client";

import type { ReactNode } from "react";
import { PlayIcon } from "lucide-react";
import { OnboardingDialogContent } from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useVideoAnalytics } from "@/hooks/useVideoAnalytics";

type Video = {
  title: string;
  description: ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
};

export function PageHeaderVideoButton({ video }: { video: Video }) {
  const analytics = useVideoAnalytics(getVideoAnalyticsConfig(video));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          onClick={() => analytics.trackOpened({ trigger: "page_header" })}
        >
          <PlayIcon className="mr-2 size-3" />
          Watch demo
        </Button>
      </DialogTrigger>
      <OnboardingDialogContent
        title={video.title}
        description={video.description}
        youtubeVideoId={video.youtubeVideoId}
        muxPlaybackId={video.muxPlaybackId}
        onVideoCompleted={analytics.trackCompleted}
        onVideoProgress={analytics.trackProgress}
        onVideoStarted={analytics.trackStarted}
      />
    </Dialog>
  );
}

function getVideoAnalyticsConfig(video: Video) {
  if (video.muxPlaybackId) {
    return {
      muxPlaybackId: video.muxPlaybackId,
      provider: "mux" as const,
      surface: "page_header",
      title: video.title,
    };
  }

  if (video.youtubeVideoId) {
    return {
      provider: "youtube" as const,
      surface: "page_header",
      title: video.title,
      youtubeVideoId: video.youtubeVideoId,
    };
  }
}
