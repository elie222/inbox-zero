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

type Filing = GetFilingsResponse["filings"][number];

export function FilingActivity() {
  const { data, isLoading, error } = useFilingActivity({
    limit: 10,
    offset: 0,
  });

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
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.filings.map((filing) => (
                  <FilingRow key={filing.id} filing={filing} />
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

function FilingRow({ filing }: { filing: Filing }) {
  const driveUrl = filing.fileId
    ? getDriveFileUrl(filing.fileId, filing.driveConnection.provider)
    : null;

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium truncate max-w-[200px] block">
          {filing.filename}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground truncate max-w-[200px] block">
          {filing.folderPath}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(filing.createdAt), { addSuffix: true })}
        </span>
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
