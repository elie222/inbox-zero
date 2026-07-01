"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { subDays } from "date-fns/subDays";
import { startOfDay } from "date-fns/startOfDay";
import { ArrowRightIcon, MailXIcon, SparklesIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Progress } from "@/components/ui/progress";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { BulkUnsubscribeIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/BulkUnsubscribeIllustration";
import {
  getUnsubscribeSuggestions,
  hasAutomaticUnsubscribeLink,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import { useBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/hooks/usePremium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useOnboardingBulkUnsubscribeVariant } from "@/hooks/useFeatureFlags";
import { extractDomainFromEmail } from "@/utils/email";
import { createSearchParams } from "@/utils/url";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const PREVIEW_COUNT = 5;

export function StepBulkUnsubscribe({ onNext }: { onNext: () => void }) {
  const { emailAccountId } = useAccount();
  const posthog = usePostHog();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  // A/B test: "inline-unsubscribe" shows the personalized, actionable list;
  // "control" keeps the static marketing slide. Reading the variant is the
  // experiment exposure.
  const variant = useOnboardingBulkUnsubscribeVariant();
  const isTreatment = variant === "inline-unsubscribe";

  // Day-boundary date range keeps the SWR key stable across mounts, so
  // revisiting this step (back/forward) reuses the cached result.
  const fromDate = useMemo(() => +subDays(startOfDay(new Date()), 90), []);
  // Mirrors the bulk unsubscribe page defaults: last 3 months, unhandled
  // senders, all email types, ordered by email count.
  const params: NewsletterStatsQuery = {
    types: [],
    filters: ["unhandled"],
    orderBy: "emails",
    orderDirection: "desc",
    limit: 50,
    includeMissingUnsubscribe: true,
    fromDate,
  };
  const urlParams = createSearchParams(params);
  const { data, isLoading, mutate } = useSWR<NewsletterStatsResponse>(
    // Only fetch in the treatment arm; control never renders the list.
    isTreatment && emailAccountId
      ? [`/api/user/stats/newsletters?${urlParams}`, emailAccountId]
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const lowReadSuggestions = useMemo(
    () => getUnsubscribeSuggestions(data?.newsletters ?? []),
    [data],
  );
  const suggestions = useMemo(
    () =>
      getUnsubscribeSuggestions(data?.newsletters ?? [], {
        requireAutomaticUnsubscribeLink: true,
      }),
    [data],
  );
  const previewSenders = useMemo(
    () => suggestions.slice(0, PREVIEW_COUNT),
    [suggestions],
  );
  const lowReadSuggestionsWithAutomaticUnsubscribe = useMemo(
    () => lowReadSuggestions.filter(hasAutomaticUnsubscribeLink).length,
    [lowReadSuggestions],
  );

  // Track which previewed senders the user opted out of, so selection needs no
  // effect to mirror the async data load (all previewed start selected).
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { onBulkUnsubscribe } = useBulkUnsubscribe<Newsletter>({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
    filter: "unhandled",
  });

  const selectedSenders = previewSenders.filter(
    (item) => !deselected.has(item.name),
  );

  // Record (once) when the treatment user is actually shown the suggestion
  // list, so we can measure how often the data was ready in time.
  const suggestionsShownRef = useRef(false);
  useEffect(() => {
    if (!isTreatment || suggestionsShownRef.current) return;
    if (!previewSenders.length) return;
    suggestionsShownRef.current = true;
    posthog?.capture("onboarding_unsubscribe_suggestions_shown", {
      variant,
      shownCount: previewSenders.length,
      totalSuggestions: suggestions.length,
      lowReadSuggestionCount: lowReadSuggestions.length,
      lowReadSuggestionWithAutomaticUnsubscribeCount:
        lowReadSuggestionsWithAutomaticUnsubscribe,
      lowReadSuggestionMissingAutomaticUnsubscribeCount:
        lowReadSuggestions.length - lowReadSuggestionsWithAutomaticUnsubscribe,
    });
  }, [
    isTreatment,
    previewSenders.length,
    suggestions.length,
    lowReadSuggestions.length,
    lowReadSuggestionsWithAutomaticUnsubscribe,
    variant,
    posthog,
  ]);

  // Control arm (and PostHog-unavailable fallback) keeps the static slide.
  if (!isTreatment) return <StaticBulkUnsubscribeStep onNext={onNext} />;
  if (!emailAccountId) return null;

  // Don't render the static content while the fetch is in flight, or the
  // screen would swap to the personalized version under the user moments
  // later. A brief blank matches how the onboarding shell loads.
  if (isLoading && !data) return null;

  // On error or with nothing to suggest, fall back to the static marketing
  // content — onboarding must never feel broken.
  if (!suggestions.length) {
    return <StaticBulkUnsubscribeStep onNext={onNext} />;
  }

  const onToggle = (name: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const onSkip = () => {
    posthog?.capture("onboarding_unsubscribe_skipped", {
      variant,
      selectedCount: selectedSenders.length,
      totalSuggestions: suggestions.length,
    });
    onNext();
  };

  const onUnsubscribeSelected = async () => {
    if (!selectedSenders.length) {
      onSkip();
      return;
    }

    posthog?.capture("onboarding_unsubscribe_cta_clicked", {
      variant,
      selectedCount: selectedSenders.length,
      totalSuggestions: suggestions.length,
      hasUnsubscribeAccess,
    });

    if (!hasUnsubscribeAccess) {
      posthog?.capture("onboarding_unsubscribe_upgrade_prompt_shown", {
        variant,
        selectedCount: selectedSenders.length,
        totalSuggestions: suggestions.length,
      });
      openModal();
      return;
    }

    posthog?.capture("onboarding_unsubscribe_clicked", {
      variant,
      count: selectedSenders.length,
      totalSuggestions: suggestions.length,
    });

    setSubmitting(true);
    try {
      await onBulkUnsubscribe(selectedSenders);
    } finally {
      setSubmitting(false);
      onNext();
    }
  };

  const hasMore = suggestions.length > previewSenders.length;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <PageHeading className="mb-3">
            We found {suggestions.length}{" "}
            {suggestions.length === 1 ? "sender" : "senders"} you rarely read
          </PageHeading>
          <TypographyP className="text-muted-foreground">
            We'll unsubscribe and archive these for you. Uncheck any you want to
            keep.
          </TypographyP>
        </div>

        <section
          aria-label="Senders you rarely read"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <ul className="divide-y divide-slate-100 py-1.5">
            {previewSenders.map((item) => (
              <SuggestionRow
                key={item.name}
                item={item}
                checked={!deselected.has(item.name)}
                onToggle={() => onToggle(item.name)}
              />
            ))}
          </ul>
        </section>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
          <SparklesIcon className="size-3.5 text-amber-500" />
          {hasMore
            ? `Showing your top ${previewSenders.length}. We'll keep spotting more as you use Inbox Zero.`
            : "We'll keep spotting more as you use Inbox Zero."}
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="w-full max-w-xs"
            onClick={onUnsubscribeSelected}
            disabled={submitting}
          >
            {submitting && <ButtonLoader />}
            {selectedSenders.length > 0 ? (
              <>
                <MailXIcon className="size-4 mr-2" />
                Unsubscribe from {selectedSenders.length}
              </>
            ) : (
              <>
                Continue
                <ArrowRightIcon className="size-4 ml-2" />
              </>
            )}
          </Button>
          {selectedSenders.length > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={onSkip}
              disabled={submitting}
            >
              Skip for now
            </Button>
          )}
        </div>
      </div>
      <PremiumModal />
    </div>
  );
}

function StaticBulkUnsubscribeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          <BulkUnsubscribeIllustration />
        </div>

        <PageHeading className="mb-3">Bulk unsubscribe and archive</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          See which emails you never read. One-click unsubscribe and archive
          them in bulk.
        </TypographyP>

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestionRow({
  item,
  checked,
  onToggle,
}: {
  item: Newsletter;
  checked: boolean;
  onToggle: () => void;
}) {
  const domain = extractDomainFromEmail(item.name) || item.name;
  const readPercentage =
    item.value > 0 ? Math.round((item.readEmails / item.value) * 100) : 0;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ButtonCheckbox checked={checked} onChange={onToggle} />

      <DomainIcon domain={domain} size={32} variant="circular" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {item.fromName || item.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {item.value} {item.value === 1 ? "email" : "emails"}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <Progress
          value={readPercentage}
          className="h-1.5 w-16 bg-amber-100 dark:bg-amber-950"
          innerClassName="bg-amber-400"
        />
        <span className="w-14 whitespace-nowrap text-xs text-amber-600 dark:text-amber-400 tabular-nums">
          {readPercentage}% read
        </span>
      </div>
    </li>
  );
}
