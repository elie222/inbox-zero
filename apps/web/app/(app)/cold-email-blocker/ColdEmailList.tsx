"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getGmailSearchUrl } from "@/utils/url";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { markNotColdEmailAction } from "@/utils/actions/cold-email";
import { SectionDescription } from "@/components/Typography";
import { Checkbox } from "@/components/Checkbox";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { handleActionResult } from "@/utils/server-action";
import { useUser } from "@/hooks/useUser";
import { ViewEmailButton } from "@/components/ViewEmailButton";

export function ColdEmailList() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error, mutate } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}`,
  );

  const session = useSession();
  const userEmail = session.data?.user?.email || "";

  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(data?.coldEmails || []);

  // const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // const approveSelected = useCallback(async () => {
  //   setIsApproving(true);
  //   for (const id of Array.from(selected.keys())) {
  //     const p = pending.find((p) => p.id === id);
  //     if (!p) continue;
  //     try {
  //       await approvePlanAction(id, p.message);
  //     } catch (error) {
  //       console.error(error);
  //     }
  //     mutate();
  //   }
  //   setIsApproving(false);
  // }, [selected, pending]);
  const markNotColdEmailSelected = useCallback(async () => {
    setIsRejecting(true);
    for (const id of Array.from(selected.keys())) {
      const c = data?.coldEmails.find((c) => c.id === id);
      if (!c) continue;
      const result = await markNotColdEmailAction({ sender: c.fromEmail });
      handleActionResult(result, "Marked not cold email!");
      mutate();
    }
    setIsRejecting(false);
  }, [selected, data?.coldEmails, mutate]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.coldEmails.length ? (
        <div>
          {Array.from(selected.values()).filter(Boolean).length > 0 && (
            <div className="m-2 flex items-center space-x-1.5">
              {/* <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={approveSelected}
                  disabled={isApproving || isRejecting}
                >
                  {isApproving && <ButtonLoader />}
                  Approve
                </Button>
              </div> */}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markNotColdEmailSelected}
                  // disabled={isApproving || isRejecting}
                  loading={isRejecting}
                >
                  Mark Not Cold Email
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                  />
                </TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>AI Reason</TableHead>
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
                  selected={selected}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </TableBody>
          </Table>

          <TablePagination totalPages={data.totalPages} />
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
  selected,
  onToggleSelect,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
  mutate: () => void;
  selected: Map<string, boolean>;
  onToggleSelect: (id: string) => void;
}) {
  const [isMarkingColdEmail, setIsMarkingColdEmail] = useState(false);

  return (
    <TableRow key={row.id}>
      <TableCell className="text-center">
        <Checkbox
          checked={selected.get(row.id) || false}
          onChange={() => onToggleSelect(row.id)}
        />
      </TableCell>
      <TableCell>
        <SenderCell from={row.fromEmail} userEmail={userEmail} />
      </TableCell>
      <TableCell>{row.reason || "-"}</TableCell>
      <TableCell>
        <DateCell createdAt={row.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end space-x-2">
          <ViewEmailButton threadId={row.id} messageId={row.id} />
          <Button
            variant="outline"
            onClick={async () => {
              setIsMarkingColdEmail(true);
              await markNotColdEmailAction({ sender: row.fromEmail });
              mutate();
              setIsMarkingColdEmail(false);
            }}
            loading={isMarkingColdEmail}
          >
            Not cold email
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SenderCell({
  from,
  userEmail,
}: {
  from: string;
  userEmail: string;
}) {
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
      type="button"
      className="ml-2 text-gray-700 hover:text-gray-900"
      onClick={() => {
        window.open(getGmailSearchUrl(from, userEmail), "_blank");
      }}
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </button>
  );
}

function NoColdEmails() {
  const { data } = useUser();

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
