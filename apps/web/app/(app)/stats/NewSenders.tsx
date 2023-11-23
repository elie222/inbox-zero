"use client";

import React from "react";
import useSWR from "swr";
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Title,
  Text,
} from "@tremor/react";
import { useSession } from "next-auth/react";
import groupBy from "lodash/groupBy";
import { Users2Icon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { Button } from "@/components/ui/button";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import { Tooltip } from "@/components/Tooltip";
import { getGmailCreateFilterUrl } from "@/utils/url";
import {
  NewSendersQuery,
  NewSendersResponse,
} from "@/app/api/user/stats/new-senders/route";
import { formatShortDate } from "@/utils/date";
import { formatStat } from "@/utils/stats";
import { StatsCards } from "@/components/StatsCards";

export function NewSenders() {
  const session = useSession();
  const email = session.data?.user.email;

  const params: NewSendersQuery = { cutOffDate: 0 };

  const { data, isLoading, error } = useSWR<
    NewSendersResponse,
    { error: string }
  >(`/api/user/stats/new-senders?${new URLSearchParams(params as any)}`, {
    keepPreviousData: true,
  });

  const { expanded, extra } = useExpanded();
  const [selectedEmail, setSelectedEmail] =
    React.useState<NewSendersResponse["emails"][number]>();

  const groupedSenders = groupBy(data?.emails, (email) => email.fromDomain);
  const newSenders = Object.entries(groupedSenders);

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
              icon: <Users2Icon className="h-4 w-4" />,
            },
          ]}
        />
      </LoadingContent>

      <Card className="mt-4 p-0">
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="">
            <Title>Who are the first time senders?</Title>
            <Text className="mt-2">
              A list of emails that you received for the first time.
            </Text>
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
                  <TableHeaderCell>Subject</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Emails</TableHeaderCell>
                  <TableHeaderCell className="hidden xl:table-cell"></TableHeaderCell>
                  <TableHeaderCell className="hidden xl:table-cell"></TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {newSenders
                  .slice(0, expanded ? undefined : 50)
                  .map(([_fromDomain, emails]) => {
                    const firstEmail = emails[0];

                    return (
                      <TableRow key={firstEmail.gmailMessageId}>
                        <TableCell className="max-w-[200px] truncate pl-6 lg:max-w-[300px]">
                          {firstEmail.from}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate lg:max-w-[400px]">
                          {firstEmail.subject}
                        </TableCell>
                        <TableCell>
                          {formatShortDate(new Date(firstEmail.timestamp))}
                        </TableCell>
                        <TableCell className="text-center">
                          {emails.length}
                        </TableCell>

                        <TableCell className="hidden xl:table-cell">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!firstEmail.unsubscribeLink}
                            asChild={!!firstEmail.unsubscribeLink}
                          >
                            {firstEmail.unsubscribeLink ? (
                              <a
                                href={firstEmail.unsubscribeLink}
                                target="_blank"
                              >
                                Unsubscribe
                              </a>
                            ) : (
                              <>Unsubscribe</>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Tooltip content="Auto archive emails using Gmail filters">
                            <Button size="sm" variant="secondary" asChild>
                              <a
                                href={getGmailCreateFilterUrl(
                                  firstEmail.from,
                                  email
                                )}
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
                            onClick={() => setSelectedEmail(firstEmail)}
                          >
                            More
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
        newsletter={
          selectedEmail
            ? {
                name: selectedEmail.from,
                lastUnsubscribeLink: selectedEmail.unsubscribeLink || undefined,
              }
            : undefined
        }
        onClose={() => setSelectedEmail(undefined)}
      />
    </>
  );
}
