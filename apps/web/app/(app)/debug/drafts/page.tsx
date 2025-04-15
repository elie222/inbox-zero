"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading, TypographyP } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import type { DraftLogsResponse } from "@/app/api/user/draft-logs/route";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortDate } from "@/utils/date";
import { getGmailUrl } from "@/utils/url";

export default function DebugDraftsPage() {
  const { data, isLoading, error } = useSWR<DraftLogsResponse>(
    "/api/user/draft-logs",
  );

  const session = useSession();
  const userEmail = session.data?.user?.email || "";

  return (
    <div className="container mx-auto py-6">
      <PageHeading className="mb-6">Drafts</PageHeading>

      <LoadingContent loading={isLoading} error={error}>
        {data?.draftLogs.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center p-6">
              <TypographyP>No drafts found yet.</TypographyP>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sent Message ID</TableHead>
                  <TableHead>Similarity Score</TableHead>
                </TableRow>
                {data?.draftLogs?.map((draftLog) => (
                  <TableRow key={draftLog.id}>
                    <TableCell>
                      {formatShortDate(new Date(draftLog.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={getGmailUrl(draftLog.sentMessageId, userEmail)}
                        target="_blank"
                        className="text-blue-500 hover:text-blue-600"
                      >
                        Message
                      </Link>
                    </TableCell>
                    <TableCell>{draftLog.similarityScore}</TableCell>
                  </TableRow>
                ))}
              </TableHeader>
            </Table>
          </Card>
        )}
      </LoadingContent>
    </div>
  );
}
