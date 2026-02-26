import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import type { GetDriveFoldersResponse } from "@/app/api/user/drive/folders/route";
import { cleanupStaleFilingFoldersAction } from "@/utils/actions/drive";

export function useDriveFolders(emailAccountId?: string) {
  const swrResult = useSWR<GetDriveFoldersResponse>("/api/user/drive/folders");
  const attemptedCleanupKeyRef = useRef<string>("");
  const staleFolderDbIds = swrResult.data?.staleFolderDbIds ?? [];
  const staleFolderCleanupKey = useMemo(
    () => staleFolderDbIds.slice().sort().join(","),
    [staleFolderDbIds],
  );

  useEffect(() => {
    if (!emailAccountId || staleFolderDbIds.length === 0) return;
    if (attemptedCleanupKeyRef.current === staleFolderCleanupKey) return;

    attemptedCleanupKeyRef.current = staleFolderCleanupKey;

    void cleanupStaleFilingFoldersAction(emailAccountId, {
      filingFolderIds: staleFolderDbIds,
    });
  }, [emailAccountId, staleFolderCleanupKey, staleFolderDbIds]);

  return swrResult;
}
