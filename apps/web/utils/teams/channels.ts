import { decodeTeamsTargetId, encodeTeamsTargetId } from "./target-id";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const MAX_TEAMS = 25;
const MAX_CHANNELS = 500;

type GraphCollectionResponse<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

type GraphTeam = {
  id?: string;
  displayName?: string;
};

type GraphChannel = {
  id?: string;
  displayName?: string;
  membershipType?: string;
};

export type TeamsChannelTarget = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export async function listTeamsChannels(
  accessToken: string,
): Promise<TeamsChannelTarget[]> {
  const teams = await getCollection<GraphTeam>(
    `${GRAPH_BASE_URL}/me/joinedTeams?$select=id,displayName`,
    accessToken,
    MAX_TEAMS,
  );

  const targets: TeamsChannelTarget[] = [];

  for (const team of teams) {
    if (!team.id) continue;

    const teamName = team.displayName || "Team";
    const channels = await getCollection<GraphChannel>(
      `${GRAPH_BASE_URL}/teams/${encodeURIComponent(team.id)}/channels?$select=id,displayName,membershipType`,
      accessToken,
      MAX_CHANNELS,
    ).catch(() => []);

    for (const channel of channels) {
      if (!channel.id) continue;

      const channelName = channel.displayName || "Channel";
      targets.push({
        id: encodeTeamsTargetId({ teamId: team.id, channelId: channel.id }),
        name: `${teamName} / ${channelName}`,
        isPrivate: channel.membershipType === "private",
      });
    }
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamsChannelInfo(
  accessToken: string,
  targetId: string,
): Promise<TeamsChannelTarget | null> {
  const decoded = decodeTeamsTargetId(targetId);
  if (!decoded) return null;

  const { teamId, channelId } = decoded;

  const [team, channel] = await Promise.all([
    getJson<GraphTeam>(
      `${GRAPH_BASE_URL}/teams/${encodeURIComponent(teamId)}?$select=id,displayName`,
      accessToken,
    ),
    getJson<GraphChannel>(
      `${GRAPH_BASE_URL}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}?$select=id,displayName,membershipType`,
      accessToken,
    ),
  ]);

  if (!team.id || !channel.id) return null;

  const teamName = team.displayName || "Team";
  const channelName = channel.displayName || "Channel";

  return {
    id: targetId,
    name: `${teamName} / ${channelName}`,
    isPrivate: channel.membershipType === "private",
  };
}

async function getCollection<T>(
  url: string,
  accessToken: string,
  maxItems: number,
): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl && items.length < maxItems) {
    const response = await getJson<GraphCollectionResponse<T>>(
      nextUrl,
      accessToken,
    );
    if (response.value) {
      items.push(...response.value);
    }

    nextUrl = response["@odata.nextLink"];
  }

  if (items.length > maxItems) {
    return items.slice(0, maxItems);
  }

  return items;
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Microsoft Graph request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }

  return (await response.json()) as T;
}
