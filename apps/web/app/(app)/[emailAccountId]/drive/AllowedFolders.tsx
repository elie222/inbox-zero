"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderIcon, Loader2Icon, PlusIcon } from "lucide-react";
import {
  Card,
  CardBasic,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toastError, toastSuccess } from "@/components/Toast";
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
import {
  addFilingFolderAction,
  removeFilingFolderAction,
  createDriveFolderAction,
} from "@/utils/actions/drive";
import {
  createDriveFolderBody,
  type CreateDriveFolderBody,
} from "@/utils/actions/drive.validation";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { LoadingContent } from "@/components/LoadingContent";
import { useDriveSubfolders } from "@/hooks/useDriveSubfolders";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import { AlertBasic } from "@/components/Alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { useDialogState } from "@/hooks/useDialogState";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import {
  applyFolderSelection,
  buildFolderChildrenMap,
  getFolderSelectionState,
  getRootFolders,
  mergeFolderChildren,
  type FolderChildrenMap,
} from "./allowed-folder-selection";

export function AllowedFolders({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, error, mutate } = useDriveFolders(emailAccountId);
  const { data: connectionsData } = useDriveConnections();
  const driveConnectionId = connectionsData?.connections[0]?.id;

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <AllowedFoldersContent
          emailAccountId={emailAccountId}
          availableFolders={data.availableFolders}
          savedFolders={data.savedFolders}
          staleFolderCount={data.staleFolderDbIds.length}
          mutateFolders={mutate}
          driveConnectionId={driveConnectionId ?? null}
        />
      )}
    </LoadingContent>
  );
}

function AllowedFoldersContent({
  emailAccountId,
  driveConnectionId,
  availableFolders,
  savedFolders,
  staleFolderCount,
  mutateFolders,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  staleFolderCount: number;
  mutateFolders: () => void;
}) {
  const [optimisticFolderIds, setOptimisticFolderIds] = useState<Set<string>>(
    () => new Set(savedFolders.map((f) => f.folderId)),
  );

  const serverFolderIds = useMemo(
    () => savedFolders.map((f) => f.folderId).join(","),
    [savedFolders],
  );
  const prevServerFolderIds = useRef(serverFolderIds);
  const [childrenByParentId, setChildrenByParentId] =
    useState<FolderChildrenMap>(() => buildFolderChildrenMap(availableFolders));

  useEffect(() => {
    if (serverFolderIds === prevServerFolderIds.current) return;
    prevServerFolderIds.current = serverFolderIds;
    setOptimisticFolderIds(new Set(savedFolders.map((f) => f.folderId)));
  }, [savedFolders, serverFolderIds]);

  useEffect(() => {
    setChildrenByParentId(buildFolderChildrenMap(availableFolders));
  }, [availableFolders]);

  const handleChildrenLoaded = useCallback(
    (parentId: string, children: FolderItem[]) => {
      setChildrenByParentId((prev) =>
        mergeFolderChildren({ childrenByParentId: prev, parentId, children }),
      );
    },
    [],
  );

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const previousFolderIds = optimisticFolderIds;
      const { nextFolderIds, changedFolders } = applyFolderSelection({
        folder,
        isChecked,
        selectedFolderIds: previousFolderIds,
        childrenByParentId,
      });

      setOptimisticFolderIds(nextFolderIds);

      try {
        if (isChecked) {
          const results = await Promise.all(
            changedFolders.map((changedFolder) =>
              addFilingFolderAction(emailAccountId, {
                folderId: changedFolder.id,
                folderName: changedFolder.name,
                folderPath: changedFolder.path || changedFolder.name,
                driveConnectionId: changedFolder.driveConnectionId,
              }),
            ),
          );
          const serverError = results.find(
            (result) => result?.serverError,
          )?.serverError;

          if (serverError) {
            setOptimisticFolderIds(previousFolderIds);
            toastError({
              title: "Error adding folder",
              description: serverError,
            });
          } else {
            mutateFolders();
          }
        } else {
          const results = await Promise.all(
            changedFolders.map((changedFolder) =>
              removeFilingFolderAction(emailAccountId, {
                folderId: changedFolder.id,
              }),
            ),
          );
          const serverError = results.find(
            (result) => result?.serverError,
          )?.serverError;

          if (serverError) {
            setOptimisticFolderIds(previousFolderIds);
            toastError({
              title: "Error removing folder",
              description: serverError,
            });
          } else {
            mutateFolders();
          }
        }
      } catch {
        setOptimisticFolderIds(previousFolderIds);
        toastError({
          title: isChecked ? "Error adding folder" : "Error removing folder",
          description: "Please try again.",
        });
      }
    },
    [childrenByParentId, emailAccountId, mutateFolders, optimisticFolderIds],
  );

  const rootFolders = useMemo(
    () => getRootFolders(availableFolders),
    [availableFolders],
  );

  const savedFolderIds = optimisticFolderIds;
  const hasFolders = rootFolders.length > 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Allowed folders</CardTitle>
        <CardDescription>AI can only file to these folders</CardDescription>
      </CardHeader>
      <CardContent>
        {staleFolderCount > 0 && (
          <AlertBasic
            className="mb-4"
            variant="blue"
            title="Deleted folders detected"
            description={`Removed ${staleFolderCount} deleted folder${staleFolderCount === 1 ? "" : "s"} from your saved list.`}
          />
        )}
        {hasFolders ? (
          <>
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
                    level={0}
                    parentPath=""
                    childrenByParentId={childrenByParentId}
                    onChildrenLoaded={handleChildrenLoaded}
                    knownChildren={childrenByParentId.get(folder.id)}
                  />
                ))}
              </TreeView>
            </TreeProvider>
            <div className="mt-2">
              <CreateFolderDialog
                emailAccountId={emailAccountId}
                driveConnectionId={driveConnectionId}
                onFolderCreated={mutateFolders}
                triggerLabel="Add folder"
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
      </CardContent>
    </Card>
  );
}

