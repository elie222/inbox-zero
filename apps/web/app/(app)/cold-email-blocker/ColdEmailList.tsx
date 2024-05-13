"use client";

import { useState } from "react";
import useSWR from "swr";
import { ExternalLinkIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { LoadingContent } from "@/components/LoadingContent";
import { ColdEmailsResponse } from "@/app/api/user/cold-email/route";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DateCell,
  TablePagination,
} from "@/app/(app)/automation/ExecutedRulesTable";
import { AlertBasic } from "@/components/Alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { Button } from "@/components/ui/button";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";

export function ColdEmailList() {
  const { data, isLoading, error, mutate } =
    useSWR<ColdEmailsResponse>(`/api/user/cold-email`);

  const session = useSession();
  const userEmail = session.data?.user?.email || "";

  const [openedRow, setOpenedRow] = useState<
    ColdEmailsResponse[number] | undefined
  >(undefined);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.length ? (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sender</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <SenderCell from={t.email} userEmail={userEmail} />
                  </TableCell>
                  <TableCell>{t.coldEmailReason || "-"}</TableCell>
                  <TableCell>
                    <DateCell createdAt={t.createdAt} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end space-x-2">
                      <Button variant="outline" onClick={() => setOpenedRow(t)}>
                        View
                      </Button>
                      <Button variant="outline">Not cold email</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* TODO: fix this */}
          <TablePagination totalPages={10} />

          <NewsletterModal
            newsletter={openedRow ? { name: openedRow.email || "" } : undefined}
            onClose={() => setOpenedRow(undefined)}
          />
        </div>
      ) : (
        <div className="p-2">
          <AlertBasic
            title="No cold emails!"
            description={`We haven't marked any of your emails as cold emails yet!`}
          />
        </div>
      )}
    </LoadingContent>
  );
}

function SenderCell({ from, userEmail }: { from: string; userEmail: string }) {
  // use regex to find first letter
  const firstLetter = from.match(/[a-zA-Z]/)?.[0] || "-";

  return (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback>{firstLetter}</AvatarFallback>
      </Avatar>
      <div className="flex items-center">
        <span className="mr-2 font-semibold">{from}</span>
        <OpenInGmailButton from={from} userEmail={userEmail} />
      </div>
    </div>
  );
}

function OpenInGmailButton({
  from,
  userEmail,
}: {
  from: string;
  userEmail: string;
}) {
  return (
    <button
      className="ml-2 text-gray-700 hover:text-gray-900"
      onClick={() => {
        window.open(getGmailBasicSearchUrl(from, userEmail), "_blank");
      }}
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </button>
  );
}
