"use client";

import React, { useCallback, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  Card,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Title,
  Text,
} from "@tremor/react";
import {
  ArchiveXIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  MailsIcon,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { useLocalStorage } from "usehooks-ts";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { Button } from "@/components/ui/button";
import { getDateRangeParams } from "@/app/(app)/stats/params";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import { Tooltip } from "@/components/Tooltip";
import {
  EmailsToIncludeFilter,
  useEmailsToIncludeFilter,
} from "@/app/(app)/stats/EmailsToIncludeFilter";
import { onAutoArchive } from "@/utils/actions-client";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelsResponse } from "@/app/api/google/labels/route";

export function NewsletterStats(props: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
}) {
  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");
  const [includeFilteredEmails, setIncludeFilteredEmails] = useState(false);
  const toggleIncludeFilteredEmails = useCallback(
    () => setIncludeFilteredEmails((v) => !v),
    [],
  );

  const { typesArray, types, setTypes } = useEmailsToIncludeFilter();

  const params: NewsletterStatsQuery = {
    types: typesArray,
    orderBy: sortColumn,
    limit: 100,
    ...getDateRangeParams(props.dateRange),
    includeFilteredEmails,
  };

  const urlParams = new URLSearchParams(params as any);

  const { data, isLoading, error } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval: props.refreshInterval,
    keepPreviousData: true,
  });

  const { data: dataLabels, isLoading: isLoadingLabels } =
    useSWR<LabelsResponse>("/api/google/labels");

  const { expanded, extra } = useExpanded();
  const [selectedNewsletter, setSelectedNewsletter] =
    React.useState<NewsletterStatsResponse["newsletters"][number]>();

  // won't work if user switches devices
  const [unsubscribedEmails, setUnsubscribedEmails] = useLocalStorage<{
    [key: string]: boolean;
  }>("unsubscribedEmails", {});

  return (
    <>
      <Card className="p-0">
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="">
            <Title>
              Which newsletters and marketing emails do you get the most?
            </Title>
            <Text className="mt-2">
              A list of are your email subscriptions. Quickly unsubscribe or
              view the emails in more detail.
            </Text>
          </div>
          <div className="flex space-x-2">
            <Toggle
              aria-label="Toggle Auto Archived Emails"
              onClick={toggleIncludeFilteredEmails}
            >
              <Tooltip content="Toggle Auto Archived Emails">
                <MailsIcon className="h-4 w-4" />
              </Tooltip>
            </Toggle>

            <EmailsToIncludeFilter types={types} setTypes={setTypes} />
          </div>
        </div>

        <LoadingContent
          loading={!data && isLoading}
          error={error}
          loadingComponent={<Skeleton className="m-4 h-screen rounded" />}
        >
          {data && (
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
                  <TableHeaderCell className="hidden xl:table-cell"></TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.newsletters
                  .slice(0, expanded ? undefined : 50)
                  .map((item) => (
                    <NewsletterRow
                      key={item.name}
                      item={item}
                      unsubscribedEmails={unsubscribedEmails}
                      setUnsubscribedEmails={setUnsubscribedEmails}
                      setSelectedNewsletter={setSelectedNewsletter}
                      gmailLabels={dataLabels}
                    />
                  ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-2 px-6 pb-6">{extra}</div>
        </LoadingContent>
      </Card>
      <NewsletterModal
        newsletter={selectedNewsletter}
        onClose={() => setSelectedNewsletter(undefined)}
        refreshInterval={props.refreshInterval}
      />
    </>
  );
}

function NewsletterRow(props: {
  item: NewsletterStatsResponse["newsletters"][number];
  unsubscribedEmails: { [key: string]: boolean };
  setUnsubscribedEmails: React.Dispatch<
    React.SetStateAction<{ [key: string]: boolean }>
  >;
  setSelectedNewsletter: React.Dispatch<
    React.SetStateAction<
      NewsletterStatsResponse["newsletters"][number] | undefined
    >
  >;
  gmailLabels?: LabelsResponse;
}) {
  const { item } = props;
  const readPercentage = (item.readEmails / item.value) * 100;
  const archivedEmails = item.value - item.inboxEmails;
  const archivedPercentage = (archivedEmails / item.value) * 100;

  return (
    <TableRow key={item.name}>
      <TableCell className="max-w-[200px] truncate pl-6 lg:max-w-[300px] 2xl:max-w-none">
        {item.name}
      </TableCell>
      <TableCell>{item.value}</TableCell>
      <TableCell>
        <ProgressBar
          label={`${Math.round(readPercentage)}%`}
          value={readPercentage}
          tooltip={`${item.readEmails} read. ${
            item.value - item.readEmails
          } unread.`}
          color="blue"
          className="w-[150px]"
        />
      </TableCell>
      <TableCell>
        <ProgressBar
          label={`${Math.round(archivedPercentage)}%`}
          value={archivedPercentage}
          tooltip={`${archivedEmails} archived. ${item.inboxEmails} unarchived.`}
          color="blue"
          className="w-[150px]"
        />
      </TableCell>
      <TableCell className="p-2">
        <Button
          size="sm"
          variant={props.unsubscribedEmails[item.name] ? "ghost" : "secondary"}
          disabled={!item.lastUnsubscribeLink}
          asChild={!!item.lastUnsubscribeLink}
        >
          <a
            href={item.lastUnsubscribeLink}
            target="_blank"
            onClick={() => {
              props.setUnsubscribedEmails((u) => ({
                ...u,
                [item.name]: true,
              }));
            }}
          >
            <span className="hidden xl:block">
              {props.unsubscribedEmails[item.name]
                ? "Unsubscribed"
                : "Unsubscribe"}
            </span>
          </a>
        </Button>
      </TableCell>
      <TableCell className="hidden p-2 xl:table-cell">
        <Tooltip content="Auto archive emails using Gmail filters">
          <div
            className={clsx(
              "flex items-center space-x-1 rounded-md text-secondary-foreground",
              !item.autoArchived && "bg-secondary",
            )}
          >
            <Button
              variant={item.autoArchived ? "ghost" : "secondary"}
              className="px-3 shadow-none"
              size="sm"
              disabled={!!item.autoArchived}
              onClick={() => onAutoArchive(item.name)}
            >
              {item.autoArchived ? "Auto Archived" : "Auto Archive"}
            </Button>
            <Separator orientation="vertical" className="h-[20px]" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={item.autoArchived ? "ghost" : "secondary"}
                  className="px-2 shadow-none"
                  size="sm"
                >
                  <ChevronDownIcon className="h-4 w-4 text-secondary-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                alignOffset={-5}
                className="max-h-[415px] w-[220px] overflow-auto"
                forceMount
              >
                {item.autoArchived && (
                  <>
                    <DropdownMenuItem>
                      <ArchiveXIcon className="mr-2 h-4 w-4" /> Disable Auto
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuLabel>Auto Archive and Label</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {props.gmailLabels?.labels
                  ?.filter(
                    (l) =>
                      l.id &&
                      l.type === "user" &&
                      l.labelListVisibility === "labelShow",
                  )
                  .map((label) => {
                    return (
                      <DropdownMenuItem
                        key={label.id}
                        onClick={() =>
                          onAutoArchive(item.name, label.id || undefined)
                        }
                      >
                        {label.name}
                      </DropdownMenuItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Tooltip>
      </TableCell>
      <TableCell className="p-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => props.setSelectedNewsletter(item)}
        >
          <ExpandIcon className="mr-2 h-4 w-4" />
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function HeaderButton(props: {
  children: React.ReactNode;
  sorted: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={props.onClick}
    >
      <span>{props.children}</span>
      {props.sorted ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}
