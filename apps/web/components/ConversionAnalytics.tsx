"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NextScript from "next/script";
import { env } from "@/env";
import { trackClientConversion } from "@/utils/analytics/client-conversions";
import {
  CONVERSION_EVENT_ID_PARAM,
  CONVERSION_EVENT_PARAM,
  type ConversionEventName,
} from "@/utils/analytics/conversion-events";

const ExternalScript = NextScript as unknown as ComponentType<{
  id: string;
  src: string;
  strategy: "afterInteractive";
}>;

export function ConversionAnalyticsScript() {
  if (!env.NEXT_PUBLIC_CONVERSION_ANALYTICS_SCRIPT_URL) return null;

  return (
    <ExternalScript
      id="conversion-analytics"
      src={env.NEXT_PUBLIC_CONVERSION_ANALYTICS_SCRIPT_URL}
      strategy="afterInteractive"
    />
  );
}

export function ConversionQueryParamEvents() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventName = parseConversionEventName(
    searchParams.get(CONVERSION_EVENT_PARAM),
  );
  const eventId = searchParams.get(CONVERSION_EVENT_ID_PARAM) ?? undefined;

  useEffect(() => {
    if (!eventName) return;

    try {
      const storageKey = eventId
        ? `conversion:${eventName}:${eventId}`
        : `conversion:${eventName}:${pathname}`;

      if (hasTrackedConversion(storageKey)) {
        removeConversionParams();
        return;
      }

      trackClientConversion({
        name: eventName,
        id: eventId,
      });

      rememberTrackedConversion(storageKey);
      removeConversionParams();
    } catch (error) {
      console.error("Failed to track conversion event:", error);
      try {
        removeConversionParams();
      } catch (removeError) {
        console.error("Failed to remove conversion params:", removeError);
      }
    }
  }, [eventName, eventId, pathname]);

  return null;
}

function hasTrackedConversion(storageKey: string) {
  try {
    return Boolean(window.sessionStorage.getItem(storageKey));
  } catch {
    return false;
  }
}

function rememberTrackedConversion(storageKey: string) {
  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {}
}

function parseConversionEventName(
  value: string | null,
): ConversionEventName | null {
  if (value === "registration_completed" || value === "trial_started") {
    return value;
  }

  return null;
}

function removeConversionParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete(CONVERSION_EVENT_PARAM);
  url.searchParams.delete(CONVERSION_EVENT_ID_PARAM);
  const pathname = `/${url.pathname.replace(/^\/+/, "")}`;
  window.history.replaceState(null, "", `${pathname}${url.search}${url.hash}`);
}
