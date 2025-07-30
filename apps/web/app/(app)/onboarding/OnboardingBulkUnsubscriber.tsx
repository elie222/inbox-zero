"use client";

import useSWR from "swr";
import Link from "next/link";
import { usePostHog, type PostHog } from "posthog-js/react";
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
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { LoadingContent } from "@/components/LoadingContent";
import { ProgressBar } from "@tremor/react";
import { ONE_MONTH_MS } from "@/utils/date";
import { useUnsubscribe } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { NewsletterStatus } from "@prisma/client";
import { EmailCell } from "@/components/EmailCell";
import { useAccount } from "@/providers/EmailAccountProvider";

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
    {
      refreshInterval: 3000,
      keepPreviousData: true,
    },
  );
};

export function OnboardingBulkUnsubscriber() {
  const { data, isLoading, error, mutate } = useNewsletterStats();
  const { emailAccountId } = useAccount();

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
          {sortedNewsletters?.length ? (
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
                {sortedNewsletters.map((row) => (
                  <UnsubscribeRow
                    key={row.name}
                    row={row}
                    posthog={posthog}
                    mutate={mutate}
                    emailAccountId={emailAccountId}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-8">
              <p className="text-center text-base text-slate-700">
                No emails found
              </p>
              <Button className="mt-4" onClick={() => mutate()}>
                Reload
              </Button>
            </div>
          )}
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
  emailAccountId,
}: {
  row: NewsletterStatsResponse["newsletters"][number];
  posthog: PostHog;
  mutate: () => Promise<any>;
  emailAccountId: string;
}) {
  const { unsubscribeLoading, onUnsubscribe, unsubscribeLink } = useUnsubscribe(
    {
      item: row,
      hasUnsubscribeAccess: true,
      mutate,
      refetchPremium: () => Promise.resolve(),
      posthog,
      emailAccountId,
    },
  );

  const readPercentage = row.value ? (row.readEmails / row.value) * 100 : 0;
  const archivedEmails = row.value - row.inboxEmails;
  const archivedPercentage = row.value ? (archivedEmails / row.value) * 100 : 0;

  const isUnsubscribed = row.status === NewsletterStatus.UNSUBSCRIBED;
  const hasUnsubscribeLink = unsubscribeLink !== "#";

  return (
    <TableRow key={row.name}>
      <TableCell>
        <EmailCell emailAddress={row.name} />
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
            {isUnsubscribed
              ? hasUnsubscribeLink
                ? "Unsubscribed"
                : "Blocked"
              : hasUnsubscribeLink
                ? "Unsubscribe"
                : "Block"}
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
