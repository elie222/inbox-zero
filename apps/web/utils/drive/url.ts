import { captureException } from "@/utils/error";
import type { DriveProviderType } from "./types";

export function getDriveFileUrl(
  fileId: string,
  provider: DriveProviderType,
): string {
  switch (provider) {
    case "google":
      return `https://drive.google.com/file/d/${fileId}/view`;
    case "microsoft":
      return `https://onedrive.live.com/?id=${fileId}`;
    default: {
      captureException(new Error("Invalid provider"), { extra: { provider } });
      const exhaustiveCheck: never = provider;
      return exhaustiveCheck;
    }
  }
}
