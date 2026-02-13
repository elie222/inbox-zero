export const SLACK_STATE_COOKIE_NAME = "slack_oauth_state";
export const SLACK_OAUTH_STATE_TYPE = "slack";

export const SLACK_SCOPES = [
  "channels:read",
  "channels:join",
  "groups:read",
  "chat:write",
  "app_mentions:read",
  "im:read",
  "im:write",
  "im:history",
  "reactions:write",
].join(",");
