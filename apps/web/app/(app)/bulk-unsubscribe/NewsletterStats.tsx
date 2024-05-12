"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import {
  Card,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@tremor/react";
import { FilterIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import {
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
import { LabelsResponse } from "@/app/api/google/labels/route";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { usePremium } from "@/components/PremiumAlert";
import {
  useNewsletterFilter,
  useNewsletterShortcuts,
  ShortcutTooltip,
  SectionHeader,
  ActionCell,
  HeaderButton,
} from "@/app/(app)/bulk-unsubscribe/common";
import NewsletterSummary from "@/app/(app)/bulk-unsubscribe/NewsletterSummary";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { Toggle } from "@/components/Toggle";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export function NewsletterStats(props: {
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
  const { data: gmailLabels } = useSWR<LabelsResponse>("/api/google/labels");

  const { expanded, extra } = useExpanded();
  const [openedNewsletter, setOpenedNewsletter] = React.useState<Newsletter>();

  const [selectedRow, setSelectedRow] = React.useState<
    Newsletter | undefined
  >();

  useNewsletterShortcuts({
    newsletters: data?.newsletters,
    selectedRow,
    setOpenedNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
  });

  const { isLoading: isStatsLoading } = useStatLoader();

  const { PremiumModal, openModal } = usePremiumModal();

  return (
    <>
      <NewsletterSummary />
      <Card className="mt-4 p-0">
        <div className="items-center justify-between px-6 pt-6 md:flex">
          <SectionHeader
            title="Which newsletters and marketing emails do you get the most?"
            description="A list of all your email subscriptions. Quickly unsubscribe or view the emails in more detail."
          />
          <div className="ml-0 mt-3 flex justify-end sm:ml-4 sm:flex-row sm:space-y-0 md:mt-0">
            <div className="hidden md:mr-2 md:block">
              <ShortcutTooltip />
            </div>

            <div className="mr-1 flex items-center sm:mr-2">
              <Toggle
                label="Missing unsubscribe"
                name="missing-unsubscribe"
                enabled={includeMissingUnsubscribe}
                onChange={() => {
                  setIncludeMissingUnsubscribe(!includeMissingUnsubscribe);
                }}
              />
            </div>

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
              className="mr-1"
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
            {data && (
              <NewsletterTable
                sortColumn={sortColumn}
                setSortColumn={setSortColumn}
                tableRows={data.newsletters
                  .slice(0, expanded ? undefined : 50)
                  .map((item) => (
                    <NewsletterRow
                      key={item.name}
                      item={item}
                      userEmail={userEmail}
                      setOpenedNewsletter={setOpenedNewsletter}
                      gmailLabels={gmailLabels?.labels || []}
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
                  ))}
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

function NewsletterTable(props: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  setSortColumn: (sortColumn: "emails" | "unread" | "unarchived") => void;
}) {
  const { tableRows, sortColumn, setSortColumn } = props;

  return (
    <Table className="mt-4">
      <TableHead>
        <TableRow>
          <TableHeaderCell className="pl-6">
            <span className="text-sm font-medium">From</span>
          </TableHeaderCell>
          <TableHeaderCell>
            <HeaderButton
              sorted={sortColumn === "emails"}
              onClick={() => setSortColumn("emails")}
            >
              Emails
            </HeaderButton>
          </TableHeaderCell>
          <TableHeaderCell>
            <HeaderButton
              sorted={sortColumn === "unread"}
              onClick={() => setSortColumn("unread")}
            >
              Read
            </HeaderButton>
          </TableHeaderCell>
          <TableHeaderCell>
            <HeaderButton
              sorted={sortColumn === "unarchived"}
              onClick={() => setSortColumn("unarchived")}
            >
              Archived
            </HeaderButton>
          </TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHead>
      <TableBody>{tableRows}</TableBody>
    </Table>
  );
}

function NewsletterRow(props: {
  item: Newsletter;
  setOpenedNewsletter: React.Dispatch<
    React.SetStateAction<Newsletter | undefined>
  >;
  gmailLabels: LabelsResponse["labels"];
  userEmail: string;
  mutate: () => Promise<any>;
  selected: boolean;
  onSelectRow: () => void;
  onDoubleClick: () => void;
  hasUnsubscribeAccess: boolean;
  refetchPremium: () => Promise<any>;
  openPremiumModal: () => void;
}) {
  const { item, refetchPremium } = props;
  const readPercentage = (item.readEmails / item.value) * 100;
  const archivedEmails = item.value - item.inboxEmails;
  const archivedPercentage = (archivedEmails / item.value) * 100;

  return (
    <TableRow
      key={item.name}
      className={props.selected ? "bg-blue-50" : undefined}
      aria-selected={props.selected || undefined}
      data-selected={props.selected || undefined}
      onMouseEnter={props.onSelectRow}
      onDoubleClick={props.onDoubleClick}
    >
      <TableCell className="max-w-[250px] truncate pl-6 min-[1550px]:max-w-[300px] min-[1650px]:max-w-none">
        {item.name}
      </TableCell>
      <TableCell>{item.value}</TableCell>
      <TableCell>
        <div className="hidden xl:block">
          <ProgressBar
            label={`${Math.round(readPercentage)}%`}
            value={readPercentage}
            tooltip={`${item.readEmails} read. ${
              item.value - item.readEmails
            } unread.`}
            color="blue"
            className="w-[150px]"
          />
        </div>
        <div className="xl:hidden">{Math.round(readPercentage)}%</div>
      </TableCell>
      <TableCell>
        <div className="hidden 2xl:block">
          <ProgressBar
            label={`${Math.round(archivedPercentage)}%`}
            value={archivedPercentage}
            tooltip={`${archivedEmails} archived. ${item.inboxEmails} unarchived.`}
            color="blue"
            className="w-[150px]"
          />
        </div>
        <div className="2xl:hidden">{Math.round(archivedPercentage)}%</div>
      </TableCell>
      <TableCell className="flex justify-end space-x-2 p-2">
        <ActionCell
          item={item}
          hasUnsubscribeAccess={props.hasUnsubscribeAccess}
          mutate={props.mutate}
          refetchPremium={refetchPremium}
          setOpenedNewsletter={props.setOpenedNewsletter}
          selected={props.selected}
          gmailLabels={props.gmailLabels}
          openPremiumModal={props.openPremiumModal}
          userEmail={props.userEmail}
        />
      </TableCell>
    </TableRow>
  );
}
