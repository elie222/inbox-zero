import { withError } from "@/utils/middleware";
import { handleTeamsCallback } from "@/utils/teams/handle-teams-callback";

export const GET = withError("teams/callback", async (request) => {
  return handleTeamsCallback(request, request.logger);
});
