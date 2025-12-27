"use client";

import { useCallback, useMemo, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderIcon, Loader2Icon } from "lucide-react";
import {
  Card,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
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

export function AllowedFolders({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, error, mutate } = useDriveFolders();
  const { data: connectionsData } = useDriveConnections();
  const driveConnectionId = connectionsData?.connections[0]?.id;

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <AllowedFoldersContent
          emailAccountId={emailAccountId}
          availableFolders={data.availableFolders}
          savedFolders={data.savedFolders}
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
  mutateFolders,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  mutateFolders: () => void;
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

  const savedFolderIds = useMemo(
    () => new Set(savedFolders.map((f) => f.folderId)),
    [savedFolders],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Allowed folders</CardTitle>
        <CardDescription>AI can only file to these folders</CardDescription>
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
  isDisabled,
  level,
  parentPath,
  knownChildren,
}: {
  folder: FolderItem;
  isLast: boolean;
  selectedFolderIds: Set<string>;
  onToggle: (folder: FolderItem, isChecked: boolean) => void;
  isDisabled: boolean;
  level: number;
  parentPath: string;
  knownChildren?: FolderItem[];
}) {
  const { expandedIds } = useTree();
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderIds.has(folder.id);
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

  const subfolders = subfoldersData?.folders ?? knownChildren ?? [];
  const hasLoadedChildren = subfolders.length > 0;
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
              selectedFolderIds={selectedFolderIds}
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

export function NoFoldersFound({
  emailAccountId,
  driveConnectionId,
  onFolderCreated,
}: {
  emailAccountId: string;
  driveConnectionId: string | null;
  onFolderCreated?: () => void;
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
      <EmptyContent>
        <Dialog open={isOpen} onOpenChange={onToggle}>
          <DialogTrigger asChild>
            <Button disabled={!driveConnectionId}>Create folder</Button>
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
      </EmptyContent>
    </Empty>
  );
}
