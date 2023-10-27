"use client";

import { capitalCase } from "capital-case";
import { sortBy } from "lodash";
import useSWRImmutable from "swr/immutable";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { CategoryStatsResponse } from "@/app/api/user/stats/categories/route";
import { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import { SendersResponse } from "@/app/api/user/stats/senders/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { BarList } from "@/components/charts/BarList";

export function EmailAnalytics() {
  const { data, isLoading, error } = useSWRImmutable<
    SendersResponse,
    { error: string }
  >(`/api/user/stats/senders`);
  const {
    data: dataRecipients,
    isLoading: isLoadingRecipients,
    error: errorRecipients,
  } = useSWRImmutable<RecipientsResponse, { error: string }>(
    `/api/user/stats/recipients`
  );
  const {
    data: dataCategories,
    isLoading: isLoadingCategories,
    error: errorCategories,
  } = useSWRImmutable<CategoryStatsResponse, { error: string }>(
    `/api/user/stats/categories`
  );

  const { expanded, extra } = useExpanded();

  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {data && (
          <BarList
            title="Who emails you most"
            // subtitle="Last 50 emails"
            col1="Sender"
            col2="Emails"
            data={data.mostActiveSenderEmails.slice(
              0,
              expanded ? undefined : 5
            )}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {data && (
          <BarList
            title="Domains that email you most"
            // subtitle="Last 50 emails"
            col1="Domain"
            col2="Emails"
            data={data.mostActiveSenderDomains.slice(
              0,
              expanded ? undefined : 5
            )}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoadingRecipients}
        error={errorRecipients}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {dataRecipients && (
          <BarList
            title="Who you email the most"
            // subtitle="Last 50 emails"
            col1="Recipient"
            col2="Emails"
            data={dataRecipients.mostActiveRecipientEmails.slice(
              0,
              expanded ? undefined : 5
            )}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoadingCategories}
        error={errorCategories}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {dataCategories && (
          <BarList
            title="Types of email you're receiving"
            // subtitle="Last 50 threads"
            col1="Category"
            col2="Emails"
            data={sortBy(
              Object.entries(dataCategories.countByCategory),
              ([, count]) => -count
            )
              .slice(0, expanded ? undefined : 5)
              .map(([category, count]) => ({
                name:
                  category === "undefined"
                    ? "Uncategorized"
                    : capitalCase(category),
                value: count,
              }))}
            extra={extra}
          />
        )}
      </LoadingContent>
    </div>
  );
}
