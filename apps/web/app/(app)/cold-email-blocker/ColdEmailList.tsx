"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { CircleXIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { markNotColdEmailAction } from "@/utils/actions/cold-email";
import { Checkbox } from "@/components/Checkbox";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { handleActionResult } from "@/utils/server-action";
import { useUser } from "@/hooks/useUser";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { EmailMessageCellWithData } from "@/components/EmailMessageCell";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";

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
                <TableHead>Email</TableHead>
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
        <EmailMessageCellWithData
          sender={row.fromEmail}
          userEmail={userEmail}
          threadId={row.threadId || ""}
          messageId={row.messageId || ""}
        />
      </TableCell>
      <TableCell>{row.reason || "-"}</TableCell>
      <TableCell>
        <DateCell createdAt={row.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end space-x-2">
          {row.threadId && (
            <ViewEmailButton
              threadId={row.threadId}
              messageId={row.messageId || row.threadId}
            />
          )}
          <Button
            Icon={CircleXIcon}
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

function NoColdEmails() {
  const { data } = useUser();

  if (!data?.coldEmailBlocker || data?.coldEmailBlocker === "DISABLED") {
    return (
      <div className="mb-10">
        <EnableFeatureCard
          title="Cold Email Blocker"
          description="Block unwanted cold emails automatically. Our AI identifies and filters out unsolicited sales emails before they reach your inbox."
          imageSrc="/images/illustrations/calling-help.svg"
          imageAlt="Cold email blocker"
          buttonText="Set Up"
          href="/cold-email-blocker?tab=settings"
          hideBorder
        />
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
