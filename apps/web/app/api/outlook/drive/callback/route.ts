import { withError } from "@/utils/middleware";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { exchangeMicrosoftDriveCode } from "@/utils/drive/client";

export const GET = withError("outlook/drive/callback", async (request) => {
  return handleDriveCallback(
    request,
    {
      name: "microsoft",
      exchangeCodeForTokens: exchangeMicrosoftDriveCode,
    },
    request.logger,
  );
});
