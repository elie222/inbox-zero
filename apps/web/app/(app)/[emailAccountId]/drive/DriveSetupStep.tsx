"use client";

import { useCallback, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TypographyH3, SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import Image from "next/image";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import {
  addFilingFolderAction,
  removeFilingFolderAction,
  updateFilingPromptAction,
  updateFilingEnabledAction,
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
import { getProviderInfo } from "./DriveConnectionCard";

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

  const [isStarting, setIsStarting] = useState(false);

  const handleStart = useCallback(async () => {
    if (!foldersData || !emailAccount) return;

    const hasFolders = foldersData.savedFolders.length > 0;
    const hasRules = (emailAccount.filingPrompt || "").trim().length > 0;

    if (!hasFolders || !hasRules) {
      toastError({
        title: "Setup incomplete",
        description:
          "Please select at least one folder and describe how you organize files.",
      });
      return;
    }

    setIsStarting(true);

    const result = await updateFilingEnabledAction(emailAccountId, {
      filingEnabled: true,
    });

    if (result?.serverError) {
      toastError({
        title: "Error starting auto-filing",
        description: result.serverError,
      });
    } else {
      toastSuccess({ description: "Auto-filing started!" });
      mutateEmail();
    }

    setIsStarting(false);
  }, [emailAccountId, foldersData, emailAccount, mutateEmail]);

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center">
        <TypographyH3>Let's set up auto-filing</TypographyH3>
        <SectionDescription className="mx-auto mt-3 max-w-xl">
          We'll file attachments from your emails into your{" "}
          {providerInfo?.name || "drive"}. Just tell us where and how.
        </SectionDescription>
      </div>

      {connection && providerInfo && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Image
            src={providerInfo.icon}
            alt={providerInfo.alt}
            width={16}
            height={16}
            unoptimized
          />
          <span className="font-medium text-foreground">
            Connected to {providerInfo.name}
          </span>
          <span>·</span>
          <span>{connection.email}</span>
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
      </div>

      <div className="mt-10 flex justify-center">
        <Button
          onClick={handleStart}
          loading={isStarting}
          disabled={
            !foldersData ||
            foldersData.savedFolders.length === 0 ||
            !(emailAccount?.filingPrompt || "").trim()
          }
          size="lg"
        >
          Start auto-filing
        </Button>
      </div>
    </div>
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
