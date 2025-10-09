"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import useSWR from "swr";
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
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/ExecutedRulesTable";
import { TablePagination } from "@/components/TablePagination";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { markNotColdEmailAction } from "@/utils/actions/cold-email";
import { Checkbox } from "@/components/Checkbox";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { EmailMessageCellWithData } from "@/components/EmailMessageCell";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useRules } from "@/hooks/useRules";
import { isColdEmailBlockerEnabled } from "@/utils/cold-email/cold-email-blocker-enabled";

export function ColdEmailList() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error, mutate } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}`,
  );

  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(data?.coldEmails || []);

  const { emailAccountId, userEmail } = useAccount();
  const { executeAsync: markNotColdEmail, isExecuting } = useAction(
    markNotColdEmailAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Marked not cold email!" });
      },
      onError: () => {
        toastError({ description: "Error marking not cold email!" });
      },
    },
  );

  const markNotColdEmailSelected = useCallback(async () => {
    const calls = Array.from(selected.keys())
      .map((id) => data?.coldEmails.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => markNotColdEmail({ sender: c!.fromEmail }));

    await Promise.all(calls);
    mutate();
  }, [selected, data?.coldEmails, mutate, markNotColdEmail]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.coldEmails.length ? (
        <div>
          {Array.from(selected.values()).filter(Boolean).length > 0 && (
            <div className="m-2 flex items-center space-x-1.5">
              <div>
                <Button
                  size="sm"
                  onClick={markNotColdEmailSelected}
                  loading={isExecuting}
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
                  markNotColdEmail={markNotColdEmail}
                  isExecuting={isExecuting}
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
  markNotColdEmail,
  isExecuting,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
  mutate: () => void;
  selected: Map<string, boolean>;
  onToggleSelect: (id: string) => void;
  markNotColdEmail: (input: { sender: string }) => Promise<unknown>;
  isExecuting: boolean;
}) {
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
              await markNotColdEmail({ sender: row.fromEmail });
              mutate();
            }}
            loading={isExecuting}
          >
            Not cold email
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NoColdEmails() {
  const { emailAccountId } = useAccount();
  const { data: rules } = useRules();

  if (!isColdEmailBlockerEnabled(rules || [])) {
    return (
      <div className="mb-10">
        <EnableFeatureCard
          title="Cold Email Blocker"
          description="Block unwanted cold emails automatically. Our AI identifies and filters out unsolicited sales emails before they reach your inbox."
          imageSrc="/images/illustrations/calling-help.svg"
          imageAlt="Cold email blocker"
          buttonText="Set Up"
          href={prefixPath(emailAccountId, "/cold-email-blocker?tab=settings")}
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
