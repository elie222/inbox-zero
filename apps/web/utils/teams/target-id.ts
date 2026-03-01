const TARGET_SEPARATOR = "::";

export function encodeTeamsTargetId({
  teamId,
  channelId,
}: {
  teamId: string;
  channelId: string;
}): string {
  return `${encodeURIComponent(teamId)}${TARGET_SEPARATOR}${encodeURIComponent(channelId)}`;
}

export function decodeTeamsTargetId(
  targetId: string,
): { teamId: string; channelId: string } | null {
  const separatorIndex = targetId.indexOf(TARGET_SEPARATOR);
  if (separatorIndex === -1) return null;

  const encodedTeamId = targetId.slice(0, separatorIndex);
  const encodedChannelId = targetId.slice(
    separatorIndex + TARGET_SEPARATOR.length,
  );
  if (!encodedTeamId || !encodedChannelId) return null;

  try {
    const teamId = decodeURIComponent(encodedTeamId);
    const channelId = decodeURIComponent(encodedChannelId);
    if (!teamId || !channelId) return null;

    return { teamId, channelId };
  } catch {
    return null;
  }
}
