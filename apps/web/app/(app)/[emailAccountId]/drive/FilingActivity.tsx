"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { MutedText, SectionHeader } from "@/components/Typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip } from "@/components/Tooltip";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import { getDriveFileUrl } from "@/utils/drive/url";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import type { DriveProviderType } from "@/utils/drive/types";
import { submitPreviewFeedbackAction } from "@/utils/actions/drive";
import { useAccount } from "@/providers/EmailAccountProvider";

export function FilingActivity() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useFilingActivity({
    limit: 10,
    offset: 0,
  });
  const { data: connectionsData } = useDriveConnections();
  const refreshFilings = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <div>
      <SectionHeader className="mb-3">Recent Activity</SectionHeader>
      <LoadingContent loading={isLoading} error={error}>
        {data?.filings.length === 0 ? (
          <MutedText className="italic">No recently filed documents.</MutedText>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead className="w-[100px]">When</TableHead>
                  <TableHead className="w-[80px] text-center">
                    Correct?
                  </TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.filings.map((filing) => (
                  <FilingRow
                    key={filing.id}
                    emailAccountId={emailAccountId}
                    filing={filing}
                    connections={connectionsData?.connections || []}
                    onFeedbackSaved={refreshFilings}
                  />
                ))}
              </TableBody>
            </Table>
            {data && data.total > 10 && (
              <MutedText className="p-3 border-t">
                Showing {data.filings.length} of {data.total} filings
              </MutedText>
            )}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  filing,
  connections,
  onFeedbackSaved,
}: {
  emailAccountId: string;
  filing: GetFilingsResponse["filings"][number];
  connections: GetDriveConnectionsResponse["connections"];
  onFeedbackSaved: () => void;
}) {
  const [vote, setVote] = useState<boolean | null>(
    filing.feedbackPositive ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const connection = connections.find((c) => c.id === filing.driveConnectionId);

  const driveUrl = filing.fileId
    ? getDriveFileUrl(filing.fileId, connection?.provider as DriveProviderType)
    : null;

  const canGiveFeedback =
    filing.status !== "PENDING" && filing.status !== "ERROR";

  useEffect(() => {
    setVote(filing.feedbackPositive ?? null);
  }, [filing.feedbackPositive]);

  const handleFeedbackClick = useCallback(
    async (value: boolean) => {
      if (!canGiveFeedback || isSubmitting) return;

      const previousValue = vote;
      setVote(value);
      setIsSubmitting(true);

      try {
        const result = await submitPreviewFeedbackAction(emailAccountId, {
          filingId: filing.id,
          feedbackPositive: value,
        });

        if (result?.serverError) {
          setVote(previousValue ?? null);
          toastError({ description: "Failed to submit feedback" });
          return;
        }

        onFeedbackSaved();
      } catch {
        setVote(previousValue ?? null);
        toastError({ description: "Failed to submit feedback" });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canGiveFeedback,
      emailAccountId,
      filing.id,
      isSubmitting,
      onFeedbackSaved,
      vote,
    ],
  );

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium truncate max-w-[200px] block">
          {filing.filename}
        </span>
      </TableCell>
      <TableCell className="break-words max-w-[200px]">
        <FolderCell filing={filing} />
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(filing.createdAt), { addSuffix: true })}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center">
          <YesNoIndicator
            value={vote}
            onClick={
              canGiveFeedback && !isSubmitting ? handleFeedbackClick : undefined
            }
          />
        </div>
      </TableCell>
      <TableCell>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Open ${filing.filename} in drive`}
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        )}
      </TableCell>
    </TableRow>
  );
}

function FolderCell({
  filing,
}: {
  filing: GetFilingsResponse["filings"][number];
}) {
  const isSkipped = !filing.folderPath;

  if (isSkipped) {
    return (
      <Tooltip content={filing.reasoning || "Doesn't match preferences"}>
        <span className="flex items-center gap-1.5 text-muted-foreground italic">
          Skipped
          <InfoIcon className="size-3.5 shrink-0" />
        </span>
      </Tooltip>
    );
  }

  return (
    <span className="text-muted-foreground truncate block">
      {filing.folderPath}
    </span>
  );
}
