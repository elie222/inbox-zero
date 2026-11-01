"use client";

import { useState } from "react";
import Image from "next/image";
import { PlayIcon } from "lucide-react";
import { LazyMuxVideo } from "@/components/LazyMuxVideo";

export function AnnouncementVideo({
  playbackId,
  thumbnailTime,
  title,
}: {
  playbackId: string;
  thumbnailTime: number;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      {playing ? (
        <LazyMuxVideo
          playbackId={playbackId}
          thumbnailTime={thumbnailTime}
          title={title}
          autoPlay
          className="size-full"
          playerClassName="size-full"
        />
      ) : (
        <button
          type="button"
          aria-label={`Play video: ${title}`}
          onClick={() => setPlaying(true)}
          className="group absolute inset-0"
        >
          <Image
            src={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=${thumbnailTime}&width=800`}
            alt={title}
            fill
            sizes="400px"
            className="object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
              <PlayIcon className="ml-0.5 size-5 fill-gray-900 text-gray-900" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
