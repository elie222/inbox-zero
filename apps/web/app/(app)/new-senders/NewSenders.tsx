"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { usePostHog } from "posthog-js/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import groupBy from "lodash/groupBy";
import { FilterIcon, Users2Icon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import type {
  NewSendersQuery,
  NewSendersResponse,
} from "@/app/api/user/stats/new-senders/route";
import { formatShortDate } from "@/utils/date";
import { formatStat } from "@/utils/stats";
import { StatsCards } from "@/components/StatsCards";
import { ActionCell, HeaderButton } from "@/app/(app)/bulk-unsubscribe/common";
import {
  useNewsletterFilter,
  useBulkUnsubscribeShortcuts,
} from "@/app/(app)/bulk-unsubscribe/hooks";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { usePremium } from "@/components/PremiumAlert";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useLabels } from "@/hooks/useLabels";
import type { UserLabel } from "@/hooks/useLabels";
import { ShortcutTooltip } from "@/app/(app)/bulk-unsubscribe/ShortcutTooltip";
import type { Row } from "@/app/(app)/bulk-unsubscribe/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils";

export function NewSenders({ refreshInterval }: { refreshInterval: number }) {
  const session = useSession();
  const userEmail = session.data?.user.email || "";

  const [sortColumn, setSortColumn] = useState<
    "subject" | "date" | "numberOfEmails"
  >("numberOfEmails");

  // const { typesArray, types, setTypes } = useEmailsToIncludeFilter();
  const { filtersArray, filters, setFilters } = useNewsletterFilter();

  const params: NewSendersQuery = { cutOffDate: 0, filters: filtersArray };
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading, error, mutate } = useSWR<
    NewSendersResponse,
    { error: string }
  >(`/api/user/stats/new-senders?${urlParams}`, {
    keepPreviousData: true,
  });

  const groupedSenders = groupBy(data?.emails, (email) => email.fromDomain);
  const newSenders = Object.entries(groupedSenders);

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { userLabels } = useLabels();

  const { expanded, extra } = useExpanded();
  const posthog = usePostHog();
  const [openedNewsletter, setOpenedNewsletter] = React.useState<Row>();
  const onOpenNewsletter = (newsletter: Row) => {
    setOpenedNewsletter(newsletter);
    posthog?.capture("Clicked Expand Sender");
  };

  const [selectedRow, setSelectedRow] = React.useState<Row | undefined>();

  const rows: (Row & {
    firstEmail: {
      from: string;
      subject: string;
      timestamp: number;
    };
    numberOfEmails: number;
  })[] = newSenders.map(([_, emails]) => {
    const firstEmail = emails[0];
    return {
      ...firstEmail,
      firstEmail,
      numberOfEmails: emails.length,
    };
  });

  useBulkUnsubscribeShortcuts({
    newsletters: rows,
    selectedRow,
    onOpenNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
  });

  const { openModal, PremiumModal } = usePremiumModal();

  return (
    <>
      <LoadingContent
        loading={!data && isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-24 rounded" />}
      >
        <StatsCards
          stats={[
            {
              name: "New senders this week",
              value: formatStat(newSenders.length),
              subvalue: "senders",
              icon: <Users2Icon className="size-4" />,
            },
          ]}
        />
      </LoadingContent>
      <Card className="mt-2 sm:mt-4">
        <CardHeader className="flex-col space-y-0 px-2 pt-2 sm:px-6 sm:pt-4 md:flex md:flex-row md:items-center md:justify-between md:space-y-0">
          <CardTitle className="text-left">New Senders</CardTitle>
          <div className="ml-0 mt-3 flex justify-end space-x-2 md:ml-4 md:mt-0">
            <div className="hidden md:block">
              <ShortcutTooltip />
            </div>

            <DetailedStatsFilter
              label="Filter"
              icon={<FilterIcon className="mr-2 size-4" />}
              keepOpenOnSelect
              columns={[
                {
                  label: "Unhandled",
                  checked: filters.unhandled,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      unhandled: !filters.unhandled,
                    }),
                },
                {
                  label: "Auto Archived",
                  checked: filters.autoArchived,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      autoArchived: !filters.autoArchived,
                    }),
                },
                {
                  label: "Unsubscribed",
                  checked: filters.unsubscribed,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      unsubscribed: !filters.unsubscribed,
                    }),
                },
                {
                  label: "Approved",
                  checked: filters.approved,
                  setChecked: () =>
                    setFilters({ ...filters, approved: !filters.approved }),
                },
              ]}
            />

            {/* <EmailsToIncludeFilter types={types} setTypes={setTypes} /> */}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <LoadingContent
            loading={!data && isLoading}
            error={error}
            loadingComponent={<Skeleton className="m-4 h-screen rounded" />}
          >
            {newSenders && (
              <NewSendersTable
                sortColumn={sortColumn}
                setSortColumn={setSortColumn}
                tableRows={rows
                  .slice(0, expanded ? undefined : 50)
                  .map((item) => {
                    return (
                      <NewSenderRow
                        key={item.name}
                        item={item}
                        userEmail={userEmail}
                        firstEmail={item.firstEmail}
                        numberOfEmails={item.numberOfEmails}
                        onOpenNewsletter={onOpenNewsletter}
                        labels={userLabels}
                        mutate={mutate}
                        selected={selectedRow?.name === item.name}
                        onSelectRow={() => {
                          setSelectedRow(item);
                        }}
                        hasUnsubscribeAccess={hasUnsubscribeAccess}
                        refetchPremium={refetchPremium}
                        openPremiumModal={openModal}
                      />
                    );
                  })}
              />
            )}
            <div className="mt-2 px-6 pb-6">{extra}</div>
          </LoadingContent>
        </CardContent>
      </Card>
      <NewsletterModal
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletter(undefined)}
        refreshInterval={refreshInterval}
      />
      <PremiumModal />
    </>
  );
}

