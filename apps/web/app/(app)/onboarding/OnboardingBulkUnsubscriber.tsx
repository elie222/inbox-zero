"use client";

import useSWR from "swr";
import Link from "next/link";
import { usePostHog, PostHog } from "posthog-js/react";
import { Suspense, useMemo } from "react";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { LoadingContent } from "@/components/LoadingContent";
import { ProgressBar } from "@tremor/react";
import { ONE_MONTH_MS } from "@/utils/date";
import { useUnsubscribe } from "@/app/(app)/bulk-unsubscribe/hooks";
import { NewsletterStatus } from "@prisma/client";

const useNewsletterStats = () => {
  const now = useMemo(() => Date.now(), []);
  const params: NewsletterStatsQuery = {
    types: [],
    filters: [],
    orderBy: "emails",
    limit: 50,
    includeMissingUnsubscribe: false,
    fromDate: now - ONE_MONTH_MS,
  };
  const urlParams = new URLSearchParams(params as any);
  return useSWR<NewsletterStatsResponse, { error: string }>(
    `/api/user/stats/newsletters?${urlParams}`,
  );
};

export function OnboardingBulkUnsubscriber() {
  const { data, isLoading, error, mutate } = useNewsletterStats();

  const posthog = usePostHog();

  const sortedNewsletters = useMemo(() => {
    return (
      data?.newsletters
        .map((row) => {
          const readPercentage = (row.readEmails / row.value) * 100;

          return {
            ...row,
            readPercentage,
          };
        })
        // sort by lowest read percentage
        // if tied, sort by most unread emails
        .sort((a, b) => {
          if (a.readPercentage === b.readPercentage) {
            const aUnread = a.value - a.readEmails;
            const bUnread = b.value - b.readEmails;
            return bUnread - aUnread;
          }

          return a.readPercentage - b.readPercentage;
        })
        .slice(0, 5)
    );
  }, [data?.newsletters]);

  return (
    <>
      <Card className="overflow-hidden">
        <LoadingContent loading={isLoading} error={error}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedNewsletters?.map((row) => (
                <UnsubscribeRow
                  key={row.name}
                  row={row}
                  posthog={posthog}
                  mutate={mutate}
                />
              ))}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </>
  );
}

function UnsubscribeRow({
  row,
  posthog,
  mutate,
}: {
  row: NewsletterStatsResponse["newsletters"][number];
  posthog: PostHog;
  mutate: () => Promise<any>;
}) {
  const { unsubscribeLoading, onUnsubscribe, unsubscribeLink } = useUnsubscribe(
    {
      item: row,
      hasUnsubscribeAccess: true,
      mutate,
      refetchPremium: () => Promise.resolve(),
      posthog,
    },
  );

  const parseEmail = (name: string) => {
    const match = name.match(/<(.+)>/);
    return match ? match[1] : name;
  };
  const name = row.name.split("<")[0].trim();
  const email = parseEmail(row.name);

  const readPercentage = row.value ? (row.readEmails / row.value) * 100 : 0;
  const archivedEmails = row.value - row.inboxEmails;
  const archivedPercentage = row.value ? (archivedEmails / row.value) * 100 : 0;

  const isUnsubscribed = row.status === NewsletterStatus.UNSUBSCRIBED;

  return (
    <TableRow key={row.name}>
      <TableCell>
        <div>{name}</div>
        <div className="text-slate-500">{email}</div>
      </TableCell>
      <TableCell>{row.value}</TableCell>
      <TableCell>
        <ProgressBar
          value={readPercentage}
          label={`${Math.round(readPercentage)}%`}
          color="blue"
          className="w-[150px]"
        />
      </TableCell>
      <TableCell>
        <ProgressBar
          value={archivedPercentage}
          label={`${Math.round(archivedPercentage)}%`}
          color="blue"
          className="w-[150px]"
        />
      </TableCell>
      <TableCell>
        <Button
          disabled={isUnsubscribed}
          variant={isUnsubscribed ? "outline" : "default"}
          loading={unsubscribeLoading}
          asChild
        >
          <Link
            href={unsubscribeLink}
            target={unsubscribeLink !== "#" ? "_blank" : undefined}
            rel="noreferrer"
            onClick={() => {
              onUnsubscribe();
              mutate();
            }}
          >
            {isUnsubscribed ? "Unsubscribed" : "Unsubscribe"}
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
