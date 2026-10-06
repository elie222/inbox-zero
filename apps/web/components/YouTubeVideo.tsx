import { cn } from "@/utils";

// A plain embed is enough for the marketing pages that still host videos on
// YouTube. In-app walkthroughs use MuxVideo, which reports playback progress.
export function YouTubeVideo({
  videoId,
  title,
  className,
  iframeClassName,
}: {
  videoId: string;
  title: string;
  className?: string;
  iframeClassName?: string;
}) {
  return (
    <div className={cn("aspect-video h-full w-full rounded-lg", className)}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`}
        title={title}
        className={cn("h-full w-full", iframeClassName)}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
