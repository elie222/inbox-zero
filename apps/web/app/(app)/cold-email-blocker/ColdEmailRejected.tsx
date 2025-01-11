"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { LoadingContent } from "@/components/LoadingContent";
import type { ColdEmailsResponse } from "@/app/api/user/cold-email/route";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateCell } from "@/app/(app)/automation/ExecutedRulesTable";
import { TablePagination } from "@/components/TablePagination";
import { AlertBasic } from "@/components/Alert";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import { useSearchParams } from "next/navigation";
import { SenderCell } from "@/app/(app)/cold-email-blocker/ColdEmailList";
import { ColdEmailStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

export function ColdEmailRejected() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}&status=${ColdEmailStatus.USER_REJECTED_COLD}`,
  );

  const session = useSession();
  const userEmail = session.data?.user?.email || "";

  const [openedRow, setOpenedRow] = useState<
    ColdEmailsResponse["coldEmails"][number] | undefined
  >(undefined);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.coldEmails.length ? (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sender</TableHead>
                <TableHead>AI Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.coldEmails.map((coldEmail) => (
                <Row
                  key={coldEmail.id}
                  row={coldEmail}
                  userEmail={userEmail}
                  setOpenedRow={setOpenedRow}
                />
              ))}
            </TableBody>
          </Table>

          <TablePagination totalPages={data.totalPages} />

          <NewsletterModal
            newsletter={
              openedRow ? { name: openedRow.fromEmail || "" } : undefined
            }
            onClose={() => setOpenedRow(undefined)}
          />
        </div>
      ) : (
        <NoRejectedColdEmails />
      )}
    </LoadingContent>
  );
}

function Row({
  row,
  userEmail,
  setOpenedRow,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
  setOpenedRow: (
    row: ColdEmailsResponse["coldEmails"][number] | undefined,
  ) => void;
}) {
  return (
    <TableRow key={row.id}>
      <TableCell>
        <SenderCell from={row.fromEmail} userEmail={userEmail} />
      </TableCell>
      <TableCell>{row.reason || "-"}</TableCell>
      <TableCell>
        <DateCell createdAt={row.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" onClick={() => setOpenedRow(row)}>
            View
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NoRejectedColdEmails() {
  return (
    <div className="p-2">
      <AlertBasic
        title="No emails marked as 'Not a cold email'"
        description="When you mark an AI-detected cold email as 'Not a cold email', it will appear here."
      />
    </div>
  );
}
