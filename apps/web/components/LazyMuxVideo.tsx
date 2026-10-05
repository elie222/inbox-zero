"use client";

import dynamic from "next/dynamic";
import { Loader2Icon } from "lucide-react";

// The Mux player is heavy and usually only needed after a user opens a video.
// Rendering this instead of MuxVideo keeps the player out of the page bundle
// until it actually mounts.
export const LazyMuxVideo = dynamic(
  () => import("@/components/MuxVideo").then((mod) => mod.MuxVideo),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="flex size-full items-center justify-center">
        <span className="sr-only">Loading video</span>
        <Loader2Icon
          aria-hidden="true"
          className="size-8 animate-spin text-white/70"
        />
      </div>
    ),
  },
);
