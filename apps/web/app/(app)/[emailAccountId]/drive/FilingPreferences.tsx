"use client";

import { useCallback, useState, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  TreeProvider,
  TreeView,
  TreeNode,
  TreeNodeTrigger,
  TreeNodeContent,
  TreeExpander,
  TreeIcon,
  TreeLabel,
  useTree,
} from "@/components/kibo-ui/tree";
import { FolderIcon, Loader2Icon } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import type { GetSubfoldersResponse } from "@/app/api/user/drive/folders/[folderId]/route";
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
  parentId?: string;
  path?: string;
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

  const handleFolderToggle = useCallback(
    (folder: FolderItem, isChecked: boolean) => {
      // Calculate full path if not present (required for filing)
      const folderPath = folder.path || folder.name;

      if (isChecked) {
        addFolder({
          folderId: folder.id,
          folderName: folder.name,
          folderPath,
          driveConnectionId: folder.driveConnectionId,
        });
      } else {
        const saved = savedFolders.find((f) => f.folderId === folder.id);
        if (saved) {
          removeFolder({ id: saved.id });
        }
      }
    },
    [addFolder, removeFolder, savedFolders],
  );

  const onSubmit: SubmitHandler<UpdateFilingPreferencesBody> = useCallback(
    async (data) => {
      savePreferences(data);
    },
    [savePreferences],
  );

  // Build the tree structure from flat list of folders
  // Some folders might have parentId set if the provider returned multiple levels
  const rootFolders = useMemo(() => {
    const folderMap = new Map<string, FolderItem>();
    const roots: FolderItem[] = [];

    // First map everything
    for (const folder of availableFolders) {
      folderMap.set(folder.id, folder);
    }

    // Then find roots (those whose parent is not in our list)
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-3">
          <CardTitle>Allowed folders</CardTitle>
          <CardDescription>
            Select which folders the AI can file to
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rootFolders.length > 0 ? (
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
                    savedFolderIds={savedFolderIds}
                    onToggle={handleFolderToggle}
                    isDisabled={isAddingFolder || isRemovingFolder}
                    level={0}
                    parentPath=""
                    knownChildren={folderChildrenMap.get(folder.id)}
                  />
                ))}
              </TreeView>
            </TreeProvider>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderIcon />
                </EmptyMedia>
                <EmptyTitle>No folders found</EmptyTitle>
                <EmptyDescription>
                  Create a folder in your drive to get started.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
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
  );
}

function FolderNode({
  folder,
  isLast,
  savedFolderIds,
  onToggle,
  isDisabled,
  level,
  parentPath,
  knownChildren,
}: {
  folder: FolderItem;
  isLast: boolean;
  savedFolderIds: Set<string>;
  onToggle: (folder: FolderItem, isChecked: boolean) => void;
  isDisabled: boolean;
  level: number;
  parentPath: string;
  knownChildren?: FolderItem[];
}) {
  const { expandedIds } = useTree();
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = savedFolderIds.has(folder.id);
  const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

  // Only fetch subfolders when expanded AND we don't have known children already
  const { data: subfoldersData, isLoading: isLoadingSubfolders } =
    useSWR<GetSubfoldersResponse>(
      isExpanded && !knownChildren
        ? `/api/user/drive/folders/${folder.id}?driveConnectionId=${folder.driveConnectionId}`
        : null,
    );

  const subfolders = subfoldersData?.folders ?? knownChildren ?? [];
  const hasLoadedChildren = subfolders.length > 0;

  // If it's expanded but we haven't loaded yet AND no known children, it "has children" (to show content/loader)
  const showContent = isExpanded && (hasLoadedChildren || isLoadingSubfolders);

  return (
    <TreeNode nodeId={folder.id} level={level} isLast={isLast}>
      <TreeNodeTrigger className="py-1">
        {isLoadingSubfolders ? (
          <div className="mr-1 flex h-4 w-4 items-center justify-center">
            <Loader2Icon className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TreeExpander hasChildren={true} />
        )}
        <TreeIcon hasChildren />
        <div className="flex flex-1 items-center gap-2">
          <Checkbox
            id={`folder-${folder.id}`}
            checked={isSelected}
            onCheckedChange={(checked) =>
              onToggle({ ...folder, path: currentPath }, checked === true)
            }
            disabled={isDisabled}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
          />
          <TreeLabel>{folder.name}</TreeLabel>
        </div>
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren={showContent}>
        {hasLoadedChildren ? (
          subfolders.map((subfolder, index) => (
            <FolderNode
              key={subfolder.id}
              folder={{
                ...subfolder,
                path: `${currentPath}/${subfolder.name}`,
              }}
              isLast={index === subfolders.length - 1}
              savedFolderIds={savedFolderIds}
              onToggle={onToggle}
              isDisabled={isDisabled}
              level={level + 1}
              parentPath={currentPath}
            />
          ))
        ) : isExpanded && !isLoadingSubfolders ? (
          <div
            className="py-1 text-xs text-muted-foreground italic"
            style={{ paddingLeft: (level + 1) * 16 + 28 }}
          >
            No subfolders
          </div>
        ) : null}
      </TreeNodeContent>
    </TreeNode>
  );
}
