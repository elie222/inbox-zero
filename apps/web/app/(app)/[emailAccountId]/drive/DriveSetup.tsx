"use client";

import { useCallback, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, XIcon } from "lucide-react";
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
import { TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { useFilingPreview } from "@/hooks/useFilingPreview";
import {
  addFilingFolderAction,
  removeFilingFolderAction,
  updateFilingPromptAction,
  updateFilingEnabledAction,
  moveFilingAction,
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
import type { FilingPreviewResult } from "@/app/api/user/drive/preview/route";
import { LoadingContent } from "@/components/LoadingContent";

type SetupPhase = "setup" | "loading-preview" | "preview" | "starting";

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

  const shouldFetchPreview =
    userPhase === "previewing" || userPhase === "starting";
  const {
    data: previewData,
    error: previewError,
    isLoading: previewLoading,
  } = useFilingPreview(shouldFetchPreview);

  const displayPhase = useMemo((): SetupPhase => {
    if (userPhase === "setup") return "setup";
    if (userPhase === "starting") return "starting";
    if (previewLoading) return "loading-preview";
    if (previewError) return "setup";
    if (previewData) return "preview";
    return "loading-preview";
  }, [userPhase, previewLoading, previewError, previewData]);

  const canPreview =
    foldersData &&
    foldersData.savedFolders.length > 0 &&
    (emailAccount?.filingPrompt || "").trim().length > 0;

  const handlePreviewClick = useCallback(() => {
    if (!canPreview) {
      toastError({
        title: "Setup incomplete",
        description:
          "Please select at least one folder and describe how you organize files.",
      });
      return;
    }
    setUserPhase("previewing");
  }, [canPreview]);

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
        />

        {(displayPhase === "preview" || displayPhase === "starting") &&
          previewData && (
            <PreviewContent
              emailAccountId={emailAccountId}
              data={previewData}
              availableFolders={foldersData?.availableFolders || []}
              onStartFiling={handleStartFiling}
              isStarting={displayPhase === "starting"}
            />
          )}
      </div>

      <SetupActions
        phase={displayPhase}
        canPreview={!!canPreview}
        onPreviewClick={handlePreviewClick}
      />
    </div>
  );
}

function SetupActions({
  phase,
  canPreview,
  onPreviewClick,
}: {
  phase: SetupPhase;
  canPreview: boolean;
  onPreviewClick: () => void;
}) {
  if (phase !== "setup" && phase !== "loading-preview") return null;

  const isLoading = phase === "loading-preview";

  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <Button
        onClick={onPreviewClick}
        disabled={!canPreview || isLoading}
        loading={isLoading}
      >
        {isLoading
          ? "Finding recent attachments..."
          : "Preview with my recent emails"}
      </Button>
    </div>
  );
}

