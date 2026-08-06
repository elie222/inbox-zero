"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { subDays } from "date-fns/subDays";
import { startOfDay } from "date-fns/startOfDay";
import { getUnsubscribeSuggestions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import type { StatsByPeriodResponse } from "@/app/api/user/stats/by-period/controller";
import type { OnboardingScan } from "@/app/api/chat/onboarding/validation";
import { createSearchParams } from "@/utils/url";

const SHOWN_UNSUBSCRIBE_COUNT = 6;
const VOLUME_WINDOW_DAYS = 28;

export type Newsletter = NewsletterStatsResponse["newsletters"][number];

// The "inbox scan" behind the onboarding chat: email volume plus newsletter
// cleanup suggestions. EmailStatsPreloader kicks off ingestion at mount, so
// these fill in while the user answers the first questions.
export function useInboxScan({
  emailAccountId,
}: {
  emailAccountId: string | null;
}) {
  const fromDate = useMemo(() => +subDays(startOfDay(new Date()), 90), []);
  const volumeFromDate = useMemo(
    () => +subDays(startOfDay(new Date()), VOLUME_WINDOW_DAYS),
    [],
  );

  const newsletterParams: NewsletterStatsQuery = {
    types: [],
    filters: ["unhandled"],
    orderBy: "emails",
    orderDirection: "desc",
    limit: 50,
    includeMissingUnsubscribe: true,
    fromDate,
  };
  const { data: newsletterData, mutate: mutateNewsletters } =
    useSWR<NewsletterStatsResponse>(
      emailAccountId
        ? [
            `/api/user/stats/newsletters?${createSearchParams(newsletterParams)}`,
            emailAccountId,
          ]
        : null,
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
      },
    );

  const {
    data: volumeData,
    isLoading: isVolumeLoading,
    error: volumeError,
  } = useSWR<StatsByPeriodResponse>(
    emailAccountId
      ? [
          `/api/user/stats/by-period?${createSearchParams({
            period: "week",
            fromDate: volumeFromDate,
          })}`,
          emailAccountId,
        ]
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const suggestions = useMemo(
    () =>
      getUnsubscribeSuggestions(newsletterData?.newsletters ?? [], {
        requireAutomaticUnsubscribeLink: true,
      }),
    [newsletterData],
  );
  const shownSenders = useMemo(
    () => suggestions.slice(0, SHOWN_UNSUBSCRIBE_COUNT),
    [suggestions],
  );

  const volume = useMemo(() => {
    if (!volumeData) return null;
    const received = volumeData.result.reduce(
      (sum, row) => sum + Math.max(0, row.All - row.Sent),
      0,
    );
    // A zero count almost always means stats haven't been ingested yet, not an
    // actually empty inbox; treat it as no data rather than revealing "0 a day"
    if (received === 0) return null;
    return {
      emailsLastMonth: received,
      emailsPerDay: Math.round(received / VOLUME_WINDOW_DAYS),
    };
  }, [volumeData]);

  // Status tracks the volume reveal only; cleanup suggestions load
  // independently and the model just checks whether any exist.
  const volumeReady =
    Boolean(volumeData) || Boolean(volumeError) || !isVolumeLoading;

  const scan: OnboardingScan = {
    status: !volumeReady ? "pending" : volume ? "ready" : "unavailable",
    emailsPerDay: volume?.emailsPerDay ?? null,
    emailsLastMonth: volume?.emailsLastMonth ?? null,
    cleanupSuggestions: shownSenders.map((sender) => ({
      name: sender.fromName || sender.name,
      emailCount: sender.value,
      readPercent:
        sender.value > 0
          ? Math.round((sender.readEmails / sender.value) * 100)
          : 0,
    })),
    totalCleanupSuggestions: suggestions.length,
  };

  return {
    scan,
    suggestions,
    shownSenders,
    mutateNewsletters,
  };
}
