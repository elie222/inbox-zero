export const TEAMS_STATE_COOKIE_NAME = "teams_oauth_state";
export const TEAMS_OAUTH_STATE_TYPE = "teams";

export const TEAMS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Send",
].join(" ");

export const TEAMS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
