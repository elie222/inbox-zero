"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
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
import { Button, ButtonLoader } from "@/components/ui/button";
import { NewsletterModal } from "@/app/(app)/stats/NewsletterModal";
import { useSearchParams } from "next/navigation";
import { markNotColdEmail } from "@/utils/actions/cold-email";
import { SectionDescription } from "@/components/Typography";
import { UserResponse } from "@/app/api/user/me/route";

export function ColdEmailList() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error, mutate } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}`,
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
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.coldEmails.map((coldEmail) => (
                <Row
                  key={coldEmail.id}
                  row={coldEmail}
                  userEmail={userEmail}
                  mutate={mutate}
                  setOpenedRow={setOpenedRow}
                />
              ))}
            </TableBody>
          </Table>

          <TablePagination totalPages={data.totalPages} />

          <NewsletterModal
            newsletter={openedRow ? { name: openedRow.email || "" } : undefined}
            onClose={() => setOpenedRow(undefined)}
          />
        </div>
      ) : (
        <NoColdEmails />
      )}
    </LoadingContent>
  );
}

function Row({
  row,
  userEmail,
  mutate,
  setOpenedRow,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
  mutate: () => void;
  setOpenedRow: (row: ColdEmailsResponse["coldEmails"][number]) => void;
}) {
  const [isMarkingColdEmail, setIsMarkingColdEmail] = useState(false);

  return (
    <TableRow key={row.id}>
      <TableCell>
        <SenderCell from={row.email} userEmail={userEmail} />
      </TableCell>
      <TableCell>{row.coldEmailReason || "-"}</TableCell>
      <TableCell>
        <DateCell createdAt={row.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end space-x-2">
          <Button variant="outline" onClick={() => setOpenedRow(row)}>
            View
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              setIsMarkingColdEmail(true);
              await markNotColdEmail({ sender: row.email });
              mutate();
              setIsMarkingColdEmail(false);
            }}
            disabled={isMarkingColdEmail}
          >
            {isMarkingColdEmail && <ButtonLoader />}
            Not cold email
          </Button>
        </div>
      </TableCell>
    </TableRow>
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

function NoColdEmails() {
  const { data } = useSWR<UserResponse>("/api/user/me");

  if (!data?.coldEmailBlocker || data?.coldEmailBlocker === "DISABLED") {
    return (
      <div className="mx-auto my-8 px-4 text-center">
        <SectionDescription>
          Cold email blocker is disabled. Enable it to start blocking cold
          emails.
        </SectionDescription>
        <Button className="mt-4" asChild>
          <Link href="/cold-email-blocker?tab=settings">
            Enable Cold Email Blocker
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-2">
      <AlertBasic
        title="No cold emails!"
        description={`We haven't marked any of your emails as cold emails yet!`}
      />
    </div>
  );
}
