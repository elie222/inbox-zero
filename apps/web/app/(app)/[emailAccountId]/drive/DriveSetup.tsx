"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
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
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { FilingStatusCell } from "@/components/drive/FilingStatusCell";
import { YesNoIndicator } from "@/components/drive/YesNoIndicator";
import {
  TreeProvider,
  TreeView,
  TreeNode,
  TreeNodeTrigger,
  TreeNodeContent,
  TreeExpander,
  TreeIcon,
} from "@/components/kibo-ui/tree";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useFilingPreviewAttachments } from "@/hooks/useFilingPreviewAttachments";
import {
  addFilingFolderAction,
  removeFilingFolderAction,
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
import { FolderNode, NoFoldersFound } from "./AllowedFolders";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { DriveConnectionCard, getProviderInfo } from "./DriveConnectionCard";
import type { AttachmentPreviewItem } from "@/app/api/user/drive/preview/attachments/route";
import { LoadingContent } from "@/components/LoadingContent";
import { getEmailUrlForMessage } from "@/utils/url";

type SetupPhase = "setup" | "loading-attachments" | "preview" | "starting";

type FilingState = {
  status: "pending" | "filing" | "filed" | "skipped" | "error";
  result?: FileAttachmentFiled;
  error?: string;
  skipReason?: string;
};

export function DriveSetup() {
  const { emailAccountId } = useAccount();
  const { data: connectionsData } = useDriveConnections();
  const {
    data: foldersData,
    isLoading: foldersLoading,
    mutate: mutateFolders,
  } = useDriveFolders();
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
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: result.serverError },
                }));
              } else if (resultData?.skipped) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: {
                    status: "skipped",
                    skipReason: resultData.skipReason,
                  },
                }));
              } else if (resultData) {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "filed", result: resultData },
                }));
              } else {
                setFilingStates((prev) => ({
                  ...prev,
                  [key]: { status: "error", error: "Unknown error" },
                }));
              }
            })
            .catch((err) => {
              setFilingStates((prev) => ({
                ...prev,
                [key]: {
                  status: "error",
                  error: err instanceof Error ? err.message : "Filing failed",
                },
              }));
            });
        }
        setFilingStates(initial);
      },
      onError: (err) => {
        toastError({
          title: "Error fetching preview",
          description:
            err instanceof Error
              ? err.message
              : "Failed to load recent attachments. Please try again.",
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
    setUserPhase("previewing");
  }, []);

  const handleStartFiling = useCallback(async () => {
    setUserPhase("starting");

    const result = await updateFilingEnabledAction(emailAccountId, {
      filingEnabled: true,
    });

    if (result?.serverError) {
      toastError({
        title: "Error starting auto-filing",
        description: result.serverError,
      });
      setUserPhase("previewing");
    } else {
      toastSuccess({ description: "Auto-filing started!" });
      mutateEmail();
    }
  }, [emailAccountId, mutateEmail]);

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center">
        <TypographyH3>Let's set up auto-filing</TypographyH3>
        <SectionDescription className="mx-auto mt-3 max-w-xl">
          We'll file attachments from your emails into your{" "}
          {providerInfo?.name || "drive"}.<br />
          Just tell us where and how.
        </SectionDescription>
      </div>

      <div className="mt-6 flex justify-center">
        {connection ? (
          <DriveConnectionCard connection={connection} />
        ) : (
          <TypographyP>
            No drive connection found. Please connect your drive to continue
            setup.
          </TypographyP>
        )}
      </div>

      <div className="mt-10 space-y-8">
        <SetupFolderSelection
          emailAccountId={emailAccountId}
          availableFolders={foldersData?.availableFolders || []}
          savedFolders={foldersData?.savedFolders || []}
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
              availableFolders={foldersData?.availableFolders || []}
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
  availableFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  noAttachmentsFound: boolean;
  availableFolders: FolderItem[];
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
      availableFolders={availableFolders}
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
        We couldn't find recent emails with attachments to preview.
      </MutedText>
      <Button onClick={onSkip} loading={isStarting}>
        Start auto-filing anyway
      </Button>
    </div>
  );
}

