import { env } from "@/env";

export function isTeamsBotConfigured() {
  return Boolean(
    env.TEAMS_BOT_APP_ID &&
      env.TEAMS_BOT_APP_PASSWORD &&
      env.TEAMS_BOT_APP_TENANT_ID,
  );
}
