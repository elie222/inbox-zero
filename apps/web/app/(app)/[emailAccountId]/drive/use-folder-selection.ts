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

  // Selection updates apply per-folder deltas via functional setState so
  // concurrent persists (e.g. two lazy loads resolving together) merge
  // instead of overwriting each other's whole selection set.
  const persistSelection = useCallback(
    async ({
      changedFolders,
      isChecked,
    }: {
      changedFolders: FolderItem[];
      isChecked: boolean;
    }) => {
      const changedFolderIds = changedFolders.map((folder) => folder.id);
      setOptimisticFolderIds((current) =>
        applySelectionDelta({
          current,
          folderIds: changedFolderIds,
          isChecked,
        }),
      );

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
          // Roll back only the failed folders; sibling mutations that
          // succeeded are already persisted server-side.
          const failedFolderIds = changedFolderIds.filter(
            (_, index) => results[index]?.serverError,
          );
          setOptimisticFolderIds((current) =>
            applySelectionDelta({
              current,
              folderIds: failedFolderIds,
              isChecked: !isChecked,
            }),
          );
          toastError({
            title: isChecked ? "Error adding folder" : "Error removing folder",
            description: serverError,
          });
        }
        mutateFolders();
      } catch {
        setOptimisticFolderIds((current) =>
          applySelectionDelta({
            current,
            folderIds: changedFolderIds,
            isChecked: !isChecked,
          }),
        );
        toastError({
          title: isChecked ? "Error adding folder" : "Error removing folder",
          description: "Please try again.",
        });
        mutateFolders();
      }
    },
    [emailAccountId, mutateFolders],
  );

  const handleFolderToggle = useCallback(
    async (folder: FolderItem, isChecked: boolean) => {
      const { changedItems } = folderSelection.applySelection({
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
      const { changedFolders } = applyLoadedFolderChildrenSelection({
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

function applySelectionDelta({
  current,
  folderIds,
  isChecked,
}: {
  current: Set<string>;
  folderIds: string[];
  isChecked: boolean;
}) {
  const next = new Set(current);
  for (const folderId of folderIds) {
    if (isChecked) {
      next.add(folderId);
    } else {
      next.delete(folderId);
    }
  }
  return next;
}
