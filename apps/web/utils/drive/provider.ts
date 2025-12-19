import type { DriveConnection } from "@/generated/prisma/client";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { DriveProvider } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";
import { OneDriveProvider } from "@/utils/drive/providers/microsoft";
import { GoogleDriveProvider } from "@/utils/drive/providers/google";

/**
 * Factory function to create the appropriate DriveProvider based on connection type.
 * Follows the same pattern as createEmailProvider.
 *
 * Note: This creates a provider with the current access token. For long-running
 * operations, use createDriveProviderWithRefresh to handle token expiration.
 */
export function createDriveProvider(
  connection: Pick<DriveConnection, "provider" | "accessToken">,
  logger: Logger,
): DriveProvider {
  const { provider, accessToken } = connection;

  if (!accessToken) {
    throw new Error("No access token available for drive connection");
  }

  if (isMicrosoftProvider(provider)) {
    return new OneDriveProvider(accessToken, logger);
  }

  if (isGoogleProvider(provider)) {
    return new GoogleDriveProvider(accessToken, logger);
  }

  throw new Error(`Unsupported drive provider: ${provider}`);
}

// TODO: Add createDriveProviderWithRefresh for handling token expiration
// This will be similar to getOutlookClientWithRefresh but for drive connections
