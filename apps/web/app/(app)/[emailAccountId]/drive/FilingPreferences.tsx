"use client";

import { useCallback, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
          initialPrompt={emailAccount.filingPrompt || ""}
          availableFolders={foldersData.availableFolders}
          savedFolders={foldersData.savedFolders}
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
  initialPrompt,
  availableFolders,
  savedFolders,
  mutateEmail,
  mutateFolders,
}: {
  emailAccountId: string;
  initialPrompt: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
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
      filingPrompt: initialPrompt,
    },
  });

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

  const onSubmit: SubmitHandler<UpdateFilingPreferencesBody> = useCallback(
    async (data) => {
      savePreferences(data);
    },
    [savePreferences],
  );

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {availableFolders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Allowed folders</CardTitle>
              <CardDescription>
                Select which folders the AI can file to
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {availableFolders.map((folder) => {
                  const isSelected = savedFolderIds.has(folder.id);
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center space-x-2 py-1"
                    >
                      <Checkbox
                        id={folder.id}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleFolderToggle(folder, checked === true)
                        }
                        disabled={isAddingFolder || isRemovingFolder}
                      />
                      <label
                        htmlFor={folder.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {folder.name}/
                      </label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Filing rules</CardTitle>
            <CardDescription>
              How should we organize your attachments?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditingPrompt ? (
              <>
                <Textarea
                  id="filing-prompt"
                  placeholder="Receipts go to Expenses by month. Contracts go to Legal."
                  className="min-h-[60px]"
                  rows={2}
                  autoFocus
                  {...register("filingPrompt")}
                />
                {errors.filingPrompt && (
                  <p className="text-sm text-red-500">
                    {errors.filingPrompt.message}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  {initialPrompt && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setValue("filingPrompt", initialPrompt);
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
              </>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {filingPrompt || "No preferences set"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingPrompt(true)}
                >
                  {filingPrompt ? "Edit" : "Add rules"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
