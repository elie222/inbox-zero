"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import useSWR from "swr";
import { CircleXIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/DateCell";
import { TablePagination } from "@/components/TablePagination";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { markNotColdEmailAction } from "@/utils/actions/cold-email";
import { toggleRuleAction } from "@/utils/actions/rule";
import { Checkbox } from "@/components/Checkbox";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { EmailMessageCellWithData } from "@/components/EmailMessageCell";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useRules } from "@/hooks/useRules";
import { isColdEmailBlockerEnabled } from "@/utils/cold-email/cold-email-blocker-enabled";
import { SystemType } from "@/generated/prisma/enums";

export function ColdEmailList() {
  const { t } = useLingui();
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
        toastSuccess({ description: t`Marked not cold email!` });
      },
      onError: () => {
        toastError({ description: t`Error marking not cold email!` });
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
                  <Trans>Mark Not Cold Email</Trans>
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">
                  <Checkbox
                    label={
                      isAllSelected
                        ? t`Deselect all cold emails`
                        : t`Select all cold emails`
                    }
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                  />
                </TableHead>
                <TableHead>
                  <Trans>Email</Trans>
                </TableHead>
                <TableHead>
                  <Trans>AI Reason</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Date</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Actions</Trans>
                  </span>
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
  const { t } = useLingui();
  const fromEmail = row.fromEmail;

  return (
    <TableRow key={row.id}>
      <TableCell className="text-center">
        <Checkbox
          label={t`Select ${fromEmail}`}
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
            <Trans>Not cold email</Trans>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NoColdEmails() {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data: rules, mutate: mutateRules } = useRules();

  const { executeAsync: enableColdEmailBlocker } = useAction(
    toggleRuleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Cold email blocker enabled!` });
        mutateRules();
      },
      onError: () => {
        toastError({ description: t`Error enabling cold email blocker` });
      },
    },
  );

  if (!isColdEmailBlockerEnabled(rules || [])) {
    return (
      <div className="mb-10">
        <EnableFeatureCard
          title={t`Cold Email Blocker`}
          description={t`Our AI identifies cold outreach from senders you've never communicated with before. You can customize the prompt after enabling.`}
          imageSrc="/images/illustrations/calling-help.svg"
          imageAlt={t`Cold email blocker`}
          buttonText={t`Enable`}
          onEnable={async () => {
            await enableColdEmailBlocker({
              systemType: SystemType.COLD_EMAIL,
              enabled: true,
            });
          }}
          hideBorder
        />
      </div>
    );
  }

  return (
    <div className="p-2">
      <AlertBasic
        title={t`No cold emails!`}
        description={t`We haven't marked any of your emails as cold emails yet!`}
      />
    </div>
  );
}
