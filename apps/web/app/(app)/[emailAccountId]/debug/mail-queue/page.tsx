"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeading } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccount } from "@/providers/EmailAccountProvider";
import type {
  StoredMailMutation,
  CachedMailboxSyncState,
} from "@/utils/email-cache/database";
import { readMailQueueDiagnostics } from "@/utils/email-cache/mail-queue-diagnostics";
import { isActiveMailMutationStatus } from "@/utils/email-cache/mail-mutations";
import { prefixPath } from "@/utils/path";

const STATUS_DESCRIPTIONS = {
  pending: "Queued locally",
  processing: "Sending to provider",
  retry_wait: "Waiting to retry",
  blocked_auth: "Reconnect account",
  awaiting_sync: "Accepted; waiting for mailbox sync",
  reconciling: "Syncing mailbox",
  succeeded: "Completed",
  failed: "Failed",
  uncertain: "Outcome unknown",
} satisfies Record<StoredMailMutation["status"], string>;

export default function MailQueuePage() {
  const { emailAccountId } = useAccount();
  return <MailQueue key={emailAccountId} emailAccountId={emailAccountId} />;
}

function MailQueue({ emailAccountId }: { emailAccountId: string }) {
  const [filter, setFilter] = useState("active");
  const [limit, setLimit] = useState(50);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["mail-queue-diagnostics", emailAccountId, filter, limit],
    async () => ({
      ...(await readMailQueueDiagnostics({ emailAccountId, filter, limit })),
      online: navigator.onLine,
      readAt: Date.now(),
    }),
    { refreshInterval: 2000, refreshWhenOffline: true },
  );

  return (
    <PageWrapper className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading>Mail queue</PageHeading>
          <p className="mt-2 text-sm text-muted-foreground">
            Actions for this account in this browser. Refreshes every 2 seconds
            while open.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={prefixPath(emailAccountId, "/debug")}>
              Back to debug
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={isValidating}
            onClick={() => mutate()}
          >
            Refresh
          </Button>
        </div>
      </div>
      <LoadingContent
        loading={isLoading}
        error={
          error
            ? {
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not read the local queue.",
              }
            : undefined
        }
      >
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Pending actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">{data.activeCount}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Batches: {data.activeBatchCount} · Message operations:{" "}
                    {data.activeMessageCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Connection</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    {data.online
                      ? "Online"
                      : "Offline — actions wait for connection"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Updated {formatTime(data.readAt)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Mailbox sync</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{getSyncStatus(data.sync)}</p>
                  <p className="text-muted-foreground">
                    Last synced: {formatTime(data.sync?.lastSyncedAt)}
                  </p>
                  {data.sync && (
                    <p className="text-muted-foreground">
                      Coverage starts:{" "}
                      {formatTime(new Date(data.sync.after).getTime())}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <p className="text-sm text-muted-foreground">
              Pending includes actions accepted by the provider that are still
              syncing locally. This shows our queue, not the provider’s internal
              processing. Completed history is retained temporarily.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="queue-status" className="text-sm font-medium">
                Status
              </label>
              <Select
                value={filter}
                onValueChange={(value) => {
                  setFilter(value);
                  setLimit(50);
                }}
              >
                <SelectTrigger id="queue-status" className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    Pending actions ({data.activeCount})
                  </SelectItem>
                  <SelectItem value="all">All ({data.total})</SelectItem>
                  {Object.entries(STATUS_DESCRIPTIONS).map(
                    ([status, description]) => (
                      <SelectItem key={status} value={status}>
                        {description} (
                        {data.counts[status as StoredMailMutation["status"]] ??
                          0}
                        )
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                Showing {data.mutations.length} of {data.matchingCount} actions
              </span>
            </div>
            {data.matchingCount === 0 ? (
              <p className="rounded-md border p-6 text-sm text-muted-foreground">
                No actions match this status.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:align-top">
                  {data.mutations.map((mutation) => (
                    <TableRow key={mutation.id}>
                      <TableCell className="whitespace-nowrap">
                        {mutation.kind.replaceAll("_", " ")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            mutation.status === "failed" ||
                            mutation.status === "uncertain" ||
                            mutation.status === "blocked_auth"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {STATUS_DESCRIPTIONS[mutation.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{mutation.messageIds.length}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {mutation.attempts} provider /{" "}
                        {mutation.syncAttempts ?? 0} sync
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatTime(mutation.createdAt)}
                      </TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer whitespace-nowrap">
                            Inspect action
                          </summary>
                          <dl className="mt-3 min-w-56 space-y-2 break-all text-xs">
                            <dt>Action ID</dt>
                            <dd>{mutation.id}</dd>
                            <dt>Batch ID</dt>
                            <dd>{mutation.batchId}</dd>
                            <dt>Thread ID</dt>
                            <dd>{mutation.threadId}</dd>
                            <dt>Message IDs</dt>
                            <dd>{mutation.messageIds.join(", ")}</dd>
                            <dt>Updated</dt>
                            <dd>{formatTime(mutation.updatedAt)}</dd>
                            {isActiveMailMutationStatus(mutation.status) && (
                              <>
                                <dt>Next eligible attempt</dt>
                                <dd>{formatTime(mutation.nextAttemptAt)}</dd>
                              </>
                            )}
                            {mutation.leaseExpiresAt && (
                              <>
                                <dt>Worker lease expires</dt>
                                <dd>{formatTime(mutation.leaseExpiresAt)}</dd>
                              </>
                            )}
                            {mutation.lastError && (
                              <>
                                <dt>Last error</dt>
                                <dd className="text-destructive">
                                  {mutation.lastError}
                                </dd>
                              </>
                            )}
                          </dl>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.matchingCount > limit && (
              <Button variant="outline" onClick={() => setLimit(limit + 50)}>
                Show more
              </Button>
            )}
          </>
        )}
      </LoadingContent>
    </PageWrapper>
  );
}

function formatTime(timestamp?: number) {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return "—";
  return new Date(timestamp).toLocaleString();
}

function getSyncStatus(sync?: CachedMailboxSyncState) {
  if (!sync) return "No sync recorded";
  return sync.hasMore ? "Catching up" : "Caught up at last sync";
}
