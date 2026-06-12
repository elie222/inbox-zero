"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { subDays } from "date-fns/subDays";
import { startOfDay } from "date-fns/startOfDay";
import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { BulkUnsubscribeIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/BulkUnsubscribeIllustration";
import { getUnsubscribeSuggestions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { extractDomainFromEmail } from "@/utils/email";
import { prefixPath } from "@/utils/path";

const PREVIEW_COUNT = 5;

export function StepBulkUnsubscribe({ onNext }: { onNext: () => void }) {
  const { emailAccountId } = useAccount();

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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading } = useSWR<NewsletterStatsResponse>(
    `/api/user/stats/newsletters?${urlParams}`,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const suggestions = useMemo(
    () => getUnsubscribeSuggestions(data?.newsletters ?? []),
    [data],
  );

  // Don't render the static content while the fetch is in flight, or the
  // screen would swap to the personalized version under the user moments
  // later. A brief blank matches how the onboarding shell loads.
  if (isLoading && !data) return null;

  // On error or with nothing to suggest, fall back to the static marketing
  // content — onboarding must never feel broken.
  if (!suggestions.length) {
    return <StaticBulkUnsubscribeStep onNext={onNext} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <PageHeading className="mb-3">
            We found {suggestions.length}{" "}
            {suggestions.length === 1 ? "sender" : "senders"} you rarely read
          </PageHeading>
          <TypographyP className="text-muted-foreground">
            One-click unsubscribe and archive them in bulk.
          </TypographyP>
        </div>

        <section
          aria-label="Senders you rarely read"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <ul className="divide-y divide-slate-100 py-1.5">
            {suggestions.slice(0, PREVIEW_COUNT).map((item) => (
              <SuggestionRow key={item.name} item={item} />
            ))}
          </ul>
        </section>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          No rush — you can clean these up after setup.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button size="lg" className="w-full max-w-xs" onClick={onNext}>
            Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
          <Button variant="link" size="sm" asChild>
            <Link
              href={prefixPath(
                emailAccountId,
                "/bulk-unsubscribe?select=suggested",
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Bulk Unsubscriber
              <ExternalLinkIcon className="size-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
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
}: {
  item: NewsletterStatsResponse["newsletters"][number];
}) {
  const domain = extractDomainFromEmail(item.name) || item.name;
  const readPercentage =
    item.value > 0 ? Math.round((item.readEmails / item.value) * 100) : 0;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
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
