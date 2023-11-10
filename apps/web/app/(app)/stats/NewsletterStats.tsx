"use client";

import React, { useState } from "react";
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
  Title,
  Text,
} from "@tremor/react";
import {
  ChevronDown,
  ChevronsUpDownIcon,
  CircleDashedIcon,
  FilterIcon,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { useSession } from "next-auth/react";
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
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { Tooltip } from "@/components/Tooltip";
import { getGmailCreateFilterUrl } from "@/utils/url";

export function NewsletterStats(props: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
}) {
  const session = useSession();
  const email = session.data?.user.email;

  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");

  const [types, setTypes] = useState<
    Record<"read" | "unread" | "archived" | "unarchived", boolean>
  >({
    read: true,
    unread: true,
    archived: true,
    unarchived: true,
  });

  const params: NewsletterStatsQuery = {
    types: Object.entries(types)
      .filter(([, selected]) => selected)
      .map(([key]) => key) as ("read" | "unread" | "archived" | "unarchived")[],
    orderBy: sortColumn,
    ...getDateRangeParams(props.dateRange),
  };

  const { data, isLoading, error } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${new URLSearchParams(params as any)}`, {
    refreshInterval: props.refreshInterval,
    keepPreviousData: true,
  });

  const { expanded, extra } = useExpanded();
  const [selectedNewsletter, setSelectedNewsletter] =
    React.useState<NewsletterStatsResponse["newsletterCounts"][number]>();

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
            <DetailedStatsFilter
              label="Emails to include"
              icon={<FilterIcon className="mr-2 h-4 w-4" />}
              keepOpenOnSelect
              columns={[
                {
                  label: "Read",
                  checked: types.read,
                  setChecked: () =>
                    setTypes({ ...types, ["read"]: !types.read }),
                },
                {
                  label: "Unread",
                  checked: types.unread,
                  setChecked: () =>
                    setTypes({ ...types, ["unread"]: !types.unread }),
                },
                {
                  label: "Unarchived",
                  checked: types.unarchived,
                  setChecked: () =>
                    setTypes({ ...types, ["unarchived"]: !types.unarchived }),
                },
                {
                  label: "Archived",
                  checked: types.archived,
                  setChecked: () =>
                    setTypes({ ...types, ["archived"]: !types.archived }),
                },
              ]}
            />
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
                    <span className="text-sm font-medium">Newsletter</span>
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
                  <TableHeaderCell className="hidden xl:table-cell"></TableHeaderCell>
                  <TableHeaderCell className="hidden xl:table-cell"></TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.newsletterCounts
                  .slice(0, expanded ? undefined : 10)
                  .map((item) => {
                    const readPercentage = (item.readEmails / item.value) * 100;
                    const archivedEmails = item.value - item.inboxEmails;
                    const archivedPercentage =
                      (archivedEmails / item.value) * 100;

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
                        <TableCell className="hidden xl:table-cell">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!item.lastUnsubscribeLink}
                            asChild
                          >
                            <a href={item.lastUnsubscribeLink} target="_blank">
                              Unsubscribe
                            </a>
                          </Button>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Tooltip content="Auto archive emails using Gmail filters">
                            <Button size="sm" variant="secondary" asChild>
                              <a
                                href={getGmailCreateFilterUrl(item.name, email)}
                                target="_blank"
                              >
                                Auto archive
                              </a>
                            </Button>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!item.lastUnsubscribeLink}
                            onClick={() => setSelectedNewsletter(item)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
