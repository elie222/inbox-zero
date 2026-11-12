"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ExternalLinkIcon, FolderIcon, PlusIcon } from "lucide-react";
import {
  TypographyH3,
  SectionDescription,
  TypographyP,
  TypographyH4,
  MutedText,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { FilingStatusCell } from "@/components/drive/FilingStatusCell";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import { TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useFilingPreviewAttachments } from "@/hooks/useFilingPreviewAttachments";
import {
  updateFilingPromptAction,
  updateFilingEnabledAction,
  moveFilingAction,
  fileAttachmentAction,
  submitPreviewFeedbackAction,
  type FileAttachmentFiled,
} from "@/utils/actions/drive";
import {
  updateFilingPromptBody,
  type UpdateFilingPromptBody,
} from "@/utils/actions/drive.validation";
import {
  CreateFolderDialog,
  FolderNode,
  NoFoldersFound,
} from "./AllowedFolders";
import { useFolderSelection } from "./use-folder-selection";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { DriveConnectionCard, getProviderInfo } from "./DriveConnectionCard";
import type { AttachmentPreviewItem } from "@/app/api/user/drive/preview/attachments/route";
import { LoadingContent } from "@/components/LoadingContent";
import { getEmailUrlForMessage } from "@/utils/url";
import { AlertBasic } from "@/components/Alert";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

type SetupPhase = "setup" | "loading-attachments" | "preview" | "starting";

type FilingState = {
  status: "pending" | "filing" | "filed" | "skipped" | "error";
  result?: FileAttachmentFiled;
  error?: string;
  skipReason?: string;
  filingId?: string; // Available for both filed and skipped items (for feedback)
};

export function DriveSetup() {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("attachments");
  const { data: connectionsData } = useDriveConnections();
  const {
    data: foldersData,
    isLoading: foldersLoading,
    mutate: mutateFolders,
  } = useDriveFolders(emailAccountId);
  const { data: emailAccount, mutate: mutateEmail } = useEmailAccountFull();

  const connections = connectionsData?.connections || [];
  const connection = connections[0];
  const providerInfo = connection ? getProviderInfo(connection.provider) : null;

  const [userPhase, setUserPhase] = useState<
    "setup" | "previewing" | "starting"
  >("setup");
  const [filingStates, setFilingStates] = useState<Record<string, FilingState>>(
    {},
  );

  const shouldFetchAttachments =
    userPhase === "previewing" || userPhase === "starting";
  const { data: attachmentsData, isLoading: attachmentsLoading } =
    useFilingPreviewAttachments(shouldFetchAttachments, {
      onSuccess: (data) => {
        analytics.captureAction("auto_file_preview_completed", {
          attachment_count: data.attachments.length,
          no_attachments_found: data.noAttachmentsFound,
        });
        // Initialize states and trigger filing for each attachment
        const initial: Record<string, FilingState> = {};
        for (const att of data.attachments) {
          const key = `${att.messageId}-${att.filename}`;
          initial[key] = { status: "filing" };

          fileAttachmentAction(emailAccountId, {
            messageId: att.messageId,
            filename: att.filename,
          })
            .then((result) => {
              const resultData = result?.data;
              if (result?.serverError) {
                analytics.captureAction("auto_file_preview_item_failed", {
                  reason: "server_error",
                });
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: result.serverError },
                }));
              } else if (resultData?.skipped) {
                analytics.captureAction("auto_file_preview_item_skipped");
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: {
                    status: "skipped",
                    skipReason: resultData.skipReason,
                    filingId: resultData.filingId,
                  },
                }));
              } else if (resultData) {
                analytics.captureAction("auto_file_preview_item_filed");
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "filed", result: resultData },
                }));
              } else {
                analytics.captureAction("auto_file_preview_item_failed", {
                  reason: "unknown",
                });
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: t`Unknown error` },
                }));
              }
            })
            .catch((err) => {
              analytics.captureAction("auto_file_preview_item_failed", {
                reason: "exception",
              });
              setFilingStates((prev) => ({
                ...prev,
                [key]: {
                  status: "error",
                  error: err instanceof Error ? err.message : t`Filing failed`,
                },
              }));
            });
        }
        setFilingStates(initial);
      },
      onError: (err) => {
        analytics.captureAction("auto_file_preview_failed");
        toastError({
          title: t`Error fetching preview`,
          description:
            err instanceof Error
              ? err.message
              : t`Failed to load recent attachments. Please try again.`,
        });
        setUserPhase("setup");
      },
    });

  const displayPhase = useMemo((): SetupPhase => {
    if (userPhase === "setup") return "setup";
    if (userPhase === "starting") return "starting";
    if (attachmentsLoading) return "loading-attachments";
    if (attachmentsData) return "preview";
    return "loading-attachments";
  }, [userPhase, attachmentsLoading, attachmentsData]);

  const handlePreviewClick = useCallback(() => {
    analytics.captureAction("auto_file_preview_started", {
      folder_count: foldersData?.savedFolders.length ?? 0,
      has_connection: Boolean(connection),
    });
    setUserPhase("previewing");
  }, [analytics, connection, foldersData?.savedFolders.length]);

  const handleStartFiling = useCallback(async () => {
    analytics.captureAction("auto_file_enable_started");
    setUserPhase("starting");
    try {
      const result = await updateFilingEnabledAction(emailAccountId, {
        filingEnabled: true,
      });

      if (result?.serverError) {
        analytics.captureAction("auto_file_enable_failed", {
          reason: "server_error",
        });
        toastError({
          title: t`Error starting auto-filing`,
          description: result.serverError,
        });
        setUserPhase("previewing");
        return;
      }

      analytics.captureAction("auto_file_enabled");
      toastSuccess({ description: t`Auto-filing started!` });
      await mutateEmail();
    } catch (error) {
      analytics.captureAction("auto_file_enable_failed", {
        reason: "exception",
      });
      toastError({
        title: t`Error starting auto-filing`,
        description:
          error instanceof Error
            ? error.message
            : t`An unexpected error occurred while starting auto-filing.`,
      });
      setUserPhase("previewing");
    }
  }, [analytics, emailAccountId, mutateEmail, t]);

  const driveName = providerInfo?.name || t`drive`;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center">
        <TypographyH3>
          <Trans>Let's set up auto-filing</Trans>
        </TypographyH3>
        <SectionDescription className="mx-auto mt-3 max-w-xl">
          <Trans>
            We'll file attachments from your emails into your {driveName}.
            <br />
            Just tell us where and how.
          </Trans>
        </SectionDescription>
      </div>

      <div className="mt-6 flex justify-center">
        {connection ? (
          <DriveConnectionCard connection={connection} />
        ) : (
          <TypographyP>
            <Trans>
              No drive connection found. Please connect your drive to continue
              setup.
            </Trans>
          </TypographyP>
        )}
      </div>

      <div className="mt-10 space-y-8">
        <SetupFolderSelection
          emailAccountId={emailAccountId}
          availableFolders={foldersData?.availableFolders || []}
          savedFolders={foldersData?.savedFolders || []}
          staleFolderCount={foldersData?.staleFolderDbIds.length || 0}
          connections={connections}
          mutateFolders={mutateFolders}
          isLoading={foldersLoading}
        />

        <SetupRulesForm
          emailAccountId={emailAccountId}
          initialPrompt={emailAccount?.filingPrompt || ""}
          mutateEmail={mutateEmail}
          hasFolders={foldersData ? foldersData.savedFolders.length > 0 : false}
          phase={displayPhase}
          onPreviewClick={handlePreviewClick}
        />

        {(displayPhase === "preview" || displayPhase === "starting") &&
          attachmentsData && (
            <PreviewContent
              emailAccountId={emailAccountId}
              attachments={attachmentsData.attachments}
              noAttachmentsFound={attachmentsData.noAttachmentsFound}
              savedFolders={foldersData?.savedFolders || []}
              filingStates={filingStates}
              onStartFiling={handleStartFiling}
              isStarting={displayPhase === "starting"}
            />
          )}
      </div>
    </div>
  );
}

