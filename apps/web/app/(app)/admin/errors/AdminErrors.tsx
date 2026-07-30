"use client";

import {
  AlarmClockIcon,
  TriangleAlertIcon,
  UserXIcon,
  ZapIcon,
} from "lucide-react";
import { ExpandableText } from "@/components/ExpandableText";
import { LoadingContent } from "@/components/LoadingContent";
import { StatsCards } from "@/components/StatsCards";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminErrors } from "@/hooks/useAdminErrors";

const SOURCE_LABEL: Record<string, string> = {
  automation: "Automation",
  rule: "Rule",
  scheduled: "Scheduled action",
};

export function AdminErrors() {
  const { data, isLoading, error } = useAdminErrors();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64" />}
    >
      {data && (
        <div className="space-y-6">
          <StatsCards
            stats={[
              {
                name: "Users in error state",
                value: data.summary.usersInErrorState.toLocaleString(),
                icon: <UserXIcon className="h-4 w-4" />,
              },
              {
                name: "Failed automation runs",
                value: data.summary.failedAutomationRuns.toLocaleString(),
                icon: <ZapIcon className="h-4 w-4" />,
              },
              {
                name: "Rule errors",
                value: data.summary.ruleErrors.toLocaleString(),
                icon: <TriangleAlertIcon className="h-4 w-4" />,
              },
              {
                name: "Failed scheduled actions",
                value: data.summary.failedScheduledActions.toLocaleString(),
                icon: <AlarmClockIcon className="h-4 w-4" />,
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Error types</CardTitle>
            </CardHeader>
            <CardContent>
              {data.byErrorType.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">
                        Users affected
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byErrorType.map((row) => (
                      <TableRow key={row.errorType}>
                        <TableCell>{row.errorType}</TableCell>
                        <TableCell className="text-right">
                          {row.count.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <MutedText>No users are currently in an error state.</MutedText>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users needing attention</CardTitle>
            </CardHeader>
            <CardContent>
              {data.brokenUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.brokenUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="align-top">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {user.errors.map((entry) => (
                              <div
                                key={`${user.id}-${entry.key}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <Badge variant="red">{entry.errorType}</Badge>
                                <MutedText>{entry.message}</MutedText>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <MutedText>Nobody is in a broken state right now.</MutedText>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent failures</CardTitle>
            </CardHeader>
            <CardContent>
              {data.feed.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>What happened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.feed.map((entry) => (
                      <TableRow key={`${entry.source}-${entry.id}`}>
                        <TableCell className="whitespace-nowrap align-top">
                          {formatDateTime(entry.at)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">
                            {SOURCE_LABEL[entry.source] ?? entry.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          {entry.email ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div>{entry.summary}</div>
                          {entry.detail && (
                            <ExpandableText
                              text={entry.detail}
                              className="text-sm text-muted-foreground"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <MutedText>No failures recorded.</MutedText>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
