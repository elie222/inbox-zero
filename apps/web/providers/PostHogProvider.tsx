"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useSession } from "@/utils/auth-client";
import { usePathname, useSearchParams } from "next/navigation";
import { env } from "@/env";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  getAppPageViewProperties,
  getPageViewSearch,
  stripUntrackedUrlParams,
  PRODUCT_ANALYTICS_EVENTS,
} from "@/utils/analytics/product";
import { getClientAnalyticsProperties } from "@/utils/analytics/client";
import { clearPendingAuthProvider } from "@/utils/analytics/auth-funnel";
import { startDesktopHealthReporting } from "@/utils/analytics/desktop-health";
import { ONE_DAY_MS } from "@/utils/date";
import { scheduleAfterPageLoad } from "@/utils/schedule-after-page-load";

// based on: https://posthog.com/docs/libraries/next-js

export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageViewSearch = getPageViewSearch(searchParams);

  useEffect(() => {
    if (!pathname) return;

    const query = pageViewSearch ? `?${pageViewSearch}` : "";
    posthog.capture("$pageview", {
      $current_url: `${window.origin}${pathname}${query}`,
    });

    const appPageProperties = getAppPageViewProperties({
      pathname,
      searchParams: new URLSearchParams(pageViewSearch),
    });
    if (appPageProperties) {
      posthog.capture(PRODUCT_ANALYTICS_EVENTS.pageViewed, appPageProperties);
    }
  }, [pathname, pageViewSearch]);

  return null;
}

export function PostHogIdentify() {
  const { data: session } = useSession();
  const { emailAccount } = useAccount();
  const userEmail = session?.user.email;
  const userCreatedAt = session?.user.createdAt;

  useEffect(() => {
    if (!userEmail) return;

    clearPendingAuthProvider();

    const signedUpOverOneDayAgo =
      !!userCreatedAt &&
      Date.now() - new Date(userCreatedAt).getTime() > ONE_DAY_MS;

    posthog.identify(userEmail, {
      email: userEmail,
      ...(signedUpOverOneDayAgo && { signed_up_over_1_day: true }),
    });
  }, [userCreatedAt, userEmail]);

  useEffect(() => {
    // Set super properties that will be included with all events
    posthog.register({
      email_account_id: emailAccount?.id,
      email_account_email: emailAccount?.email,
      email_account_provider: emailAccount?.account?.provider,
    });

    // Most users only use one email account, and it's helpful to have the provider on the person property
    if (emailAccount) {
      posthog.setPersonProperties(
        {},
        {
          default_email_account_provider: emailAccount?.account?.provider,
        },
      );
    }
  }, [emailAccount]);

  return null;
}

if (typeof window !== "undefined" && env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_API_HOST, // https://posthog.com/docs/advanced/proxy/nextjs
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
    disable_session_recording: true,
    disable_surveys: true,
    before_send: stripUntrackedUrlParams,
  });
  posthog.register(getClientAnalyticsProperties());
  startDesktopHealthReporting();
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      {children}
      <DeferredPostHogFeatures />
    </PHProvider>
  );
}

let deferredFeaturesEnabled = false;

function DeferredPostHogFeatures() {
  useEffect(() => {
    if (!env.NEXT_PUBLIC_POSTHOG_KEY || deferredFeaturesEnabled) return;

    const enableDeferredFeatures = () => {
      if (deferredFeaturesEnabled) return;

      deferredFeaturesEnabled = true;
      posthog.set_config({
        disable_session_recording: false,
        disable_surveys: false,
      });
      posthog.reloadFeatureFlags();
    };

    return scheduleAfterPageLoad(enableDeferredFeatures, {
      fallbackDelay: 2000,
      idleTimeout: 5000,
    });
  }, []);

  return null;
}
