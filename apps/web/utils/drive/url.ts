import type { DriveProviderType } from "./types";

export function getDriveFileUrl(
  fileId: string,
  provider: DriveProviderType | string,
): string {
  if (provider === "google") {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
  if (provider === "microsoft") {
    return `https://onedrive.live.com/?id=${fileId}`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}