function PreviewResults({
  emailAccountId,
  attachments,
  availableFolders,
  filingStates,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  attachments: AttachmentPreviewItem[];
  availableFolders: FolderItem[];
  filingStates: Record<string, FilingState>;
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const { userEmail, provider } = useAccount();
  const [correctingId, setCorrectingId] = useState<string | null>(null);

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

  const statusMessage = allComplete
    ? filedCount > 0
      ? `Filed ${filedCount} attachment${filedCount !== 1 ? "s" : ""}${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}:`
      : `Skipped ${skippedCount} attachment${skippedCount !== 1 ? "s" : ""} (didn't match your filing preferences):`
    : `Filing your ${attachments.length} most recent attachments...`;

  return (
    <div>
      <TypographyH4>3. See it in action</TypographyH4>
      <MutedText className="mt-1">{statusMessage}</MutedText>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Folder</TableHead>
              <TableHead className="w-[100px] text-right">Correct?</TableHead>
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
                  availableFolders={availableFolders}
                  isCorrectingThis={correctingId === key}
                  onCorrectClick={() => setCorrectingId(key)}
                  onCancelCorrect={() => setCorrectingId(null)}
                  userEmail={userEmail}
                  provider={provider}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Your feedback helps us learn
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          onClick={onStartFiling}
          loading={isStarting}
          disabled={anyFiling || filedCount === 0}
        >
          {anyFiling
            ? "Processing..."
            : filedCount === 0
              ? "No attachments to file"
              : "Looks good, start auto-filing"}
        </Button>
        <p className="text-xs text-muted-foreground">
          You'll get an email each time we file something. Reply to correct us.
        </p>
      </div>
    </div>
  );
}

function FilingRow({
  emailAccountId,
  attachment,
  filingState,
  availableFolders,
  isCorrectingThis,
  onCorrectClick,
  onCancelCorrect,
  userEmail,
  provider,
}: {
  emailAccountId: string;
  attachment: AttachmentPreviewItem;
  filingState: FilingState;
  availableFolders: FolderItem[];
  isCorrectingThis: boolean;
  onCorrectClick: () => void;
  onCancelCorrect: () => void;
  userEmail: string;
  provider: string;
}) {
  const [correctedPath, setCorrectedPath] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);

  const folderPath = correctedPath ?? filingState.result?.folderPath ?? null;

  const handleMoveToFolder = useCallback(
    async (folder: FolderItem) => {
      const filingId = filingState.result?.filingId;
      if (!filingId) return;

      const newPath = folder.path || folder.name;
      setIsMoving(true);

      try {
        await moveFilingAction(emailAccountId, {
          filingId,
          targetFolderId: folder.id,
          targetFolderPath: newPath,
        });
        setCorrectedPath(newPath);
        setVote(true);
        toastSuccess({ description: `Moved to ${folder.name}` });
      } catch {
        toastError({ description: "Failed to move file" });
      } finally {
        setIsMoving(false);
        onCancelCorrect();
      }
    },
    [emailAccountId, filingState.result?.filingId, onCancelCorrect],
  );

  const handleCorrectClick = useCallback(async () => {
    const filingId = filingState.result?.filingId;
    if (!filingId) return;

    setVote(true);
    const result = await submitPreviewFeedbackAction(emailAccountId, {
      filingId,
      feedbackPositive: true,
    });

    if (result?.serverError) {
      setVote(null);
      toastError({ description: "Failed to submit feedback" });
    }
  }, [emailAccountId, filingState.result?.filingId]);

  const handleWrongClick = useCallback(() => {
    setVote(false);
    onCorrectClick();
  }, [onCorrectClick]);

  const isFiled = filingState.status === "filed";
  const isSkipped = filingState.status === "skipped";

  if (isCorrectingThis && isFiled) {
    return (
      <TableRow>
        <TableCell colSpan={3}>
          <div className="space-y-3">
            <p className="text-sm font-medium">{attachment.filename}</p>
            <MutedText>Select the correct folder:</MutedText>
            <SelectableFolderTree
              folders={availableFolders}
              selectedPath={folderPath}
              onSelect={handleMoveToFolder}
              disabled={isMoving}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelCorrect}
              disabled={isMoving}
            >
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

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
            title="Open email"
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
        {isFiled ? (
          <div className="flex items-center justify-end">
            <YesNoIndicator
              value={vote}
              onClick={(value) => {
                if (value) {
                  handleCorrectClick();
                } else {
                  handleWrongClick();
                }
              }}
            />
          </div>
        ) : isSkipped ? (
          <span className="text-xs text-muted-foreground">—</span>
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
  connections,
  mutateFolders,
  isLoading,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  connections: Array<{ id: string; provider: string }>;
  mutateFolders: () => void;
  isLoading: boolean;
}) {
  // Optimistic state for folder selection
  const [optimisticFolderIds, setOptimisticFolderIds] = useState<Set<string>>(
    () => new Set(savedFolders.map((f) => f.folderId)),
  );

  // Sync optimistic state when server data changes
  const serverFolderIds = savedFolders.map((f) => f.folderId).join(",");
  const prevServerFolderIds = useRef(serverFolderIds);
  if (serverFolderIds !== prevServerFolderIds.current) {
    prevServerFolderIds.current = serverFolderIds;
    setOptimisticFolderIds(new Set(savedFolders.map((f) => f.folderId)));
  }

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const folderPath = folder.path || folder.name;

      // Optimistic update
      setOptimisticFolderIds((prev) => {
        const next = new Set(prev);
        if (isChecked) {
          next.add(folder.id);
        } else {
          next.delete(folder.id);
        }
        return next;
      });

      if (isChecked) {
        const result = await addFilingFolderAction(emailAccountId, {
          folderId: folder.id,
          folderName: folder.name,
          folderPath,
          driveConnectionId: folder.driveConnectionId,
        });

        if (result?.serverError) {
          // Revert on error
          setOptimisticFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(folder.id);
            return next;
          });
          toastError({
            title: "Error adding folder",
            description: result.serverError,
          });
        } else {
          mutateFolders();
        }
      } else {
        const result = await removeFilingFolderAction(emailAccountId, {
          folderId: folder.id,
        });

        if (result?.serverError) {
          // Revert on error
          setOptimisticFolderIds((prev) => {
            const next = new Set(prev);
            next.add(folder.id);
            return next;
          });
          toastError({
            title: "Error removing folder",
            description: result.serverError,
          });
        } else {
          mutateFolders();
        }
      }
    },
    [emailAccountId, mutateFolders],
  );

  const rootFolders = useMemo(() => {
    const folderMap = new Map<string, FolderItem>();
    const roots: FolderItem[] = [];

    for (const folder of availableFolders) {
      folderMap.set(folder.id, folder);
    }

    for (const folder of availableFolders) {
      if (!folder.parentId || !folderMap.has(folder.parentId)) {
        roots.push(folder);
      }
    }

    return roots;
  }, [availableFolders]);

  const folderChildrenMap = useMemo(() => {
    const map = new Map<string, FolderItem[]>();
    for (const folder of availableFolders) {
      if (folder.parentId) {
        if (!map.has(folder.parentId)) map.set(folder.parentId, []);
        map.get(folder.parentId)!.push(folder);
      }
    }
    return map;
  }, [availableFolders]);

  return (
    <div>
      <TypographyH4>1. Pick your folders</TypographyH4>
      <MutedText className="mt-1">Which folders can we file to?</MutedText>

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
                      isDisabled={false}
                      level={0}
                      parentPath=""
                      knownChildren={folderChildrenMap.get(folder.id)}
                    />
                  ))}
                </TreeView>
              </TreeProvider>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              We'll only ever put files in folders you select
            </p>
          </>
        ) : (
          <NoFoldersFound
            emailAccountId={emailAccountId}
            driveConnectionId={connections[0]?.id}
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
          title: "Setup incomplete",
          description:
            "Please select at least one folder and describe how you organize files.",
        });
        return;
      }

      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        mutateEmail();
        // Trigger preview after successful save
        onPreviewClick();
      }
    },
    [canPreview, emailAccountId, mutateEmail, onPreviewClick],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold">2. Describe how you organize</h3>
      <MutedText className="mt-1">Tell us in plain English</MutedText>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <Input
          type="textarea"
          name="filingPrompt"
          placeholder={`Contracts go to Transactions by property address.
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
              {isLoading
                ? "Finding recent attachments..."
                : "Preview with my recent emails"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function SelectableFolderTree({
  folders,
  selectedPath,
  onSelect,
  disabled,
}: {
  folders: FolderItem[];
  selectedPath: string | null;
  onSelect: (folder: FolderItem) => void;
  disabled: boolean;
}) {
  const { rootFolders, folderChildrenMap } = useMemo(() => {
    const folderMap = new Map<string, FolderItem>();
    const roots: FolderItem[] = [];
    const childrenMap = new Map<string, FolderItem[]>();

    for (const folder of folders) {
      folderMap.set(folder.id, folder);
    }

    for (const folder of folders) {
      if (!folder.parentId || !folderMap.has(folder.parentId)) {
        roots.push(folder);
      } else {
        if (!childrenMap.has(folder.parentId)) {
          childrenMap.set(folder.parentId, []);
        }
        childrenMap.get(folder.parentId)!.push(folder);
      }
    }

    return { rootFolders: roots, folderChildrenMap: childrenMap };
  }, [folders]);

  return (
    <TreeProvider
      showLines
      showIcons
      selectable={false}
      animateExpand
      indent={16}
    >
      <TreeView className="max-h-48 overflow-y-auto p-0">
        {rootFolders.map((folder, index) => (
          <SelectableFolderNode
            key={folder.id}
            folder={folder}
            isLast={index === rootFolders.length - 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            disabled={disabled}
            level={0}
            parentPath=""
            childrenMap={folderChildrenMap}
          />
        ))}
      </TreeView>
    </TreeProvider>
  );
}

function SelectableFolderNode({
  folder,
  isLast,
  selectedPath,
  onSelect,
  disabled,
  level,
  parentPath,
  childrenMap,
}: {
  folder: FolderItem;
  isLast: boolean;
  selectedPath: string | null;
  onSelect: (folder: FolderItem) => void;
  disabled: boolean;
  level: number;
  parentPath: string;
  childrenMap: Map<string, FolderItem[]>;
}) {
  const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
  const isSelected =
    selectedPath === currentPath || selectedPath === folder.path;
  const children = childrenMap.get(folder.id) || [];
  const hasChildren = children.length > 0;

  return (
    <TreeNode nodeId={folder.id} level={level} isLast={isLast}>
      <TreeNodeTrigger className="py-1">
        <TreeExpander hasChildren={hasChildren} />
        <TreeIcon hasChildren={hasChildren} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ ...folder, path: currentPath });
          }}
          disabled={disabled}
          className={`flex-1 text-left rounded px-1 py-0.5 text-sm transition-colors ${
            isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {folder.name}
        </button>
      </TreeNodeTrigger>
      {hasChildren && (
        <TreeNodeContent hasChildren>
          {children.map((child, index) => (
            <SelectableFolderNode
              key={child.id}
              folder={child}
              isLast={index === children.length - 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              disabled={disabled}
              level={level + 1}
              parentPath={currentPath}
              childrenMap={childrenMap}
            />
          ))}
        </TreeNodeContent>
      )}
    </TreeNode>
  );
}
