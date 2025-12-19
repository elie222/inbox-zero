import { withError } from "@/utils/middleware";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { exchangeGoogleDriveCode } from "@/utils/drive/client";

const googleDriveProvider = {
  name: "google" as const,
  exchangeCodeForTokens: exchangeGoogleDriveCode,
};

export const GET = withError("google/drive/callback", async (request) => {
  return handleDriveCallback(request, googleDriveProvider, request.logger);
});
