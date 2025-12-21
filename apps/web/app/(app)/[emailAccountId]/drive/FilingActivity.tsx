"use client";

import { formatDistanceToNow } from "date-fns";
import {
  FileIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  CornerDownRightIcon,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { LoadingContent } from "@/components/LoadingContent";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";

type Filing = GetFilingsResponse["filings"][number];

export function FilingActivity() {
  const { data, isLoading, error } = useFilingActivity(10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Documents filed from your emails</CardDescription>
      </CardHeader>
      <CardContent>
        <LoadingContent loading={isLoading} error={error}>
          {data && data.filings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileIcon className="opacity-50" />
                </EmptyMedia>
                <EmptyTitle>No documents filed yet</EmptyTitle>
                <EmptyDescription>
                  When attachments are filed, they&apos;ll appear here
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {data?.filings.map((filing) => (
                <FilingItem key={filing.id} filing={filing} />
              ))}
            </div>
          )}
        </LoadingContent>

        {data && data.total > 10 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing {data.filings.length} of {data.total} filings
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FilingItem({ filing }: { filing: Filing }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="mt-0.5">
        <StatusIcon status={filing.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{filing.filename}</span>
          {filing.wasCorrected && (
            <Badge variant="outline" className="text-xs">
              Corrected
            </Badge>
          )}
          {filing.wasAsked && filing.status === "PENDING" && (
            <Badge variant="secondary" className="text-xs">
              Waiting
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
          <ArrowRightIcon className="h-3 w-3" />
          <span className="truncate">{filing.folderPath}</span>
        </div>
        {filing.wasCorrected && filing.originalPath && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <CornerDownRightIcon className="h-3 w-3" />
            <span className="line-through truncate">{filing.originalPath}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(filing.createdAt), {
              addSuffix: true,
            })}
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">
            {isGoogleProvider(filing.driveConnection.provider)
              ? "Google Drive"
              : "OneDrive"}
          </span>
          {filing.confidence !== null && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(filing.confidence * 100)}% confidence
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Filing["status"] }) {
  switch (status) {
    case "FILED":
      return <CheckCircle2Icon className="h-5 w-5 text-green-500" />;
    case "PENDING":
      return <ClockIcon className="h-5 w-5 text-yellow-500" />;
    case "REJECTED":
      return <XCircleIcon className="h-5 w-5 text-gray-400" />;
    case "ERROR":
      return <AlertCircleIcon className="h-5 w-5 text-red-500" />;
    default:
      return <FileIcon className="h-5 w-5 text-gray-400" />;
  }
}
