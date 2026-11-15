"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { usePremium } from "@/hooks/usePremium";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const DESKTOP_PLAN_POLL_MS = 4000;

// Moves people into the app as soon as their plan starts. On the web, Stripe
// redirects them back itself; the desktop app hands checkout to the system
// browser, so this page has to notice the new plan on its own.
export function ContinueWhenSubscribed() {
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
    if (!wasPremiumOnLoad.current && isPremium) {
      router.replace(
        inDesktopApp ? "/welcome-redirect?mode=mail" : "/welcome-redirect",
      );
    }
  }, [data, inDesktopApp, isLoading, isPremium, router]);

  return null;
}
