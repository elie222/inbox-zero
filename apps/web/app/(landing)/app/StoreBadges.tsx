"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Apple } from "@/components/new-landing/icons/Apple";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

export function StoreBadges({ className }: { className?: string }) {
  const posthog = usePostHog();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 sm:flex-row",
        className,
      )}
    >
      <StoreBadge
        href="/ios"
        label="Download on the"
        store="App Store"
        icon={<Apple className="size-7" />}
        onClick={() => landingPageAnalytics.appDownloadClicked(posthog, "ios")}
      />
      <StoreBadge
        href="/android"
        label="Get it on"
        store="Google Play"
        icon={<PlayIcon />}
        onClick={() =>
          landingPageAnalytics.appDownloadClicked(posthog, "android")
        }
      />
    </div>
  );
}

function StoreBadge({
  href,
  label,
  store,
  icon,
  onClick,
}: {
  href: string;
  label: string;
  store: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      prefetch={false}
      className={cn(
        "flex w-[200px] items-center gap-3 rounded-[13px] bg-[#242424] px-5 py-3 text-white",
        "transition-all duration-200 will-change-transform hover:scale-[1.04]",
        "shadow-[0px_2px_16px_0px_#00000014] hover:shadow-[0px_2px_16px_0px_#00000022]",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[11px] text-white/70">{label}</span>
        <span className="font-geist text-lg font-medium">{store}</span>
      </span>
    </Link>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path
        d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.3-.6-.8-.6-1.4V3.2c0-.6.2-1.1.6-1.4z"
        fill="#00d2ff"
      />
      <path
        d="M3.6 1.8c.5-.4 1.1-.4 1.7-.1L17 8.6l-3.6 3.4L3.6 1.8z"
        fill="#00e676"
      />
      <path
        d="M17 15.4 5.3 22.3c-.6.3-1.2.3-1.7-.1L13.4 12 17 15.4z"
        fill="#ff3d47"
      />
      <path
        d="M17 8.6l3.4 2c1.1.6 1.1 1.7 0 2.3l-3.4 2L13.4 12 17 8.6z"
        fill="#ffce00"
      />
    </svg>
  );
}
