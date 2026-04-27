"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import {
  getAppPageFromPathname,
  getAppPageProperties,
  PRODUCT_ANALYTICS_EVENTS,
  type AppPage,
  type ProductAnalyticsAction,
} from "@/utils/analytics/product";

type AppPageActionProperties = Record<string, unknown>;

export function useProductAnalytics(page?: AppPage) {
  const posthog = usePostHog();
  const pathname = usePathname();
  const inferredPage = page ?? getAppPageFromPathname(pathname);

  return useMemo(
    () => ({
      captureAction: (
        action: ProductAnalyticsAction,
        properties?: AppPageActionProperties,
      ) => {
        if (!inferredPage) return;

        posthog.capture(PRODUCT_ANALYTICS_EVENTS.pageAction, {
          ...getAppPageProperties(inferredPage),
          action,
          ...properties,
        });
      },
    }),
    [inferredPage, posthog],
  );
}
