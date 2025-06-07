"use client";

import React from "react";
import MuxPlayer from "@mux/mux-player-react";
import { ClientOnly } from "@/components/ClientOnly";
import { cn } from "@/utils";

interface MuxVideoProps {
  playbackId: string;
  title: string;
  className?: string;
  thumbnailTime?: number;
}

export function MuxVideo({
  playbackId,
  title,
  className,
  thumbnailTime,
}: MuxVideoProps) {
  return (
    <ClientOnly>
      <div className={cn("group relative", className)}>
        <MuxPlayer
          playbackId={playbackId}
          metadata={{ video_title: title }}
          accentColor="#3b82f6"
          thumbnailTime={thumbnailTime}
          className="aspect-video h-full w-full rounded-md shadow ring-1 ring-gray-900/10 transition-all duration-200 ease-out group-hover:brightness-[0.9]"
        />
      </div>
    </ClientOnly>
  );
}
