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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingContent } from "@/components/LoadingContent";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";

type Filing = GetFilingsResponse["filings"][number];

export function FilingActivity() {
  const { data, isLoading, error } = useFilingActivity(10);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">
            Documents filed from your emails
          </p>
        </div>

        <LoadingContent loading={isLoading} error={error}>
          {data && data.filings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileIcon className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>No documents filed yet</p>
              <p className="text-sm">
                When attachments are filed, they&apos;ll appear here
              </p>
            </div>
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
      </div>
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
            {filing.driveConnection.provider === "google"
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
