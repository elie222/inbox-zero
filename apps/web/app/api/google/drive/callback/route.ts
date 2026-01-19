import { withError } from "@/utils/middleware";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { exchangeGoogleDriveCode } from "@/utils/drive/client";

export const GET = withError("google/drive/callback", async (request) => {
  return handleDriveCallback(
    request,
    {
      name: "google",
      exchangeCodeForTokens: exchangeGoogleDriveCode,
    },
    request.logger,
  );
});
