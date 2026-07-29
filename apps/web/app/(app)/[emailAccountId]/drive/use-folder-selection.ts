"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toastError } from "@/components/Toast";
import {
  addFilingFolderAction,
  removeFilingFolderAction,
} from "@/utils/actions/drive";
import type {
  FolderItem,
  SavedFolder,
} from "@/app/api/user/drive/folders/route";
import {
  applyLoadedFolderChildrenSelection,
  folderSelection,
  type FolderChildrenMap,
} from "./allowed-folder-selection";

export function useFolderSelection({
  emailAccountId,
  availableFolders,
  savedFolders,
  mutateFolders,
  onFoldersAdded,
  onFoldersRemoved,
}: {
  emailAccountId: string;
  availableFolders: FolderItem[];
  savedFolders: SavedFolder[];
  mutateFolders: () => void;
  onFoldersAdded?: (savedFolderCount: number) => void;
  onFoldersRemoved?: (savedFolderCount: number) => void;
}) {
  const [optimisticFolderIds, setOptimisticFolderIds] = useState<Set<string>>(
    () => new Set(savedFolders.map((f) => f.folderId)),
  );
  const [childrenByParentId, setChildrenByParentId] =
    useState<FolderChildrenMap>(() =>
      folderSelection.buildChildrenMap(availableFolders),
    );

  const serverFolderIds = savedFolders.map((f) => f.folderId).join(",");
  const prevServerFolderIds = useRef(serverFolderIds);
  useEffect(() => {
    if (serverFolderIds === prevServerFolderIds.current) return;
    prevServerFolderIds.current = serverFolderIds;
    setOptimisticFolderIds(new Set(savedFolders.map((f) => f.folderId)));
  }, [savedFolders, serverFolderIds]);

  useEffect(() => {
    setChildrenByParentId(folderSelection.buildChildrenMap(availableFolders));
  }, [availableFolders]);

  const persistSelection = useCallback(
    async ({
      nextFolderIds,
      changedFolders,
      isChecked,
    }: {
      nextFolderIds: Set<string>;
      changedFolders: FolderItem[];
      isChecked: boolean;
    }) => {
      const previousFolderIds = optimisticFolderIds;
      setOptimisticFolderIds(nextFolderIds);

      try {
        const results = await Promise.all(
          changedFolders.map((changedFolder) =>
            isChecked
              ? addFilingFolderAction(emailAccountId, {
                  folderId: changedFolder.id,
                  folderName: changedFolder.name,
                  folderPath: changedFolder.path || changedFolder.name,
                  driveConnectionId: changedFolder.driveConnectionId,
                })
              : removeFilingFolderAction(emailAccountId, {
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
            title: isChecked ? "Error adding folder" : "Error removing folder",
            description: serverError,
          });
        } else {
          mutateFolders();
        }
      } catch {
        setOptimisticFolderIds(previousFolderIds);
        toastError({
          title: isChecked ? "Error adding folder" : "Error removing folder",
          description: "Please try again.",
        });
      }
    },
    [emailAccountId, mutateFolders, optimisticFolderIds],
  );

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const { nextKeys, changedItems } = folderSelection.applySelection({
        item: folder,
        checked: isChecked,
        selectedKeys: optimisticFolderIds,
        childrenByParentId,
      });

      if (isChecked) {
        onFoldersAdded?.(optimisticFolderIds.size + changedItems.length);
      } else {
        onFoldersRemoved?.(
          Math.max(optimisticFolderIds.size - changedItems.length, 0),
        );
      }

      await persistSelection({
        nextFolderIds: nextKeys,
        changedFolders: changedItems,
        isChecked,
      });
    },
    [
      childrenByParentId,
      onFoldersAdded,
      onFoldersRemoved,
      optimisticFolderIds,
      persistSelection,
    ],
  );

  const handleChildrenLoaded = useCallback(
    (parent: FolderItem, children: FolderItem[]) => {
      const { nextFolderIds, changedFolders } =
        applyLoadedFolderChildrenSelection({
          parent,
          children,
          selectedFolderIds: optimisticFolderIds,
          childrenByParentId,
        });

      setChildrenByParentId((current) =>
        folderSelection.mergeChildren({
          childrenByParentId: current,
          parentId: parent.id,
          children,
        }),
      );

      if (changedFolders.length > 0) {
        persistSelection({
          nextFolderIds,
          changedFolders,
          isChecked: true,
        });
      }
    },
    [childrenByParentId, optimisticFolderIds, persistSelection],
  );

  const rootFolders = useMemo(
    () => folderSelection.getRootItems(availableFolders),
    [availableFolders],
  );

  return {
    optimisticFolderIds,
    childrenByParentId,
    rootFolders,
    handleFolderToggle,
    handleChildrenLoaded,
  };
}
