"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import { FilterIcon } from "lucide-react";
import { Title } from "@tremor/react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { getDateRangeParams } from "@/app/(app)/stats/params";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import {
  EmailsToIncludeFilter,
  useEmailsToIncludeFilter,
} from "@/app/(app)/stats/EmailsToIncludeFilter";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { usePremium } from "@/components/PremiumAlert";
import {
  useNewsletterFilter,
  useBulkUnsubscribeShortcuts,
} from "@/app/(app)/bulk-unsubscribe/common";
import BulkUnsubscribeSummary from "@/app/(app)/bulk-unsubscribe/BulkUnsubscribeSummary";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { Toggle } from "@/components/Toggle";
import { useLabels } from "@/hooks/useLabels";
import {
  BulkUnsubscribeMobile,
  BulkUnsubscribeRowMobile,
} from "@/app/(app)/bulk-unsubscribe/BulkUnsubscribeMobile";
import {
  BulkUnsubscribeDesktop,
  BulkUnsubscribeRowDesktop,
} from "@/app/(app)/bulk-unsubscribe/BulkUnsubscribeDesktop";
import { Card } from "@/components/ui/card";
import { ShortcutTooltip } from "@/app/(app)/bulk-unsubscribe/ShortcutTooltip";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export function BulkUnsubscribeSection(props: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
}) {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "";

  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");

  const { typesArray, types, setTypes } = useEmailsToIncludeFilter();
  const { filtersArray, filters, setFilters } = useNewsletterFilter();
  const [includeMissingUnsubscribe, setIncludeMissingUnsubscribe] =
    useState(false);

  const params: NewsletterStatsQuery = {
    types: typesArray,
    filters: filtersArray,
    orderBy: sortColumn,
    limit: 100,
    includeMissingUnsubscribe,
    ...getDateRangeParams(props.dateRange),
  };
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading, error, mutate } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval: props.refreshInterval,
    keepPreviousData: true,
  });

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const { expanded, extra } = useExpanded();
  const [openedNewsletter, setOpenedNewsletter] = React.useState<Newsletter>();

  const [selectedRow, setSelectedRow] = React.useState<
    Newsletter | undefined
  >();

  useBulkUnsubscribeShortcuts({
    newsletters: data?.newsletters,
    selectedRow,
    setOpenedNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
  });

  const { isLoading: isStatsLoading } = useStatLoader();

  const { userLabels } = useLabels();

  const { PremiumModal, openModal } = usePremiumModal();

  const windowSize = useWindowSize();

  const isMobile = windowSize.width < 768;

  const RowComponent = isMobile
    ? BulkUnsubscribeRowMobile
    : BulkUnsubscribeRowDesktop;

  const tableRows = data?.newsletters
    .slice(0, expanded ? undefined : 50)
    .map((item) => (
      <RowComponent
        key={item.name}
        item={item}
        userEmail={userEmail}
        setOpenedNewsletter={setOpenedNewsletter}
        userGmailLabels={userLabels}
        mutate={mutate}
        selected={selectedRow?.name === item.name}
        onSelectRow={() => {
          setSelectedRow(item);
        }}
        onDoubleClick={() => setOpenedNewsletter(item)}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        openPremiumModal={openModal}
      />
    ));

  return (
    <>
      {!isMobile && <BulkUnsubscribeSummary />}
      <Card className="mt-2 p-0 sm:mt-4">
        <div className="items-center justify-between px-2 pt-2 sm:px-6 sm:pt-6 md:flex">
          <Title>Bulk Unsubscribe</Title>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1 sm:gap-2 md:mt-0 lg:flex-nowrap">
            <div className="hidden md:block">
              <ShortcutTooltip />
            </div>

            <Toggle
              label="Missing unsubscribe"
              name="missing-unsubscribe"
              enabled={includeMissingUnsubscribe}
              onChange={() => {
                setIncludeMissingUnsubscribe(!includeMissingUnsubscribe);
              }}
            />

            <DetailedStatsFilter
              label="Filter"
              icon={<FilterIcon className="mr-2 h-4 w-4" />}
              keepOpenOnSelect
              columns={[
                {
                  label: "Unhandled",
                  checked: filters.unhandled,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      ["unhandled"]: !filters.unhandled,
                    }),
                },
                {
                  label: "Auto Archived",
                  checked: filters.autoArchived,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      ["autoArchived"]: !filters.autoArchived,
                    }),
                },
                {
                  label: "Unsubscribed",
                  checked: filters.unsubscribed,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      ["unsubscribed"]: !filters.unsubscribed,
                    }),
                },
                {
                  label: "Approved",
                  checked: filters.approved,
                  setChecked: () =>
                    setFilters({ ...filters, ["approved"]: !filters.approved }),
                },
              ]}
            />

            <EmailsToIncludeFilter types={types} setTypes={setTypes} />
          </div>
        </div>

        {isStatsLoading && !isLoading && !data?.newsletters.length ? (
          <div className="p-4">
            <Skeleton className="h-screen rounded" />
          </div>
        ) : (
          <LoadingContent
            loading={!data && isLoading}
            error={error}
            loadingComponent={
              <div className="p-4">
                <Skeleton className="h-screen rounded" />
              </div>
            }
          >
            {isMobile ? (
              <BulkUnsubscribeMobile tableRows={tableRows} />
            ) : (
              <BulkUnsubscribeDesktop
                sortColumn={sortColumn}
                setSortColumn={setSortColumn}
                tableRows={tableRows}
              />
            )}
            <div className="mt-2 px-6 pb-6">{extra}</div>
          </LoadingContent>
        )}
      </Card>
      <NewsletterModal
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletter(undefined)}
        refreshInterval={props.refreshInterval}
      />
      <PremiumModal />
    </>
  );
}
