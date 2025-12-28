"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText, SectionHeader } from "@/components/Typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import { getDriveFileUrl } from "@/utils/drive/url";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import { TableCellWithTooltip } from "@/components/drive/TableCellWithTooltip";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";

export function FilingActivity() {
  const { data, isLoading, error } = useFilingActivity({
    limit: 10,
    offset: 0,
  });
  const { data: connectionsData } = useDriveConnections();

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
                    filing={filing}
                    connections={connectionsData?.connections || []}
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
  filing,
  connections,
}: {
  filing: GetFilingsResponse["filings"][number];
  connections: GetDriveConnectionsResponse["connections"];
}) {
  const connection = connections.find((c) => c.id === filing.driveConnectionId);

  const driveUrl = filing.fileId
    ? getDriveFileUrl(filing.fileId, connection?.provider || "")
    : null;

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium truncate max-w-[200px] block">
          {filing.filename}
        </span>
      </TableCell>
      <TableCell className="break-words max-w-[200px]">
        <TableCellWithTooltip
          text={filing.folderPath}
          tooltipContent={filing.folderPath}
          className="text-muted-foreground"
        />
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(filing.createdAt), { addSuffix: true })}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center">
          <YesNoIndicator value={filing.feedbackPositive} />
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
