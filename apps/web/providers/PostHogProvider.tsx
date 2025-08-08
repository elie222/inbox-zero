"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useSession } from "@/utils/auth-client";
import { usePathname, useSearchParams } from "next/navigation";
import { env } from "@/env";

// based on: https://posthog.com/docs/libraries/next-js

export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      posthog.capture("$pageview", {
        $current_url: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogIdentify() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user.email)
      posthog.identify(session.user.email, {
        email: session.user.email,
      });
  }, [session?.user.email]);

  return null;
}

if (typeof window !== "undefined" && env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_API_HOST, // https://posthog.com/docs/advanced/proxy/nextjs
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