function PreviewContent({
  emailAccountId,
  attachments,
  noAttachmentsFound,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  noAttachmentsFound: boolean;
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  if (noAttachmentsFound) {
    return (
      <NoAttachmentsMessage onSkip={onStartFiling} isStarting={isStarting} />
    );
  }

  return (
    <PreviewResults
      emailAccountId={emailAccountId}
      attachments={attachments}
      savedFolders={savedFolders}
      filingStates={filingStates}
      onStartFiling={onStartFiling}
      isStarting={isStarting}
    />
  );
}

function NoAttachmentsMessage({
  onSkip,
  isStarting,
}: {
  onSkip: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="text-center">
      <MutedText className="mb-4">
        <Trans>
          We couldn't find recent emails with attachments to preview.
        </Trans>
      </MutedText>
      <Button onClick={onSkip} loading={isStarting}>
        <Trans>Start auto-filing anyway</Trans>
      </Button>
    </div>
  );
}

function PreviewResults({
  emailAccountId,
  attachments,
  savedFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  savedFolders: SavedFolder[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const { t } = useLingui();
  const { userEmail, provider } = useAccount();

  const allComplete = attachments.every((att) => {
    const key = `${att.messageId}-${att.filename}`;
    const status = filingStates[key]?.status;
    return status === "filed" || status === "skipped" || status === "error";
  });

  const anyFiling = attachments.some((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filing" || !filingStates[key];
  });

  const filedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "filed";
  }).length;

  const skippedCount = attachments.filter((att) => {
    const key = `${att.messageId}-${att.filename}`;
    return filingStates[key]?.status === "skipped";
  }).length;

  const statusMessage = getStatusMessage();

  function getStatusMessage() {
    if (!allComplete) {
      return t`Filing your ${plural(attachments.length, {
        one: "# most recent attachment",
        other: "# most recent attachments",
      })}...`;
    }
    if (filedCount === 0) {
      return t`Skipped ${plural(skippedCount, {
        one: "# attachment",
        other: "# attachments",
      })} (didn't match your filing preferences):`;
    }
    if (skippedCount > 0) {
      return t`Filed ${plural(filedCount, {
        one: "# attachment",
        other: "# attachments",
      })}, ${plural(skippedCount, { one: "skipped #", other: "skipped #" })}:`;
    }
    return t`Filed ${plural(filedCount, {
      one: "# attachment",
      other: "# attachments",
    })}:`;
  }

  return (
    <div>
      <TypographyH4>
        <Trans>3. See it in action</Trans>
      </TypographyH4>
      <MutedText className="mt-1">{statusMessage}</MutedText>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>File</Trans>
              </TableHead>
              <TableHead>
                <Trans>Folder</Trans>
              </TableHead>
              <TableHead className="w-[100px] text-right">
                <Trans>Correct?</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attachments.map((attachment) => {
              const key = `${attachment.messageId}-${attachment.filename}`;
              return (
                <FilingRow
                  key={key}
                  emailAccountId={emailAccountId}
                  attachment={attachment}
                  filingState={filingStates[key] || { status: "filing" }}
                  savedFolders={savedFolders}
                  userEmail={userEmail}
                  provider={provider}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        <Trans>Your feedback helps us learn</Trans>
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          onClick={onStartFiling}
          loading={isStarting}
          disabled={anyFiling}
        >
          {anyFiling ? (
            <Trans>Processing...</Trans>
          ) : (
            <Trans>Looks good, start auto-filing</Trans>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          <Trans>
            You'll get an email each time we file something. Reply to correct
            us.
          </Trans>
        </p>
      </div>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  attachment,
  filingState,
  savedFolders,
  userEmail,
  provider,
}: {
  emailAccountId: string;
  attachment: AttachmentPreviewItem;
  filingState: FilingState;
  savedFolders: SavedFolder[];
  userEmail: string;
  provider: string;
}) {
  const { t } = useLingui();
  const analytics = useProductAnalytics("attachments");
  const [correctedPath, setCorrectedPath] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const voteBeforeDropdownRef = useRef<boolean | null>(null);

  const folderPath = correctedPath ?? filingState.result?.folderPath ?? null;

  const handleMoveToFolder = useCallback(
    async (folder: SavedFolder) => {
      const filingId = filingState.result?.filingId;
      if (!filingId) return;

      setIsMoving(true);

      try {
        await moveFilingAction(emailAccountId, {
          filingId,
          targetFolderId: folder.folderId,
          targetFolderPath: folder.folderPath,
        });
        analytics.captureAction("auto_file_preview_item_moved");
        setCorrectedPath(folder.folderPath);
        const folderName = folder.folderName;
        toastSuccess({ description: t`Moved to ${folderName}` });
      } catch {
        setVote(voteBeforeDropdownRef.current);
        toastError({ description: t`Failed to move file` });
      } finally {
        setIsMoving(false);
      }
    },
    [analytics, emailAccountId, filingState.result?.filingId, t],
  );

  const handleCorrectClick = useCallback(async () => {
    const filingId = filingState.result?.filingId || filingState.filingId;
    if (!filingId) return;

    setVote(true);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: true,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: t`Failed to submit feedback` });
    } else {
      analytics.captureAction("auto_file_preview_feedback_submitted", {
        feedback_positive: true,
        item_status: filingState.status,
      });
    }
  }, [
    analytics,
    emailAccountId,
    filingState.filingId,
    filingState.result?.filingId,
    filingState.status,
    t,
  ]);

  const handleWrongClick = useCallback(async () => {
    const filingId = filingState.result?.filingId;
    if (!filingId) return;

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: t`Failed to submit feedback` });
    } else {
      analytics.captureAction("auto_file_preview_feedback_submitted", {
        feedback_positive: false,
        item_status: filingState.status,
      });
    }
  }, [
    analytics,
    emailAccountId,
    filingState.result?.filingId,
    filingState.status,
    t,
  ]);

  const handleSkippedWrongClick = useCallback(async () => {
    const filingId = filingState.filingId;
    if (!filingId) return;

    setVote(false);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: false,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: t`Failed to submit feedback` });
    } else {
      analytics.captureAction("auto_file_preview_feedback_submitted", {
        feedback_positive: false,
        item_status: filingState.status,
      });
    }
  }, [analytics, emailAccountId, filingState.filingId, filingState.status, t]);

  const isFiled = filingState.status === "filed";
  const isSkipped = filingState.status === "skipped";

  const otherFolders = savedFolders.filter((f) => f.folderPath !== folderPath);

  const emailUrl = getEmailUrlForMessage(
    attachment.messageId,
    attachment.threadId,
    userEmail,
    provider,
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate max-w-[200px]">
            {attachment.filename}
          </span>
          <Link
            href={emailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
            title={t`Open email`}
          >
            <ExternalLinkIcon className="size-3.5" />
          </Link>
        </div>
      </TableCell>
      <TableCell className="break-words max-w-[200px]">
        <FilingStatusCell
          status={filingState.status}
          skipReason={filingState.skipReason}
          error={filingState.error}
          folderPath={folderPath}
        />
      </TableCell>
      <TableCell>
        {isFiled && otherFolders.length > 0 ? (
          <div className="flex items-center justify-end">
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
                    onClick={(value) => {
                      if (value) handleCorrectClick();
                    }}
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
                    disabled={isMoving}
                    onClick={() => handleMoveToFolder(folder)}
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
          </div>
        ) : isFiled ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              value={vote}
              onClick={(value) => {
                if (value) handleCorrectClick();
                else handleWrongClick();
              }}
            />
          </div>
        ) : isSkipped && filingState.filingId ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              value={vote}
              onClick={(value) => {
                if (value) {
                  handleCorrectClick();
                } else {
                  handleSkippedWrongClick();
                }
              }}
            />
          </div>
        ) : (
          <div className="h-8" />
        )}
      </TableCell>
    </TableRow>
  );
}

