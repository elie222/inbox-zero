"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { MailDiagnostics } from "@inboxzero/mail-core/engine";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import {
  isPendingEffectStatus,
  type OperationStatus,
} from "@inboxzero/mail-core/operations";
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
import { prefixPath } from "@/utils/path";

const STATUS_DESCRIPTIONS = {
  preparing: "Preparing",
  queued: "Queued locally",
  executing: "Sending to provider",
  verifying: "Confirming with mailbox",
  retry_wait: "Waiting to retry",
  blocked_auth: "Reconnect account",
  uncertain: "Outcome unknown",
  needs_attention: "Needs attention",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  superseded: "Superseded",
} satisfies Record<OperationStatus, string>;

export default function MailQueuePage() {
  const { emailAccountId } = useAccount();
  return <MailQueue key={emailAccountId} emailAccountId={emailAccountId} />;
}

function MailQueue({ emailAccountId }: { emailAccountId: string }) {
  const client = useOptionalMailClient();
  const [filter, setFilter] = useState("active");
  const [limit, setLimit] = useState(50);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    client ? ["mail-queue-diagnostics", emailAccountId, filter, limit] : null,
    async () => {
      if (!client) throw new Error("Mail engine is unavailable");
      const diagnostics = await client.getDiagnostics(emailAccountId);
      return {
        ...summarizeDiagnostics(diagnostics, filter, limit),
        online: navigator.onLine,
        readAt: Date.now(),
      };
    },
    { refreshInterval: 2000, refreshWhenOffline: true },
  );

  return (
    <PageWrapper className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeading>Mail queue</PageHeading>
          <p className="mt-2 text-sm text-muted-foreground">
            Engine operations for this account in this browser. Refreshes every
            2 seconds while open.
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
            disabled={isValidating || !client}
            onClick={() => mutate()}
          >
            Refresh
          </Button>
        </div>
      </div>
      <LoadingContent
        loading={isLoading || !client}
        error={
          error
            ? {
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not read the mail engine queue.",
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
                    Uncertain: {data.uncertainCount} · Sync jobs:{" "}
                    {data.pendingJobs}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Connection</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{connectionLabel(data.connection, data.online)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Updated {formatTime(data.readAt)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Mailbox coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{coverageLabel(data.coverage)}</p>
                  <p className="text-muted-foreground">
                    Last completed sync:{" "}
                    {formatTime(data.lastCompletedSyncAtMs)}
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="text-sm text-muted-foreground">
              Pending includes admitted operations that have not reached a
              terminal state. This shows the local engine, not the provider’s
              internal processing.
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
                        {description} ({data.counts[status] ?? 0})
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                Showing {data.commands.length} of {data.matchingCount} actions
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
                    <TableHead>Conversations</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:align-top">
                  {data.commands.map((command) => (
                    <TableRow key={command.operationId}>
                      <TableCell className="whitespace-nowrap">
                        {(command.changeKind ?? command.kind).replaceAll(
                          "_",
                          " ",
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            command.status === "failed" ||
                            command.status === "uncertain" ||
                            command.status === "blocked_auth" ||
                            command.status === "needs_attention"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {STATUS_DESCRIPTIONS[command.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{command.messageIds.length}</TableCell>
                      <TableCell>{command.conversationIds.length}</TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer whitespace-nowrap">
                            Inspect action
                          </summary>
                          <dl className="mt-3 min-w-56 space-y-2 break-all text-xs">
                            <dt>Operation ID</dt>
                            <dd>{command.operationId}</dd>
                            {command.conversationIds.length > 0 && (
                              <>
                                <dt>Conversation IDs</dt>
                                <dd>{command.conversationIds.join(", ")}</dd>
                              </>
                            )}
                            {command.messageIds.length > 0 && (
                              <>
                                <dt>Message IDs</dt>
                                <dd>{command.messageIds.join(", ")}</dd>
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

function summarizeDiagnostics(
  diagnostics: MailDiagnostics,
  filter: string,
  limit: number,
) {
  const counts = Object.fromEntries(
    Object.keys(STATUS_DESCRIPTIONS).map((status) => [status, 0]),
  ) as Record<string, number>;
  for (const command of diagnostics.commands) {
    counts[command.status] = (counts[command.status] ?? 0) + 1;
  }
  const matching = diagnostics.commands.filter((command) => {
    if (filter === "all") return true;
    if (filter === "active") {
      return (
        command.status === "preparing" || isPendingEffectStatus(command.status)
      );
    }
    return command.status === filter;
  });
  const coverage = diagnostics.coverage[0];
  return {
    connection: diagnostics.connection,
    coverage: coverage?.metadata,
    lastCompletedSyncAtMs: coverage?.lastCompletedSyncAtMs ?? null,
    activeCount: diagnostics.pendingOperations,
    uncertainCount: diagnostics.uncertainOperations,
    pendingJobs: diagnostics.pendingJobs,
    total: diagnostics.commands.length,
    matchingCount: matching.length,
    counts,
    commands: matching.slice(0, limit),
  };
}

function formatTime(timestamp?: number | null) {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(timestamp)
  )
    return "—";
  return new Date(timestamp).toLocaleString();
}

function connectionLabel(
  connection: MailDiagnostics["connection"],
  online: boolean,
) {
  if (connection === "blocked_auth") return "Reconnect account";
  if (connection === "offline" || !online)
    return "Offline — actions wait for connection";
  return "Online";
}

function coverageLabel(
  metadata?: MailDiagnostics["coverage"][number]["metadata"],
) {
  if (!metadata) return "No coverage recorded";
  return metadata === "complete" ? "Metadata complete" : "Catching up";
}
