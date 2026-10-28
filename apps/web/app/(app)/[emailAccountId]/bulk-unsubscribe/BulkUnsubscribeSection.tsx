"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { subDays } from "date-fns/subDays";
import { ChevronDown } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  HistoryIcon,
  InboxIcon,
  ListIcon,
  Loader2Icon,
  MailXIcon,
  SparklesIcon,
  ThumbsUpIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { useEmailsToIncludeFilter } from "@/app/(app)/[emailAccountId]/stats/EmailsToIncludeFilter";
import { usePremium } from "@/hooks/usePremium";
import {
  useArchiveOnUnsubscribe,
  useNewsletterFilter,
  useBulkUnsubscribeShortcuts,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { SenderPanel } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/SenderPanel";
import { createSearchParams } from "@/utils/url";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  getSuggestedModeRows,
  isUnsubscribeSuggestion,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import { getUserFacingUnsubscribeLink } from "@/utils/parse/unsubscribe";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useLabels } from "@/hooks/useLabels";
import {
  BulkUnsubscribeDesktop,
  BulkUnsubscribeRowDesktop,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeDesktop";
import { BulkUnsubscribeDesktopSkeleton } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSkeleton";
import { Card } from "@/components/ui/card";
import { SearchBar } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/SearchBar";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { BulkActions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkActions";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { ClientOnly } from "@/components/ClientOnly";
import { useAccount } from "@/providers/EmailAccountProvider";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { TextLink } from "@/components/Typography";
import { DismissibleVideoCard } from "@/components/VideoCard";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const filterOptions: {
  label: string;
  value: NewsletterFilterType;
  icon: React.ReactNode;
  separatorAfter?: boolean;
}[] = [
  {
    label: "To review",
    value: "unhandled",
    icon: <InboxIcon className="size-4" />,
  },
  {
    label: "All senders",
    value: "all",
    icon: <ListIcon className="size-4" />,
    separatorAfter: true,
  },
  {
    label: "Unsubscribed",
    value: "unsubscribed",
    icon: <MailXIcon className="size-4" />,
  },
  {
    label: "Auto-archived",
    value: "autoArchived",
    icon: <ArchiveIcon className="size-4" />,
  },
  {
    label: "Kept",
    value: "approved",
    icon: <ThumbsUpIcon className="size-4" />,
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
  const urlParams = createSearchParams(params);
  const { data, isLoading, isValidating, error, mutate } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval,
    keepPreviousData: true,
  });

  // Track whether we're switching views (filter, sort, search, date range, expanded)
  // Show skeleton when validating with different params, not on background refresh
  const [lastFetchedParams, setLastFetchedParams] = useState<string>("");
  const currentParamsString = urlParams.toString();
  const isParamsChanged = lastFetchedParams !== currentParamsString;
  const showSkeleton = isValidating && isParamsChanged;

  // Update lastFetchedParams when data arrives for new params
  useEffect(() => {
    if (!isValidating && data) {
      setLastFetchedParams(currentParamsString);
    }
  }, [isValidating, data, currentParamsString]);

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const [includeWithoutUnsubscribeLink, setIncludeWithoutUnsubscribeLink] =
    useState(false);
  const [archiveOnUnsubscribe, setArchiveOnUnsubscribe] =
    useArchiveOnUnsubscribe();

  // Data is filtered, sorted, and limited by the backend. Senders that can
  // only be blocked are hidden from review unless asked for.
  const rows = useMemo(
    () =>
      filter === "unhandled" && !includeWithoutUnsubscribeLink
        ? data?.newsletters.filter((item) =>
            getUserFacingUnsubscribeLink({
              unsubscribeLink: item.unsubscribeLink,
            }),
          )
        : data?.newsletters,
    [data?.newsletters, filter, includeWithoutUnsubscribeLink],
  );

  // Derived from the rows so the panel reflects status changes and closes
  // once the sender leaves the current view.
  const [openedNewsletterName, setOpenedNewsletterName] = useState<string>();
  const openedNewsletter = rows?.find(
    (row) => row.name === openedNewsletterName,
  );

  const onOpenNewsletter = (newsletter: Newsletter) => {
    setOpenedNewsletterName(newsletter.name);
    posthog?.capture("Clicked Expand Sender");
  };

  const [selectedRow, setSelectedRow] = useState<Newsletter | undefined>();

  useBulkUnsubscribeShortcuts({
    newsletters: rows,
    // The panel has its own email shortcuts; row keys must not act behind it.
    selectedRow: openedNewsletter ? undefined : selectedRow,
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

  const [isSuggestedMode, setIsSuggestedMode] = useState(false);

  const {
    selected,
    onToggleSelect,
    onToggleSelectItems,
    selectItems,
    clearSelection,
    deselectItem,
  } = useToggleSelect(rows?.map((item) => ({ id: item.name })) || []);

  const suggestedRows = useMemo(
    () => rows?.filter(isUnsubscribeSuggestion) ?? [],
    [rows],
  );

  const visibleRows = useMemo(
    () =>
      isSuggestedMode
        ? getSuggestedModeRows(rows ?? [], selected)
        : (rows ?? []),
    [isSuggestedMode, rows, selected],
  );
  const visibleRowIds = useMemo(
    () => visibleRows.map((row) => row.name),
    [visibleRows],
  );
  const isAllVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selected.get(row.name));
  const isSomeVisibleSelected = visibleRows.some((row) =>
    selected.get(row.name),
  );

  const onToggleSuggestedMode = useCallback(() => {
    if (isSuggestedMode) {
      setIsSuggestedMode(false);
      return;
    }

    selectItems(suggestedRows.map((row) => row.name));
    setIsSuggestedMode(true);
    posthog?.capture("Clicked Select Suggested Unsubscribes", {
      count: suggestedRows.length,
    });
  }, [isSuggestedMode, selectItems, suggestedRows, posthog]);

  const onToggleVisibleRow = useCallback(
    (id: string, shiftKey = false) =>
      onToggleSelect(id, shiftKey, visibleRowIds),
    [onToggleSelect, visibleRowIds],
  );

  const onToggleSelectAllVisible = useCallback(
    () => onToggleSelectItems(visibleRowIds),
    [onToggleSelectItems, visibleRowIds],
  );

  // Clear selection when filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally clearing selection when filter changes
  useEffect(() => {
    clearSelection();
    setIsSuggestedMode(false);
  }, [filter]);

  // Deep link (e.g. from the inbox health email or onboarding):
  // ?select=suggested auto-selects the suggested rows once after the first
  // rows load, then strips the param so re-renders and filter changes don't
  // reselect.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasAppliedSelectParamRef = useRef(false);

  useEffect(() => {
    if (hasAppliedSelectParamRef.current) return;
    if (searchParams.get("select") !== "suggested") return;
    if (!rows) return;

    hasAppliedSelectParamRef.current = true;
    selectItems(rows.filter(isUnsubscribeSuggestion).map((row) => row.name));
    setIsSuggestedMode(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("select");
    router.replace(nextParams.size ? `${pathname}?${nextParams}` : pathname, {
      scroll: false,
    });
  }, [searchParams, rows, selectItems, router, pathname]);

  // Backend now handles sorting, so we just map the rows in order
  const tableRows = visibleRows.map((item) => {
    const readPercentage =
      item.value > 0 ? (item.readEmails / item.value) * 100 : 0;

    return (
      <BulkUnsubscribeRowDesktop
        key={item.name}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        onOpenNewsletter={onOpenNewsletter}
        labels={userLabels}
        mutate={mutate}
        selected={selectedRow?.name === item.name}
        onSelectRow={() => setSelectedRow(item)}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        openPremiumModal={openModal}
        checked={selected.get(item.name) || false}
        onToggleSelect={onToggleVisibleRow}
        readPercentage={readPercentage}
        filter={filter}
      />
    );
  });

  const selectedFilter = filterOptions.find((opt) => opt.value === filter);

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
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
            muxPlaybackId: "qxP8P5aKm7k7I01seCEMP1ZepHQAmdKCcW02x1fM7xQm00",
          }}
        />
        <ScanOlderEmailsButton />
      </div>

      <DismissibleVideoCard
        className="my-4"
        icon={<ArchiveIcon className="size-5" />}
        title="Getting started with Bulk Unsubscribe"
        description={
          "Learn how to use the Bulk Unsubscribe to unsubscribe from and archive unwanted emails."
        }
        muxPlaybackId="qxP8P5aKm7k7I01seCEMP1ZepHQAmdKCcW02x1fM7xQm00"
        storageKey="bulk-unsubscribe-onboarding-video"
        videoAnalytics={{
          page: "bulk_unsubscribe",
          surface: "dismissible_card",
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full justify-between sm:w-auto"
            >
              <span className="flex items-center">
                {selectedFilter?.icon}
                <span className="ml-2">{selectedFilter?.label ?? "All"}</span>
              </span>
              <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px]">
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
            {filter === "unhandled" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={includeWithoutUnsubscribeLink}
                  onCheckedChange={(checked) => {
                    setIncludeWithoutUnsubscribeLink(checked);
                    clearSelection();
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  Include senders without an unsubscribe link
                </DropdownMenuCheckboxItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
          selectOptions={selectOptions}
          dateDropdown={dateDropdown}
          onSetDateDropdown={onSetDateDropdown}
          className="w-full min-w-0 sm:w-auto sm:min-w-52"
        />
        <SearchBar onSearch={setSearch} className="col-span-2 sm:w-60" />
        {(suggestedRows.length > 0 || isSuggestedMode) && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isSuggestedMode ? "secondary" : "outline"}
                  size="sm"
                  className="col-span-2 h-10 w-full sm:w-auto"
                  aria-pressed={isSuggestedMode}
                  onClick={onToggleSuggestedMode}
                >
                  <SparklesIcon className="size-4 text-amber-500" />
                  <span className="ml-2">
                    {isSuggestedMode ? "Showing" : "Select"}{" "}
                    {suggestedRows.length} suggested
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  {isSuggestedMode
                    ? "Click to show all senders"
                    : "Senders you get a lot of email from but rarely open"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="col-span-2 flex h-10 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground sm:ml-auto">
              <Switch
                id="archive-on-unsubscribe"
                size="sm"
                checked={archiveOnUnsubscribe}
                onCheckedChange={setArchiveOnUnsubscribe}
              />
              <label
                htmlFor="archive-on-unsubscribe"
                className="cursor-pointer select-none"
              >
                Archive on unsubscribe
              </label>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Also archive existing emails when you unsubscribe
          </TooltipContent>
        </Tooltip>
      </div>

      <ClientOnly>
        <ArchiveProgress />
      </ClientOnly>

      <Card className="mt-2 md:mt-4 max-sm:border-0 max-sm:shadow-none">
        {(isStatsLoading && !isLoading && !data?.newsletters.length) ||
        showSkeleton ? (
          <BulkUnsubscribeDesktopSkeleton />
        ) : (
          <LoadingContent
            loading={!data && isLoading}
            error={error}
            loadingComponent={<BulkUnsubscribeDesktopSkeleton />}
          >
            {tableRows?.length ? (
              <BulkUnsubscribeDesktop
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                tableRows={tableRows}
                isAllSelected={isAllVisibleSelected}
                isSomeSelected={isSomeVisibleSelected}
                onToggleSelectAll={onToggleSelectAllVisible}
              />
            ) : (
              <EmptyState
                isReviewView={filter === "unhandled" && !search}
                onlyLinklessLeft={
                  filter === "unhandled" &&
                  !includeWithoutUnsubscribeLink &&
                  !!data?.newsletters.length
                }
                onIncludeLinkless={() => setIncludeWithoutUnsubscribeLink(true)}
              />
            )}
            {/* Only show expand/collapse when there might be more results */}
            {(expanded ||
              (data?.newsletters && data.newsletters.length >= 50)) && (
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
          </LoadingContent>
        )}
      </Card>
      <BulkActions
        selected={selected}
        mutate={mutate}
        onClearSelection={clearSelection}
        deselectItem={deselectItem}
        newsletters={rows}
        filter={filter}
        dateRange={dateRange}
      />
      <SenderPanel
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletterName(undefined)}
        refreshInterval={refreshInterval}
        mutate={mutate}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        openPremiumModal={openModal}
        filter={filter}
      />
      <PremiumModal />
    </PageWrapper>
  );
}

function ScanOlderEmailsButton() {
  const { isLoading, onLoadBatch } = useStatLoader();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => onLoadBatch({ loadBefore: true, showToast: true })}
          disabled={isLoading}
          aria-label="Scan older emails"
        >
          {isLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <HistoryIcon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isLoading ? "Scanning older emails…" : "Scan older emails"}
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyState({
  isReviewView,
  onlyLinklessLeft,
  onIncludeLinkless,
}: {
  isReviewView: boolean;
  onlyLinklessLeft: boolean;
  onIncludeLinkless: () => void;
}) {
  if (onlyLinklessLeft) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-14">
        <h3 className="font-title text-xl font-medium">
          Only senders without an unsubscribe link are left
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onIncludeLinkless}
        >
          Show them
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-14">
      <h3 className="font-title text-xl font-medium">
        {isReviewView ? "Nothing left to review" : "No senders found"}
      </h3>
      <p className="mt-1.5 text-center text-sm text-muted-foreground">
        {isReviewView
          ? "New senders will show up here as they arrive."
          : "Try a different filter or date range."}
      </p>
    </div>
  );
}