function NewSendersTable({
  tableRows,
  sortColumn,
  setSortColumn,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "subject" | "date" | "numberOfEmails";
  setSortColumn: (sortColumn: "subject" | "date" | "numberOfEmails") => void;
}) {
  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">
            <span className="text-sm font-medium">From</span>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "subject"}
              onClick={() => setSortColumn("subject")}
            >
              Subject
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "date"}
              onClick={() => setSortColumn("date")}
            >
              Date
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "numberOfEmails"}
              onClick={() => setSortColumn("numberOfEmails")}
            >
              Emails
            </HeaderButton>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>{tableRows}</TableBody>
    </Table>
  );
}

function NewSenderRow({
  item,
  firstEmail,
  numberOfEmails,
  refetchPremium,
  openPremiumModal,
  onOpenNewsletter,
  selected,
  onSelectRow,
  hasUnsubscribeAccess,
  mutate,
  userEmail,
  labels,
}: {
  item: Row;
  firstEmail: { from: string; subject: string; timestamp: number };
  userEmail: string;
  numberOfEmails: number;
  onOpenNewsletter: (row: Row) => void;
  labels: UserLabel[];
  mutate: () => Promise<any>;
  selected: boolean;
  onSelectRow: () => void;
  hasUnsubscribeAccess: boolean;
  refetchPremium: () => Promise<any>;
  openPremiumModal: () => void;
}) {
  return (
    <TableRow
      key={item.name}
      className={cn(selected && "bg-blue-50 dark:bg-muted/50")}
      aria-selected={selected || undefined}
      data-selected={selected || undefined}
      onMouseEnter={onSelectRow}
    >
      <TableCell className="max-w-[200px] truncate pl-6 lg:max-w-[300px]">
        {firstEmail.from}
      </TableCell>
      <TableCell className="max-w-[300px] truncate lg:max-w-[400px]">
        {firstEmail.subject}
      </TableCell>
      <TableCell>{formatShortDate(new Date(firstEmail.timestamp))}</TableCell>
      <TableCell className="text-center">{numberOfEmails}</TableCell>
      <TableCell className="flex justify-end gap-2 p-2">
        <ActionCell
          item={item}
          userEmail={userEmail}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          refetchPremium={refetchPremium}
          onOpenNewsletter={onOpenNewsletter}
          selected={selected}
          labels={labels}
          openPremiumModal={openPremiumModal}
        />
      </TableCell>
    </TableRow>
  );
}
