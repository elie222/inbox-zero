"use client";

import useSWR from "swr";
import { Suspense, useMemo, useState } from "react";
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

const useNewsletterStats = () => {
  const now = useMemo(() => Date.now(), []);
  const params: NewsletterStatsQuery = {
    types: [],
    filters: [],
    orderBy: "unarchived",
    limit: 5,
    includeMissingUnsubscribe: false,
    fromDate: now - ONE_MONTH_MS,
  };
  const urlParams = new URLSearchParams(params as any);
  return useSWR<NewsletterStatsResponse, { error: string }>(
    `/api/user/stats/newsletters?${urlParams}`,
  );
};

export function OnboardingBulkUnsubscriber() {
  const [unsubscribed, setUnsubscribed] = useState<string[]>([]);
  const { data, isLoading, error } = useNewsletterStats();

  // const rows = [
  //   {
  //     email: "test@test.com",
  //     emails: 39,
  //     read: 25,
  //     archived: 10,
  //   },
  //   {
  //     email: "test2@test.com",
  //     emails: 39,
  //     read: 25,
  //     archived: 10,
  //   },
  //   {
  //     email: "test3@test.com",
  //     emails: 39,
  //     read: 25,
  //     archived: 10,
  //   },
  // ];

  return (
    <div className="relative">
      <Card className="overflow-visible">
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
              {data?.newsletters.map((row) => {
                const splitIndex = row.name.split("<");
                const name = splitIndex[0].trim();
                const email = splitIndex[1].split(">")[0].trim();

                const readPercentage = (row.readEmails / row.value) * 100;
                const archivedEmails = row.value - row.inboxEmails;
                const archivedPercentage = (archivedEmails / row.value) * 100;

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
                        disabled={unsubscribed.includes(row.name)}
                        onClick={() => {
                          setUnsubscribed((currentUnsubscribed) => [
                            ...currentUnsubscribed,
                            row.name,
                          ]);
                        }}
                      >
                        {unsubscribed.includes(row.name)
                          ? "Unsubscribed"
                          : "Unsubscribe"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </div>
  );
}
