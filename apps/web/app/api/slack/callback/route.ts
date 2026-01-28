import { withError } from "@/utils/middleware";
import { handleSlackCallback } from "@/utils/slack/handle-slack-callback";

export const GET = withError("slack/callback", async (request) => {
  return handleSlackCallback(request, request.logger);
});
