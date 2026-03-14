import useSWR from "swr";
import type { GetDriveSourceChildrenQuery } from "@/app/api/user/drive/source-items/[folderId]/route";
import type { GetDriveSourceChildrenResponse } from "@/app/api/user/drive/source-items/[folderId]/route";

export function useDriveSourceChildren(
  params:
    | (GetDriveSourceChildrenQuery & {
        folderId: string;
      })
    | null,
) {
  return useSWR<GetDriveSourceChildrenResponse>(
    params
      ? `/api/user/drive/source-items/${params.folderId}?driveConnectionId=${params.driveConnectionId}`
      : null,
  );
}
