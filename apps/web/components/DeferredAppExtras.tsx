"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const CommandK = dynamic(
  () => import("@/components/CommandK").then((mod) => mod.CommandK),
  { ssr: false },
);
const EmailViewer = dynamic(
  () => import("@/components/EmailViewer").then((mod) => mod.EmailViewer),
  { ssr: false },
);
const AnnouncementDialog = dynamic(
  () =>
    import("@/components/feature-announcements/AnnouncementDialog").then(
      (mod) => mod.AnnouncementDialog,
    ),
  { ssr: false },
);

const AppDataPreloader = dynamic(
  () =>
    import("@/components/AppDataPreloader").then((mod) => mod.AppDataPreloader),
  { ssr: false },
);

// Interaction-driven UI that nothing needs at first paint. Loading it after
// hydration settles keeps these chunks off the mail list's critical path.
export function DeferredAppExtras() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => setReady(true), {
        timeout: 3000,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timeout = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) return null;

  return (
    <>
      <CommandK />
      <EmailViewer />
      <AnnouncementDialog />
      <AppDataPreloader />
    </>
  );
}
