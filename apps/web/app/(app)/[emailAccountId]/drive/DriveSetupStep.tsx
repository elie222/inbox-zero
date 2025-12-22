"use client";

import { useCallback, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, XIcon } from "lucide-react";
import { TypographyH3, SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
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
  submitPreviewFeedbackAction,
} from "@/utils/actions/drive";
import {
  updateFilingPromptBody,
  type UpdateFilingPromptBody,
} from "@/utils/actions/drive.validation";
import {
  FolderNode,
  type FolderItem,
  type SavedFolder,
} from "./AllowedFolders";
import { DriveConnectionCard, getProviderInfo } from "./DriveConnectionCard";
import type { FilingPreviewPrediction } from "@/app/api/user/drive/preview/route";

type SetupPhase = "setup" | "loading-preview" | "preview" | "starting";

export function DriveSetupStep() {
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
      <SetupHeader providerName={providerInfo?.name} />

      {connection && (
        <div className="mt-6 flex justify-center">
          <DriveConnectionCard connection={connection} />
        </div>
      )}

      <div className="mt-10 space-y-8">
        <SetupFolderSelection
          emailAccountId={emailAccountId}
          availableFolders={foldersData?.availableFolders || []}
          savedFolders={foldersData?.savedFolders || []}
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

function SetupHeader({ providerName }: { providerName?: string }) {
  return (
    <div className="text-center">
      <TypographyH3>Let's set up auto-filing</TypographyH3>
      <SectionDescription className="mx-auto mt-3 max-w-xl">
        We'll file attachments from your emails into your{" "}
        {providerName || "drive"}. Just tell us where and how.
      </SectionDescription>
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
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  data: { predictions: FilingPreviewPrediction[]; noAttachmentsFound: boolean };
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
      predictions={data.predictions}
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
      <p className="mb-4 text-sm text-muted-foreground">
        We couldn't find recent attachments to preview.
      </p>
      <Button onClick={onSkip} loading={isStarting}>
        Start auto-filing anyway
      </Button>
    </div>
  );
}

function PreviewResults({
  emailAccountId,
  predictions,
  onStartFiling,
  isStarting,
}: {
  emailAccountId: string;
  predictions: FilingPreviewPrediction[];
  onStartFiling: () => void;
  isStarting: boolean;
}) {
  const [feedback, setFeedback] = useState<Record<string, boolean | null>>({});

  const handleVote = useCallback(
    async (filingId: string, isPositive: boolean) => {
      setFeedback((prev) => ({ ...prev, [filingId]: isPositive }));
      await submitPreviewFeedbackAction(emailAccountId, {
        filingId,
        feedbackPositive: isPositive,
      });
    },
    [emailAccountId],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold">3. See it in action</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Here's how we'd file your recent attachments
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">File</th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Destination
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium">Vote</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {predictions.map((prediction) => (
              <PredictionRow
                key={prediction.filingId}
                prediction={prediction}
                vote={feedback[prediction.filingId]}
                onVote={handleVote}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Your feedback helps us learn
      </p>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button onClick={onStartFiling} loading={isStarting} size="lg">
          Looks good, start auto-filing
        </Button>
        <p className="text-xs text-muted-foreground">
          You'll get an email each time we file something. Reply to correct us.
        </p>
      </div>
    </div>
  );
}

function PredictionRow({
  prediction,
  vote,
  onVote,
}: {
  prediction: FilingPreviewPrediction;
  vote: boolean | null | undefined;
  onVote: (filingId: string, isPositive: boolean) => void;
}) {
  return (
    <tr className="bg-background">
      <td className="px-4 py-3">
        <div className="font-medium text-sm truncate max-w-[200px]">
          {prediction.filename}
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
          {prediction.emailSubject}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">→</span>
          <span className="truncate max-w-[180px]">
            {prediction.predictedFolder}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onVote(prediction.filingId, true)}
            className={`rounded-full p-1.5 transition-colors ${
              vote === true
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-label="Correct prediction"
          >
            <CheckIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onVote(prediction.filingId, false)}
            className={`rounded-full p-1.5 transition-colors ${
              vote === false
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-label="Wrong prediction"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SetupFolderSelection({
  emailAccountId,
  availableFolders,
  savedFolders,
  mutateFolders,
  isLoading,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
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

  if (isLoading) {
    return (
      <div>
        <h3 className="text-lg font-semibold">1. Pick your folders</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Which folders can we file to?
        </p>
        <p className="mt-4 text-sm text-muted-foreground">Loading folders...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold">1. Pick your folders</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Which folders can we file to?
      </p>
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
        <p className="mt-4 text-sm text-muted-foreground italic">
          No folders found. Create a folder in your drive.
        </p>
      )}
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
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us in plain English
      </p>
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