function SetupFolderSelection({
  emailAccountId,
  availableFolders,
  savedFolders,
  staleFolderCount,
  connections,
  mutateFolders,
  isLoading,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  staleFolderCount: number;
  connections: Array<{ id: string; provider: string }>;
  mutateFolders: () => void;
  isLoading: boolean;
}) {
  const { t } = useLingui();
  const analytics = useProductAnalytics("attachments");
  // TODO: This assumes a single drive connection; swap to a selected connection ID when multi-connection UX exists.
  const driveConnectionId = connections[0]?.id ?? null;

  const onFoldersAdded = useCallback(
    (savedFolderCount: number) => {
      analytics.captureAction("auto_file_folder_selected", {
        saved_folder_count: savedFolderCount,
      });
    },
    [analytics],
  );
  const onFoldersRemoved = useCallback(
    (savedFolderCount: number) => {
      analytics.captureAction("auto_file_folder_removed", {
        saved_folder_count: savedFolderCount,
      });
    },
    [analytics],
  );

  const {
    optimisticFolderIds,
    childrenByParentId,
    rootFolders,
    handleFolderToggle,
    handleChildrenLoaded,
  } = useFolderSelection({
    emailAccountId,
    availableFolders,
    savedFolders,
    mutateFolders,
    onFoldersAdded,
    onFoldersRemoved,
  });

  return (
    <div>
      <TypographyH4>
        <Trans>1. Pick your folders</Trans>
      </TypographyH4>
      <MutedText className="mt-1">
        <Trans>
          Which folders can we file to?{" "}
          <span className="text-muted-foreground">
            (We'll only ever put files in folders you select)
          </span>
        </Trans>
      </MutedText>
      {staleFolderCount > 0 && (
        <AlertBasic
          className="mt-4"
          variant="blue"
          title={t`Deleted folders detected`}
          description={t`Removed ${plural(staleFolderCount, {
            one: "# deleted folder",
            other: "# deleted folders",
          })} from your saved list.`}
        />
      )}

      <LoadingContent loading={isLoading} error={undefined}>
        {rootFolders.length > 0 ? (
          <>
            <div className="mt-4">
              <TreeProvider
                showLines
                showIcons
                selectable={false}
                animateExpand
                indent={16}
              >
                <TreeView className="p-0">
                  {rootFolders.map((folder, index) => (
                    <FolderNode
                      key={folder.id}
                      folder={folder}
                      isLast={index === rootFolders.length - 1}
                      selectedFolderIds={optimisticFolderIds}
                      onToggle={handleFolderToggle}
                      level={0}
                      parentPath=""
                      childrenByParentId={childrenByParentId}
                      onChildrenLoaded={handleChildrenLoaded}
                      knownChildren={childrenByParentId.get(folder.id)}
                    />
                  ))}
                </TreeView>
              </TreeProvider>
            </div>
            <div className="mt-2">
              <CreateFolderDialog
                emailAccountId={emailAccountId}
                driveConnectionId={driveConnectionId}
                onFolderCreated={mutateFolders}
                triggerLabel={t`Add folder`}
                triggerVariant="ghost"
                triggerSize="xs-2"
                triggerIcon={PlusIcon}
                triggerClassName="text-muted-foreground hover:text-foreground"
              />
            </div>
          </>
        ) : (
          <NoFoldersFound
            emailAccountId={emailAccountId}
            driveConnectionId={driveConnectionId}
            onFolderCreated={mutateFolders}
          />
        )}
      </LoadingContent>
    </div>
  );
}

function SetupRulesForm({
  emailAccountId,
  initialPrompt,
  mutateEmail,
  hasFolders,
  phase,
  onPreviewClick,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
  hasFolders: boolean;
  phase: SetupPhase;
  onPreviewClick: () => void;
}) {
  const { t } = useLingui();
  const analytics = useProductAnalytics("attachments");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const filingPrompt = watch("filingPrompt");
  const canPreview = (filingPrompt || "").trim().length > 0 && hasFolders;
  const isLoading = phase === "loading-attachments";
  const showPreviewButton =
    phase === "setup" || phase === "loading-attachments";

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      if (!canPreview) {
        toastError({
          title: t`Setup incomplete`,
          description: t`Please select at least one folder and describe how you organize files.`,
        });
        return;
      }

      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        analytics.captureAction("auto_file_prompt_save_failed", {
          reason: "server_error",
        });
        toastError({
          title: t`Error saving rules`,
          description: result.serverError,
        });
      } else {
        analytics.captureAction("auto_file_prompt_saved", {
          has_existing_prompt: Boolean(initialPrompt),
        });
        mutateEmail();
        // Trigger preview after successful save
        onPreviewClick();
      }
    },
    [
      analytics,
      canPreview,
      emailAccountId,
      initialPrompt,
      mutateEmail,
      onPreviewClick,
      t,
    ],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold">
        <Trans>2. Describe how you organize</Trans>
      </h3>
      <MutedText className="mt-1">
        <Trans>Tell us in plain English</Trans>
      </MutedText>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <Input
          type="textarea"
          name="filingPrompt"
          placeholder={t`Contracts go to Transactions by property address.
Receipts go to Receipts by month.`}
          registerProps={register("filingPrompt")}
          error={errors.filingPrompt}
          autosizeTextarea
          rows={3}
        />
        {errors.filingPrompt && (
          <p className="text-sm text-red-500">{errors.filingPrompt.message}</p>
        )}
        {showPreviewButton && (
          <div className="mt-10 text-center">
            <Button
              type="submit"
              disabled={!canPreview || isLoading}
              loading={isLoading}
            >
              {isLoading ? (
                <Trans>Finding recent attachments...</Trans>
              ) : (
                <Trans>Preview with my recent emails</Trans>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