function PreviewContent({
  emailAccountId,
  data,
  availableFolders,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  data: { filings: FilingPreviewResult[]; noAttachmentsFound: boolean };
  availableFolders: FolderItem[];
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  if (data.noAttachmentsFound) {
    return (
      <NoAttachmentsMessage onSkip={onStartFiling} isStarting={isStarting} />
    );
  }

  return (
    <PreviewResults
      emailAccountId={emailAccountId}
      filings={data.filings}
      availableFolders={availableFolders}
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
  filings,
  availableFolders,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  filings: FilingPreviewResult[];
  availableFolders: FolderItem[];
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  return (
    <div>
      <TypographyH4>3. See it in action</TypographyH4>
      <MutedText className="mt-1">
        We filed your {filings.length} most recent attachments:
      </MutedText>

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
            {filings.map((filing) => (
              <FilingRow
                key={filing.filingId}
                emailAccountId={emailAccountId}
                filing={filing}
                availableFolders={availableFolders}
                isCorrectingThis={correctingId === filing.filingId}
                onCorrectClick={() => setCorrectingId(filing.filingId)}
                onCancelCorrect={() => setCorrectingId(null)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Your feedback helps us learn
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button onClick={onStartFiling} loading={isStarting}>
          Looks good, start auto-filing
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
  filing,
  availableFolders,
  isCorrectingThis,
  onCorrectClick,
  onCancelCorrect,
}: {
  emailAccountId: string;
  filing: FilingPreviewResult;
  availableFolders: FolderItem[];
  isCorrectingThis: boolean;
  onCorrectClick: () => void;
  onCancelCorrect: () => void;
}) {
  const [folderPath, setFolderPath] = useState(filing.folderPath);
  const [isMoving, setIsMoving] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);

  const handleMoveToFolder = useCallback(
    async (folder: FolderItem) => {
      const newPath = folder.path || folder.name;
      setIsMoving(true);

      try {
        await moveFilingAction(emailAccountId, {
          filingId: filing.filingId,
          targetFolderId: folder.id,
          targetFolderPath: newPath,
        });
        setFolderPath(newPath);
        setVote(true);
        toastSuccess({ description: `Moved to ${folder.name}` });
      } catch {
        toastError({ description: "Failed to move file" });
      } finally {
        setIsMoving(false);
        onCancelCorrect();
      }
    },
    [emailAccountId, filing.filingId, onCancelCorrect],
  );

  const handleCorrectClick = useCallback(() => {
    setVote(true);
  }, []);

  const handleWrongClick = useCallback(() => {
    setVote(false);
    onCorrectClick();
  }, [onCorrectClick]);

  if (isCorrectingThis) {
    return (
      <TableRow>
        <TableCell colSpan={3}>
          <div className="space-y-3">
            <p className="text-sm font-medium">{filing.filename}</p>
            <MutedText>Select the correct folder:</MutedText>
            <div className="flex flex-wrap gap-2">
              {availableFolders.slice(0, 10).map((folder) => (
                <Button
                  key={folder.id}
                  variant={folder.path === folderPath ? "default" : "outline"}
                  size="sm"
                  disabled={isMoving}
                  onClick={() => handleMoveToFolder(folder)}
                >
                  {folder.name}
                </Button>
              ))}
            </div>
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

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium truncate max-w-[200px] block">
          {filing.filename}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground truncate max-w-[200px] block">
          {folderPath}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleCorrectClick}
            className={`rounded-full p-1.5 transition-colors ${
              vote === true
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-label="Correct"
          >
            <CheckIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleWrongClick}
            className={`rounded-full p-1.5 transition-colors ${
              vote === false
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-label="Wrong"
          >
            <XIcon className="size-4" />
          </button>
        </div>
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
  const [isFolderBusy, setIsFolderBusy] = useState(false);

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const folderPath = folder.path || folder.name;
      setIsFolderBusy(true);

      try {
        if (isChecked) {
          const result = await addFilingFolderAction(emailAccountId, {
            folderId: folder.id,
            folderName: folder.name,
            folderPath,
            driveConnectionId: folder.driveConnectionId,
          });

          if (result?.serverError) {
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
            toastError({
              title: "Error removing folder",
              description: result.serverError,
            });
          } else {
            mutateFolders();
          }
        }
      } finally {
        setIsFolderBusy(false);
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

  const savedFolderIds = new Set(savedFolders.map((f) => f.folderId));

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
                      selectedFolderIds={savedFolderIds}
                      onToggle={handleFolderToggle}
                      isDisabled={isFolderBusy}
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
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
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

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        mutateEmail();
      }
    },
    [emailAccountId, mutateEmail],
  );

  const handleBlur = useCallback(() => {
    if (filingPrompt !== initialPrompt) {
      handleSubmit(onSubmit)();
    }
  }, [filingPrompt, initialPrompt, handleSubmit, onSubmit]);

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
          registerProps={{
            ...register("filingPrompt"),
            onBlur: handleBlur,
          }}
          error={errors.filingPrompt}
          autosizeTextarea
          rows={3}
        />
        {errors.filingPrompt && (
          <p className="text-sm text-red-500">{errors.filingPrompt.message}</p>
        )}
      </form>
    </div>
  );
}
