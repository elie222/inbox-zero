import { withError } from "@/utils/middleware";
import { handleSlackCallback } from "@/utils/messaging/providers/slack/handle-slack-callback";

export const GET = withError("slack/callback", async (request) =>
  handleSlackCallback(request, request.logger),
);