export function FolderNode({
  folder,
  isLast,
  selectedFolderIds,
  onToggle,
  onChildrenLoaded,
  level,
  parentPath,
  childrenByParentId,
  knownChildren,
}: {
  folder: FolderItem;
  isLast: boolean;
  selectedFolderIds: Set<string>;
  onToggle: (folder: FolderItem, isChecked: boolean) => void;
  onChildrenLoaded: (parentId: string, children: FolderItem[]) => void;
  level: number;
  parentPath: string;
  childrenByParentId: FolderChildrenMap;
  knownChildren?: FolderItem[];
}) {
  const { expandedIds } = useTree();
  const isExpanded = expandedIds.has(folder.id);
  const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

  const { data: subfoldersData, isLoading: isLoadingSubfolders } =
    useDriveSubfolders(
      isExpanded && !knownChildren
        ? {
            folderId: folder.id,
            driveConnectionId: folder.driveConnectionId,
          }
        : null,
    );

  const rawSubfolders = knownChildren ?? subfoldersData?.folders ?? [];
  const subfolders = useMemo(
    () =>
      rawSubfolders.map((subfolder) => ({
        ...subfolder,
        parentId: folder.id,
        path: `${currentPath}/${subfolder.name}`,
      })),
    [currentPath, folder.id, rawSubfolders],
  );
  const checkboxState = getFolderSelectionState({
    folderId: folder.id,
    selectedFolderIds,
    childrenByParentId,
  });
  const hasLoadedChildren = subfolders.length > 0;

  useEffect(() => {
    if (!subfoldersData?.folders) return;
    onChildrenLoaded(folder.id, subfolders);
  }, [folder.id, onChildrenLoaded, subfolders, subfoldersData?.folders]);

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
            checked={checkboxState}
            onCheckedChange={(checked) =>
              onToggle({ ...folder, path: currentPath }, checked === true)
            }
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
      <TreeNodeContent hasChildren={isExpanded}>
        {hasLoadedChildren ? (
          subfolders.map((subfolder, index) => (
            <FolderNode
              key={subfolder.id}
              folder={{
                ...subfolder,
                path: `${currentPath}/${subfolder.name}`,
              }}
              isLast={index === subfolders.length - 1}
              selectedFolderIds={selectedFolderIds}
              onToggle={onToggle}
              onChildrenLoaded={onChildrenLoaded}
              level={level + 1}
              parentPath={currentPath}
              childrenByParentId={childrenByParentId}
              knownChildren={childrenByParentId.get(subfolder.id)}
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

export function NoFoldersFound({
  emailAccountId,
  driveConnectionId,
  onFolderCreated,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  onFolderCreated?: () => void;
}) {
  return (
    <CardBasic className="mt-4 p-2">
      <Empty className="border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyTitle>No folders found</EmptyTitle>
          <EmptyDescription>
            Create a folder in your drive to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <CreateFolderDialog
            emailAccountId={emailAccountId}
            driveConnectionId={driveConnectionId}
            onFolderCreated={onFolderCreated}
            triggerLabel="Create folder"
          />
        </EmptyContent>
      </Empty>
    </CardBasic>
  );
}

export function CreateFolderDialog({
  emailAccountId,
  driveConnectionId,
  onFolderCreated,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  triggerIcon,
  triggerClassName,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  onFolderCreated?: () => void;
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerIcon?: ButtonProps["Icon"];
  triggerClassName?: string;
}) {
  const { isOpen, onClose, onToggle } = useDialogState();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateDriveFolderBody>({
    resolver: zodResolver(createDriveFolderBody),
    defaultValues: { driveConnectionId: "" },
  });

  const onSubmit: SubmitHandler<CreateDriveFolderBody> = useCallback(
    async (data) => {
      if (!driveConnectionId) {
        toastError({
          title: "Error creating folder",
          description: "No drive connection found",
        });
        return;
      }

      const result = await createDriveFolderAction(emailAccountId, {
        ...data,
        driveConnectionId,
      });

      if (result?.serverError) {
        toastError({
          title: "Error creating folder",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Folder created!" });
        reset();
        onClose();
        onFolderCreated?.();
      }
    },
    [emailAccountId, reset, onClose, onFolderCreated, driveConnectionId],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogTrigger asChild>
        <Button
          disabled={!driveConnectionId}
          variant={triggerVariant}
          size={triggerSize}
          Icon={triggerIcon}
          className={triggerClassName}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
          <DialogDescription>
            Create a new folder in your drive to organize your files.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            type="text"
            name="folderName"
            label="Folder name"
            placeholder="e.g. Receipts"
            registerProps={register("folderName")}
            error={errors.folderName}
          />
          <Button type="submit" loading={isSubmitting}>
            Create folder
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
