"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { getDateFnsLocale } from "@/utils/i18n/date-fns-locale";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ExternalLinkIcon, FolderIcon, InfoIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { MutedText, SectionHeader } from "@/components/Typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/Tooltip";
import { useFilingActivity } from "@/hooks/useFilingActivity";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { getDriveFileUrl } from "@/utils/drive/url";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import type { DriveProviderType } from "@/utils/drive/types";
import {
  submitPreviewFeedbackAction,
  moveFilingAction,
} from "@/utils/actions/drive";
import { useAccount } from "@/providers/EmailAccountProvider";

export function FilingActivity() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useFilingActivity({
    limit: 10,
    offset: 0,
  });
  const { data: connectionsData } = useDriveConnections();
  const { data: foldersData } = useDriveFolders();
  const refreshFilings = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <div>
      <SectionHeader className="mb-3">
        <Trans>Recent Activity</Trans>
      </SectionHeader>
      <LoadingContent loading={isLoading} error={error}>
        {data?.filings.length === 0 ? (
          <MutedText className="italic">
            <Trans>No recently filed documents.</Trans>
          </MutedText>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Trans>File</Trans>
                  </TableHead>
                  <TableHead>
                    <Trans>Folder</Trans>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <Trans>When</Trans>
                  </TableHead>
                  <TableHead className="w-[80px] text-center">
                    <Trans>Correct?</Trans>
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
                    savedFolders={foldersData?.savedFolders || []}
                    onFeedbackSaved={refreshFilings}
                  />
                ))}
              </TableBody>
            </Table>
            {data && data.total > 10 && (
              <MutedText className="p-3 border-t">
                <Trans>
                  Showing {data.filings.length} of{" "}
                  <Plural value={data.total} one="# filing" other="# filings" />
                </Trans>
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
  savedFolders,
  onFeedbackSaved,
}: {
  emailAccountId: string;
  filing: GetFilingsResponse["filings"][number];
  connections: GetDriveConnectionsResponse["connections"];
  savedFolders: { folderId: string; folderName: string; folderPath: string }[];
  onFeedbackSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const [vote, setVote] = useState<boolean | null>(
    filing.feedbackPositive ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const voteBeforeDropdownRef = useRef<boolean | null>(null);

  const connection = connections.find((c) => c.id === filing.driveConnectionId);

  const driveUrl = filing.fileId
    ? getDriveFileUrl(filing.fileId, connection?.provider as DriveProviderType)
    : null;

  const canGiveFeedback =
    filing.status !== "PENDING" && filing.status !== "ERROR";

  useEffect(() => {
    setVote(filing.feedbackPositive ?? null);
  }, [filing.feedbackPositive]);

  const handleCorrectClick = useCallback(async () => {
    if (!canGiveFeedback || isSubmitting) return;

    const previousValue = vote;
    setVote(true);
    setIsSubmitting(true);

    try {
      const result = await submitPreviewFeedbackAction(emailAccountId, {
        filingId: filing.id,
        feedbackPositive: true,
      });

      if (result?.serverError) {
        setVote(previousValue);
        toastError({ description: t`Failed to submit feedback` });
        return;
      }

      onFeedbackSaved();
    } catch {
      setVote(previousValue);
      toastError({ description: t`Failed to submit feedback` });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canGiveFeedback,
    emailAccountId,
    filing.id,
    isSubmitting,
    onFeedbackSaved,
    vote,
    t,
  ]);

  const handleMoveToFolder = useCallback(
    async (folderId: string, folderName: string, folderPath: string) => {
      if (!canGiveFeedback || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const result = await moveFilingAction(emailAccountId, {
          filingId: filing.id,
          targetFolderId: folderId,
          targetFolderPath: folderPath,
        });

        if (result?.serverError) {
          setVote(voteBeforeDropdownRef.current);
          toastError({ description: t`Failed to move file` });
          return;
        }

        toastSuccess({ description: t`Moved to ${folderName}` });
      } catch {
        setVote(voteBeforeDropdownRef.current);
        toastError({ description: t`Failed to move file` });
      } finally {
        setIsSubmitting(false);
      }
    },
    [canGiveFeedback, emailAccountId, filing.id, isSubmitting, t],
  );

  const handleWrongClick = useCallback(async () => {
    if (!canGiveFeedback || isSubmitting) return;

    const previousValue = vote;
    setVote(false);
    setIsSubmitting(true);

    try {
      const result = await submitPreviewFeedbackAction(emailAccountId, {
        filingId: filing.id,
        feedbackPositive: false,
      });

      if (result?.serverError) {
        setVote(previousValue);
        toastError({ description: t`Failed to submit feedback` });
        return;
      }

      onFeedbackSaved();
    } catch {
      setVote(previousValue);
      toastError({ description: t`Failed to submit feedback` });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canGiveFeedback,
    emailAccountId,
    filing.id,
    isSubmitting,
    onFeedbackSaved,
    vote,
    t,
  ]);

  const handleFeedbackClick = useCallback(
    (value: boolean) => {
      if (value) {
        handleCorrectClick();
      } else {
        handleWrongClick();
      }
    },
    [handleCorrectClick, handleWrongClick],
  );

  const otherFolders = savedFolders.filter(
    (f) => f.folderPath !== filing.folderPath,
  );
  const filename = filing.filename;

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
          {formatDistanceToNow(new Date(filing.createdAt), {
            addSuffix: true,
            locale: getDateFnsLocale(i18n.locale),
          })}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center">
          {canGiveFeedback && !isSubmitting && otherFolders.length > 0 ? (
            <DropdownMenu
              onOpenChange={(open) => {
                setDropdownOpen(open);
                if (open) {
                  voteBeforeDropdownRef.current = vote;
                  setVote(false);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <div>
                  <YesNoIndicator
                    value={vote}
                    onClick={handleFeedbackClick}
                    dropdownTrigger="wrong"
                    wrongActive={dropdownOpen}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <Trans>Which folder does this file belong in?</Trans>
                </DropdownMenuLabel>
                {otherFolders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.folderId}
                    onClick={() =>
                      handleMoveToFolder(
                        folder.folderId,
                        folder.folderName,
                        folder.folderPath,
                      )
                    }
                  >
                    <FolderIcon className="size-4" />
                    {folder.folderName}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => setVote(voteBeforeDropdownRef.current)}
                >
                  <Trans>Cancel</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <YesNoIndicator
              value={vote}
              onClick={
                canGiveFeedback && !isSubmitting
                  ? handleFeedbackClick
                  : undefined
              }
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label={t`Open ${filename} in drive`}
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
  const { t } = useLingui();
  const isSkipped = !filing.folderPath;

  if (isSkipped) {
    return (
      <Tooltip content={filing.reasoning || t`Doesn't match preferences`}>
        <span className="flex items-center gap-1.5 text-muted-foreground italic">
          <Trans>Skipped</Trans>
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
