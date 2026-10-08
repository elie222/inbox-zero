"use client";

import type { ReactNode } from "react";
import { PlayIcon } from "lucide-react";
import { VideoPlayerDialog } from "@/components/VideoPlayerDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useVideoAnalytics } from "@/hooks/useVideoAnalytics";

type Video = {
  title: string;
  description: ReactNode;
  muxPlaybackId: string;
};

export function PageHeaderVideoButton({ video }: { video: Video }) {
  const analytics = useVideoAnalytics({
    muxPlaybackId: video.muxPlaybackId,
    surface: "page_header",
    title: video.title,
  });

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
      <VideoPlayerDialog
        title={video.title}
        description={video.description}
        muxPlaybackId={video.muxPlaybackId}
        onVideoCompleted={analytics.trackCompleted}
        onVideoProgress={analytics.trackProgress}
        onVideoStarted={analytics.trackStarted}
      />
    </Dialog>
  );
}
