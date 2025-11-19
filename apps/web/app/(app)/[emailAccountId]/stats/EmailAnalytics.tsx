"use client";

import useSWR from "swr";
import type { DateRange } from "react-day-picker";
import { useExpanded } from "@/app/(app)/[emailAccountId]/stats/useExpanded";
import type { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import type { SendersResponse } from "@/app/api/user/stats/senders/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { getGmailSearchUrl } from "@/utils/url";
import { useAccount } from "@/providers/EmailAccountProvider";
import { BarListCard } from "@/app/(app)/[emailAccountId]/stats/BarListCard";
import { Mail, Send } from "lucide-react";

export function EmailAnalytics(props: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
}) {
  const { userEmail } = useAccount();

  const params = getDateRangeParams(props.dateRange);

  const { data, isLoading, error } = useSWR<SendersResponse, { error: string }>(
    `/api/user/stats/senders?${new URLSearchParams(params as any)}`,
    {
      refreshInterval: props.refreshInterval,
    },
  );

  const {
    data: dataRecipients,
    isLoading: isLoadingRecipients,
    error: errorRecipients,
  } = useSWR<RecipientsResponse, { error: string }>(
    `/api/user/stats/recipients?${new URLSearchParams(params as any)}`,
    {
      refreshInterval: props.refreshInterval,
    },
  );

  const { expanded, extra } = useExpanded();

  return (
    <div className="grid gap-2 sm:gap-4 sm:grid-cols-2">
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {data && (
          <BarListCard
            icon={
              <Mail className="size-4 text-neutral-500 translate-y-[-0.5px]" />
            }
            title="RECEIVED"
            tabs={[
              {
                id: "emailAddress",
                label: "Email address",
                data: data.mostActiveSenderEmails
                  ?.slice(0, expanded ? undefined : 5)
                  .map((d) => ({
                    ...d,
                    href: getGmailSearchUrl(d.name, userEmail),
                    target: "_blank",
                  })),
              },
              {
                id: "domain",
                label: "Domain",
                data: data.mostActiveSenderDomains
                  ?.slice(0, expanded ? undefined : 5)
                  .map((d) => ({
                    ...d,
                    href: getGmailSearchUrl(d.name, userEmail),
                    target: "_blank",
                  })),
              },
            ]}
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
          <BarListCard
            icon={<Send className="size-4 text-neutral-500" />}
            title="SENT"
            tabs={[
              {
                id: "emailAddress",
                label: "Email address",
                data:
                  dataRecipients.mostActiveRecipientEmails
                    ?.slice(0, expanded ? undefined : 5)
                    .map((d) => ({
                      ...d,
                      href: getGmailSearchUrl(d.name, userEmail),
                      target: "_blank",
                    })) || [],
              },
            ]}
            extra={extra}
          />
        )}
      </LoadingContent>
    </div>
  );
}
