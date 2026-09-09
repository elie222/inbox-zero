"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import type { AllTrainedSendersResponse } from "@/app/api/user/trained-senders/all/route";
import {
  PageNumbers,
  TrainedSenderRow,
  toRuleOptions,
} from "@/app/(app)/[emailAccountId]/assistant/TrainedSenders";
import { useRules } from "@/hooks/useRules";
import { AlertBasic } from "@/components/Alert";
import { LoadingContent } from "@/components/LoadingContent";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MutedText } from "@/components/Typography";

// One list across every mailbox of yours in the organization, newest
// training first. Rows act on their own mailbox.
export function OrgTrainedSenders({
  organizationId,
}: {
  organizationId: string;
}) {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    if (draft === query) return;
    const id = window.setTimeout(() => {
      setQuery(draft || null);
      setPage(null);
    }, 300);
    return () => window.clearTimeout(id);
  }, [draft, query, setQuery, setPage]);

  const { data, isLoading, error, mutate } = useSWR<AllTrainedSendersResponse>(
    `/api/user/trained-senders/all?organizationId=${organizationId}&page=${page}&q=${encodeURIComponent(query)}`,
  );

  const emailById = useMemo(
    () => new Map(data?.accounts.map((a) => [a.id, a.email])),
    [data?.accounts],
  );
  const senders = data?.senders ?? [];

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Filter by sender"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-sm"
          aria-label="Filter trained senders"
        />
        {data && (
          <MutedText>
            {data.total} trained sender{data.total === 1 ? "" : "s"} total
          </MutedText>
        )}
      </div>

      <Card className="mt-2">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="m-4 h-32 rounded" />}
        >
          {senders.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Learned from</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {senders.map((sender) => (
                      <OrgRow
                        key={`${sender.emailAccountId} ${sender.sender}`}
                        sender={sender}
                        mailbox={emailById.get(sender.emailAccountId) ?? ""}
                        mutate={mutate}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PageNumbers
                page={page}
                totalPages={data?.totalPages ?? 1}
                onChange={(next) => setPage(next === 1 ? null : next)}
              />
            </>
          ) : (
            <AlertBasic
              title={query ? "No senders match" : "No trained senders yet"}
              description={
                query
                  ? "Try a different filter."
                  : "Move an email to a label in any mailbox and it will show up here."
              }
            />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

// Rules are per mailbox, so each row loads its own (SWR dedupes per mailbox).
function OrgRow({
  sender,
  mailbox,
  mutate,
}: {
  sender: AllTrainedSendersResponse["senders"][number];
  mailbox: string;
  mutate: () => void;
}) {
  const { data: rules } = useRules(sender.emailAccountId);
  const ruleOptions = useMemo(() => toRuleOptions(rules), [rules]);

  return (
    <TrainedSenderRow
      sender={sender}
      ruleOptions={ruleOptions}
      emailAccountId={sender.emailAccountId}
      mailbox={mailbox}
      mutate={mutate}
    />
  );
}
