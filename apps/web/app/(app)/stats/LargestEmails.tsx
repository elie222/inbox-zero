"use client";

import useSWRImmutable from "swr/immutable";
import Link from "next/link";
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Title,
} from "@tremor/react";
import truncate from "lodash/truncate";
import { useSession } from "next-auth/react";
import { ExternalLinkIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { LargestEmailsResponse } from "@/app/api/user/stats/largest-emails/route";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { bytesToMegabytes } from "@/utils/size";
import { formatShortDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { getGmailUrl } from "@/utils/url";

export function LargestEmails(props: { refreshInterval: number }) {
  const session = useSession();

  const { data, isLoading, error } = useSWRImmutable<
    LargestEmailsResponse,
    { error: string }
  >(`/api/user/stats/largest-emails`, {
    refreshInterval: props.refreshInterval,
  });

  const { expanded, extra } = useExpanded();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <Card>
          <Title>What are the largest items in your inbox?</Title>
          <Table className="mt-6">
            <TableHead>
              <TableRow>
                <TableHeaderCell>From</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Size</TableHeaderCell>
                <TableHeaderCell>View</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.largestEmails
                .slice(0, expanded ? undefined : 5)
                .map((item) => {
                  return (
                    <TableRow key={item.gmailMessageId}>
                      <TableCell>{item.from}</TableCell>
                      <TableCell>
                        {truncate(item.subject, { length: 80 })}
                      </TableCell>
                      <TableCell>
                        {formatShortDate(new Date(+item.timestamp), {
                          includeYear: true,
                          lowercase: true,
                        })}
                      </TableCell>
                      <TableCell>
                        {bytesToMegabytes(item.sizeEstimate).toFixed(1)} MB
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="secondary" size="sm">
                          <Link
                            href={getGmailUrl(
                              item.gmailMessageId,
                              session.data?.user.email
                            )}
                            target="_blank"
                          >
                            <ExternalLinkIcon className="mr-2 h-4 w-4" />
                            Open in Gmail
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          <div className="mt-2">{extra}</div>
        </Card>
      )}
    </LoadingContent>
  );
}
