import type { DriveFile, DriveFolder } from "@/utils/drive/types";

export type DriveSourceItem = {
  id: string;
  name: string;
  path: string;
  driveConnectionId: string;
  provider: string;
  type: "folder" | "file";
  parentId?: string;
  mimeType?: string;
};

export function buildDriveSourceItems({
  driveConnectionId,
  provider,
  folders,
  files,
}: {
  driveConnectionId: string;
  provider: string;
  folders: DriveFolder[];
  files: DriveFile[];
}): DriveSourceItem[] {
  return [
    ...folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path || folder.name,
      driveConnectionId,
      provider,
      type: "folder" as const,
      parentId: folder.parentId,
    })),
    ...files.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.name,
      driveConnectionId,
      provider,
      type: "file" as const,
      parentId: file.folderId,
      mimeType: file.mimeType,
    })),
  ];
}
