import { WebClient } from "@slack/web-api";

export function createSlackClient(accessToken: string): WebClient {
  return new WebClient(accessToken);
}
