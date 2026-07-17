"use client";

import { GoogleTagManager } from "@next/third-parties/google";
import { useSelectedLayoutSegments } from "next/navigation";
import { env } from "@/env";

export function ConversionTagManager() {
  const segments = useSelectedLayoutSegments();
  const isPublicRoute =
    segments.includes("(landing)") || segments.includes("(marketing)");

  if (!env.NEXT_PUBLIC_GTM_ID || !isPublicRoute) return null;

  return <GoogleTagManager gtmId={env.NEXT_PUBLIC_GTM_ID} />;
}
