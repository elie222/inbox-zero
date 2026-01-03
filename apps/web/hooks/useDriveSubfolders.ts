import useSWR from "swr";
import type {
  GetSubfoldersQuery,
  GetSubfoldersResponse,
} from "@/app/api/user/drive/folders/[folderId]/route";

export function useDriveSubfolders(
  params: (GetSubfoldersQuery & { folderId: string }) | null,
) {
  return useSWR<GetSubfoldersResponse>(
    params
      ? `/api/user/drive/folders/${params.folderId}?driveConnectionId=${params.driveConnectionId}`
      : null,
  );
}
