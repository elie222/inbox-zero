import useSWR from "swr";
import type { GetSubfoldersResponse } from "@/app/api/user/drive/folders/[folderId]/route";

export function useDriveSubfolders(
  folderId: string | null,
  driveConnectionId: string | null,
) {
  return useSWR<GetSubfoldersResponse>(
    folderId && driveConnectionId
      ? `/api/user/drive/folders/${folderId}?driveConnectionId=${driveConnectionId}`
      : null,
  );
}
