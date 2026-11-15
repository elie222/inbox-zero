"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { usePremium } from "@/hooks/usePremium";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const DESKTOP_PLAN_POLL_MS = 4000;

// Moves people on as soon as their plan starts. On the web, Stripe redirects
// them back itself; the desktop app hands checkout to the system browser, so
// the page it left behind has to notice the new plan on its own.
export function ContinueWhenSubscribed({ href }: { href: string }) {
  const router = useRouter();
  const inDesktopApp = Boolean(getInboxZeroDesktopApp());
  useSWR("/api/user/me", {
    refreshInterval: inDesktopApp ? DESKTOP_PLAN_POLL_MS : 0,
  });
  const { isPremium, isLoading, data } = usePremium();
  const wasPremiumOnLoad = useRef<boolean | null>(null);

  useEffect(() => {
    if (isLoading || !data) return;
    if (wasPremiumOnLoad.current === null) {
      wasPremiumOnLoad.current = isPremium;
      return;
    }
    if (!wasPremiumOnLoad.current && isPremium) router.replace(href);
  }, [data, href, isLoading, isPremium, router]);

  return null;
}
