import { withError } from "@/utils/middleware";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { exchangeMicrosoftDriveCode } from "@/utils/drive/client";

const microsoftDriveProvider = {
  name: "microsoft" as const,
  exchangeCodeForTokens: exchangeMicrosoftDriveCode,
};

export const GET = withError("outlook/drive/callback", async (request) => {
  return handleDriveCallback(request, microsoftDriveProvider, request.logger);
});
