import React from "react";
import YouTube from "react-youtube";
import { cn } from "@/utils";

export function YouTubeVideo(props: {
  videoId: string;
  iframeClassName?: string;
  className?: string;
  opts?: {
    height?: string;
    width?: string;
    playerVars?: {
      autoplay?: number;
    };
  };
}) {
  return (
    <YouTube
      videoId={props.videoId}
      className={cn("aspect-video h-full w-full rounded-lg", props.className)}
      iframeClassName={props.iframeClassName}
      opts={{
        ...props.opts,
        rel: 0,
      }}
    />
  );
}
