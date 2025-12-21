"use client";

import { useCallback, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import {
  updateFilingPreferencesAction,
  addFilingFolderAction,
  removeFilingFolderAction,
} from "@/utils/actions/drive";
import {
  updateFilingPreferencesBody,
  type UpdateFilingPreferencesBody,
} from "@/utils/actions/drive.validation";

export function FilingPreferences() {
  const { emailAccountId } = useAccount();

  const {
    data: emailAccount,
    isLoading: emailLoading,
    error: emailError,
    mutate: mutateEmail,
  } = useEmailAccountFull();

  const {
    data: foldersData,
    isLoading: foldersLoading,
    error: foldersError,
    mutate: mutateFolders,
  } = useDriveFolders();

  const isLoading = emailLoading || foldersLoading;
  const error = emailError || foldersError;

  return (
    <LoadingContent loading={isLoading} error={error}>
      {emailAccount && foldersData && (
        <FilingPreferencesForm
          emailAccountId={emailAccountId}
          initialEnabled={emailAccount.filingEnabled}
          initialPrompt={emailAccount.filingPrompt || ""}
          savedFolders={foldersData.savedFolders}
          availableFolders={foldersData.availableFolders}
          hasConnectedDrives={foldersData.hasConnectedDrives}
          mutateEmail={mutateEmail}
          mutateFolders={mutateFolders}
        />
      )}
    </LoadingContent>
  );
}

interface FolderItem {
  id: string;
  name: string;
  path: string;
  driveConnectionId: string;
  provider: string;
}

interface SavedFolder {
  id: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  driveConnectionId: string;
  provider: string;
}

function FilingPreferencesForm({
  emailAccountId,
  initialEnabled,
  initialPrompt,
  savedFolders,
  availableFolders,
  hasConnectedDrives,
  mutateEmail,
  mutateFolders,
}: {
  emailAccountId: string;
  initialEnabled: boolean;
  initialPrompt: string;
  savedFolders: SavedFolder[];
  availableFolders: FolderItem[];
  hasConnectedDrives: boolean;
  mutateEmail: () => void;
  mutateFolders: () => void;
}) {
  const [isEditingPrompt, setIsEditingPrompt] = useState(!initialPrompt);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFilingPreferencesBody>({
    resolver: zodResolver(updateFilingPreferencesBody),
    defaultValues: {
      filingEnabled: initialEnabled,
      filingPrompt: initialPrompt,
    },
  });

  const filingEnabled = watch("filingEnabled");
  const filingPrompt = watch("filingPrompt");

  const { execute: savePreferences } = useAction(
    updateFilingPreferencesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Filing preferences saved" });
        setIsEditingPrompt(false);
        mutateEmail();
      },
      onError: (error) => {
        toastError({
          title: "Error saving preferences",
          description: error.error.serverError || "Failed to save preferences",
        });
      },
    },
  );

  const { execute: addFolder, isExecuting: isAddingFolder } = useAction(
    addFilingFolderAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder added" });
        mutateFolders();
      },
      onError: (error) => {
        toastError({
          title: "Error adding folder",
          description: error.error.serverError || "Failed to add folder",
        });
      },
    },
  );

  const { execute: removeFolder, isExecuting: isRemovingFolder } = useAction(
    removeFilingFolderAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder removed" });
        mutateFolders();
      },
      onError: (error) => {
        toastError({
          title: "Error removing folder",
          description: error.error.serverError || "Failed to remove folder",
        });
      },
    },
  );

  const onSubmit: SubmitHandler<UpdateFilingPreferencesBody> = useCallback(
    async (data) => {
      savePreferences(data);
    },
    [savePreferences],
  );

  const savedFolderIds = new Set(savedFolders.map((f) => f.folderId));

  const handleFolderToggle = (folder: FolderItem, isChecked: boolean) => {
    if (isChecked) {
      addFolder({
        folderId: folder.id,
        folderName: folder.name,
        folderPath: folder.path,
        driveConnectionId: folder.driveConnectionId,
      });
    } else {
      const saved = savedFolders.find((f) => f.folderId === folder.id);
      if (saved) {
        removeFolder({ id: saved.id });
      }
    }
  };

  const hasPromptChanges = filingPrompt !== initialPrompt;
  const hasEnabledChanges = filingEnabled !== initialEnabled;

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Document Auto-Filing</h3>
            <p className="text-sm text-muted-foreground">
              Automatically organize email attachments in your connected drives
            </p>
          </div>
          <Switch
            checked={filingEnabled}
            onCheckedChange={(checked) => {
              setValue("filingEnabled", checked);
              if (checked && !filingPrompt) {
                setIsEditingPrompt(true);
              }
            }}
          />
        </div>

        {filingEnabled && (
          <>
            {!hasConnectedDrives && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                Connect a drive above to start auto-filing documents.
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="filing-prompt">
                    How should I organize your documents?
                  </Label>
                  {!isEditingPrompt && initialPrompt && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingPrompt(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {isEditingPrompt ? (
                  <Textarea
                    id="filing-prompt"
                    placeholder="Describe how you want your documents organized..."
                    className="min-h-[120px]"
                    autoFocus
                    {...register("filingPrompt")}
                  />
                ) : (
                  <div className="rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                    {filingPrompt || "No preferences set"}
                  </div>
                )}
                {errors.filingPrompt && (
                  <p className="text-sm text-red-500">
                    {errors.filingPrompt.message}
                  </p>
                )}
              </div>

              {isEditingPrompt && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium">Examples:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      Put receipts in my Receipts folder organized by month
                    </li>
                    <li>File invoices by vendor name</li>
                    <li>Contracts go to Projects folder by client name</li>
                  </ul>
                </div>
              )}
            </div>

            {hasConnectedDrives && availableFolders.length > 0 && (
              <div className="space-y-3">
                <Label>Which folders should I use for filing?</Label>
                <div className="grid gap-2">
                  {availableFolders.map((folder) => {
                    const isSelected = savedFolderIds.has(folder.id);
                    return (
                      <div
                        key={folder.id}
                        className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          handleFolderToggle(
                            folder,
                            !savedFolderIds.has(folder.id),
                          )
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleFolderToggle(
                              folder,
                              !savedFolderIds.has(folder.id),
                            );
                          }
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleFolderToggle(folder, checked === true)
                          }
                          disabled={isAddingFolder || isRemovingFolder}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{folder.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {folder.provider === "google"
                              ? "Google Drive"
                              : "OneDrive"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {(hasPromptChanges || hasEnabledChanges) && (
          <div className="flex justify-end gap-2">
            {isEditingPrompt && initialPrompt && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue("filingPrompt", initialPrompt);
                  setValue("filingEnabled", initialEnabled);
                  setIsEditingPrompt(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
