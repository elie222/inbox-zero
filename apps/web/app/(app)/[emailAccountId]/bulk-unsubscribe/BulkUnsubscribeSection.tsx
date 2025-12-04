"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { subDays } from "date-fns/subDays";
import { ChevronDown } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  InboxIcon,
  ListIcon,
  MailMinusIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { NewsletterModal } from "@/app/(app)/[emailAccountId]/stats/NewsletterModal";
import { useEmailsToIncludeFilter } from "@/app/(app)/[emailAccountId]/stats/EmailsToIncludeFilter";
import { usePremium } from "@/components/PremiumAlert";
import {
  useNewsletterFilter,
  useBulkUnsubscribeShortcuts,
  type NewsletterFilterType,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useLabels } from "@/hooks/useLabels";
import {
  BulkUnsubscribeMobile,
  BulkUnsubscribeRowMobile,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeMobile";
import {
  BulkUnsubscribeDesktop,
  BulkUnsubscribeRowDesktop,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeDesktop";
import { Card } from "@/components/ui/card";
import { SearchBar } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/SearchBar";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { BulkActions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkActions";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { ClientOnly } from "@/components/ClientOnly";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useWindowSize } from "usehooks-ts";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { TextLink } from "@/components/Typography";
import { DismissibleVideoCard } from "@/components/VideoCard";
import { ActionBar } from "@/app/(app)/[emailAccountId]/stats/ActionBar";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const filterOptions: {
  label: string;
  value: NewsletterFilterType;
  icon: React.ReactNode;
  separatorAfter?: boolean;
}[] = [
  { label: "All", value: "all", icon: <ListIcon className="size-4" /> },
  {
    label: "Unhandled",
    value: "unhandled",
    icon: <InboxIcon className="size-4" />,
    separatorAfter: true,
  },
  {
    label: "Unsubscribed",
    value: "unsubscribed",
    icon: <MailMinusIcon className="size-4" />,
  },
  {
    label: "Skip Inbox",
    value: "autoArchived",
    icon: <ArchiveIcon className="size-4" />,
  },
  {
    label: "Approved",
    value: "approved",
    icon: <BadgeCheckIcon className="size-4" />,
  },
];

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];
const defaultSelected = selectOptions[2];

