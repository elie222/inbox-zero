"use client";

import useSWR from "swr";
import type { DateRange } from "react-day-picker";
import { BarList as TremorBarList, Flex, Text } from "@tremor/react";
import { useExpanded } from "@/app/(app)/[emailAccountId]/stats/useExpanded";
import type { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import type { SendersResponse } from "@/app/api/user/stats/senders/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { BarList } from "@/components/charts/BarList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { getGmailSearchUrl } from "@/utils/url";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
          <Tabs defaultValue="sender">
            <TabsContent value="sender">
              <Card className="h-full bg-background">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Who emails you</CardTitle>
                    <TabsList>
                      <TabsTrigger value="sender">Sender</TabsTrigger>
                      <TabsTrigger value="domain">Domain</TabsTrigger>
                    </TabsList>
                  </div>
                </CardHeader>
                <CardContent>
                  <Flex>
                    <Text>Sender</Text>
                    <Text>Emails</Text>
                  </Flex>
                  <TremorBarList
                    data={data.mostActiveSenderEmails
                      ?.slice(0, expanded ? undefined : 5)
                      .map((d) => ({
                        ...d,
                        href: getGmailSearchUrl(d.name, userEmail),
                        target: "_blank",
                      }))}
                    className="mt-2"
                  />
                  {extra}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="domain">
              <Card className="h-full bg-background">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Who emails you</CardTitle>
                    <TabsList>
                      <TabsTrigger value="sender">Sender</TabsTrigger>
                      <TabsTrigger value="domain">Domain</TabsTrigger>
                    </TabsList>
                  </div>
                </CardHeader>
                <CardContent>
                  <Flex>
                    <Text>Domain</Text>
                    <Text>Emails</Text>
                  </Flex>
                  <TremorBarList
                    data={data.mostActiveSenderDomains
                      ?.slice(0, expanded ? undefined : 5)
                      .map((d) => ({
                        ...d,
                        href: getGmailSearchUrl(d.name, userEmail),
                        target: "_blank",
                      }))}
                    className="mt-2"
                  />
                  {extra}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
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
            col1="Recipient"
            col2="Emails"
            data={
              dataRecipients.mostActiveRecipientEmails
                ?.slice(0, expanded ? undefined : 5)
                .map((d) => ({
                  ...d,
                  href: getGmailSearchUrl(d.name, userEmail),
                  target: "_blank",
                })) || []
            }
            extra={extra}
          />
        )}
      </LoadingContent>
    </div>
  );
}
