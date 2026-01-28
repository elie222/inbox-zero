import useSWR from "swr";
import type { GetSlackConnectionResponse } from "@/app/api/user/slack/connections/route";
import type { GetSlackChannelsResponse } from "@/app/api/user/slack/channels/route";

export function useSlackConnection() {
  return useSWR<GetSlackConnectionResponse>("/api/user/slack/connections");
}

export function useSlackChannels() {
  return useSWR<GetSlackChannelsResponse>("/api/user/slack/channels");
}