export function BulkUnsubscribe() {
  const windowSize = useWindowSize();
  const isMobile = windowSize.width < 768;

  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label,
  );

  const now = useMemo(() => new Date(), []);

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      const { label, value } = option;
      setDateDropdown(label);
      // When "All" is selected (value "0"), set dateRange to undefined to skip date filtering
      if (value === "0") {
        setDateRange(undefined);
      } else {
        setDateRange({
          from: subDays(now, Number.parseInt(value)),
          to: now,
        });
      }
    },
    [now],
  );

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const { isLoading: isStatsLoaderLoading, onLoad } = useStatLoader();
  const refreshInterval = isStatsLoaderLoading ? 5000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  const { emailAccountId, userEmail } = useAccount();

  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback(
    (column: "emails" | "unread" | "unarchived") => {
      if (sortColumn === column) {
        // Toggle direction if clicking the same column
        setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        // Set new column with default desc direction
        setSortColumn(column);
        setSortDirection("desc");
      }
    },
    [sortColumn],
  );

  const { typesArray } = useEmailsToIncludeFilter();
  const { filtersArray, filter, setFilter } = useNewsletterFilter();
  const posthog = usePostHog();

  const [search, setSearch] = useState("");

  const [expanded, setExpanded] = useState(false);

  const params: NewsletterStatsQuery = {
    types: typesArray,
    filters: filtersArray,
    orderBy: sortColumn,
    orderDirection: sortDirection,
    limit: expanded ? 500 : 50,
    includeMissingUnsubscribe: true,
    ...getDateRangeParams(dateRange),
    ...(search ? { search } : {}),
  };
  // biome-ignore lint/suspicious/noExplicitAny: simplest
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading, error, mutate } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval,
    keepPreviousData: true,
  });

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const [openedNewsletter, setOpenedNewsletter] = useState<Newsletter>();

  const onOpenNewsletter = (newsletter: Newsletter) => {
    setOpenedNewsletter(newsletter);
    posthog?.capture("Clicked Expand Sender");
  };

  const [selectedRow, setSelectedRow] = useState<Newsletter | undefined>();

  useBulkUnsubscribeShortcuts({
    newsletters: data?.newsletters,
    selectedRow,
    onOpenNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
    userEmail,
    emailAccountId,
  });

  const { isLoading: isStatsLoading } = useStatLoader();

  const { userLabels } = useLabels();

  const { PremiumModal, openModal } = usePremiumModal();

  const RowComponent = isMobile
    ? BulkUnsubscribeRowMobile
    : BulkUnsubscribeRowDesktop;

  // Data is now filtered, sorted, and limited by the backend
  const rows = data?.newsletters;

  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(rows?.map((item) => ({ id: item.name })) || []);

  // Backend now handles sorting, so we just map the rows in order
  const tableRows = rows?.map((item) => {
    const readPercentage =
      item.value > 0 ? (item.readEmails / item.value) * 100 : 0;
    const archivedEmails = item.value - item.inboxEmails;
    const archivedPercentage =
      item.value > 0 ? (archivedEmails / item.value) * 100 : 0;

    return (
      <RowComponent
        key={item.name}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        onOpenNewsletter={onOpenNewsletter}
        labels={userLabels}
        mutate={mutate}
        selected={selectedRow?.name === item.name}
        onSelectRow={() => setSelectedRow(item)}
        onDoubleClick={() => onOpenNewsletter(item)}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        openPremiumModal={openModal}
        checked={selected.get(item.name) || false}
        onToggleSelect={onToggleSelect}
        readPercentage={readPercentage}
        archivedEmails={archivedEmails}
        archivedPercentage={archivedPercentage}
      />
    );
  });

  const selectedFilter = filterOptions.find((opt) => opt.value === filter);

  return (
    <PageWrapper>
      <PageHeader
        title="Bulk Unsubscriber"
        video={{
          title: "Getting started with Bulk Unsubscribe",
          description: (
            <>
              Learn how to quickly bulk unsubscribe from and archive unwanted
              emails. You can read more in our{" "}
              <TextLink
                href="https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber"
                target="_blank"
                rel="noopener noreferrer"
              >
                help center
              </TextLink>
              .
            </>
          ),
          youtubeVideoId: "T1rnooV4OYc",
        }}
      />

      <DismissibleVideoCard
        className="my-4"
        icon={<ArchiveIcon className="size-5" />}
        title="Getting started with Bulk Unsubscribe"
        description={
          "Learn how to use the Bulk Unsubscribe to unsubscribe from and archive unwanted emails."
        }
        videoSrc="https://www.youtube.com/embed/T1rnooV4OYc"
        thumbnailSrc="https://img.youtube.com/vi/T1rnooV4OYc/0.jpg"
        storageKey="bulk-unsubscribe-onboarding-video"
      />

      <div className="items-center justify-between flex mt-4 flex-wrap">
        <ActionBar rightContent={<LoadStatsButton />}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10">
                {selectedFilter?.icon}
                <span className="ml-2">{selectedFilter?.label ?? "All"}</span>
                <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[170px]">
              {filterOptions.map((option) => (
                <div key={option.value}>
                  <DropdownMenuItem
                    onClick={() => setFilter(option.value)}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {option.icon}
                      {option.label}
                    </span>
                    {filter === option.value && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  {option.separatorAfter && <DropdownMenuSeparator />}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DatePickerWithRange
            dateRange={dateRange}
            onSetDateRange={setDateRange}
            selectOptions={selectOptions}
            dateDropdown={dateDropdown}
            onSetDateDropdown={onSetDateDropdown}
          />
          <SearchBar onSearch={setSearch} />
        </ActionBar>
      </div>

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      {Array.from(selected.values()).filter(Boolean).length > 0 ? (
        <BulkActions selected={selected} mutate={mutate} />
      ) : null}

      <Card className="mt-2 md:mt-4">
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
            {tableRows?.length ? (
              <>
                {isMobile ? (
                  <BulkUnsubscribeMobile tableRows={tableRows} />
                ) : (
                  <BulkUnsubscribeDesktop
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    tableRows={tableRows}
                    isAllSelected={isAllSelected}
                    onToggleSelectAll={onToggleSelectAll}
                  />
                )}
                {/* Only show expand/collapse when there might be more results */}
                {(expanded || (rows && rows.length >= 50)) && (
                  <div className="mt-2 px-6 pb-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpanded(!expanded)}
                      className="w-full"
                    >
                      {expanded ? (
                        <>
                          <ChevronsUpIcon className="h-4 w-4" />
                          <span className="ml-2">Show less</span>
                        </>
                      ) : (
                        <>
                          <ChevronsDownIcon className="h-4 w-4" />
                          <span className="ml-2">Show more</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="space-y-4 p-4 text-muted-foreground">
                No emails found. Adjust the filters, or click "Load More".
              </p>
            )}
          </LoadingContent>
        )}
      </Card>
      <NewsletterModal
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletter(undefined)}
        refreshInterval={refreshInterval}
        mutate={mutate}
      />
      <PremiumModal />
    </PageWrapper>
  );
}
