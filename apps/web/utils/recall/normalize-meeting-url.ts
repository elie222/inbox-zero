// Normalizes a video conference link into a stable key used to detect that two
// calendar events (possibly on different accounts) are the same physical
// meeting. The result is a dedup key only: it strips passwords and per-invitee
// context, so it must never be sent to the bot provider.

const ZOOM_MEETING_ID = /\/(?:j|s|w|wc\/join)\/(\d{9,13})/;
const TEAMS_THREAD_ID = /(19:[^/]*@thread\.v2)/;
const TEAMS_LIVE_MEET_ID = /\/meet\/(\d+)/;

export function normalizeMeetingUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  const host = url.hostname.toLowerCase();

  if (host.endsWith("meet.google.com")) {
    return `meet.google.com${stripTrailingSlash(url.pathname.toLowerCase())}`;
  }

  if (host.endsWith("zoom.us") || host.endsWith("zoom.com")) {
    return normalizeZoom(url);
  }

  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) {
    return normalizeTeams(url, host);
  }

  return `${host}${stripTrailingSlash(url.pathname.toLowerCase())}`;
}

function normalizeZoom(url: URL): string {
  const meetingId = ZOOM_MEETING_ID.exec(url.pathname)?.[1];
  // Drop the vanity subdomain: acme.zoom.us/j/123 and zoom.us/j/123 are the
  // same meeting, and the password lives in the query string.
  if (meetingId) return `zoom.us/j/${meetingId}`;

  return `${url.hostname.toLowerCase()}${stripTrailingSlash(
    url.pathname.toLowerCase(),
  )}`;
}

function normalizeTeams(url: URL, host: string): string {
  // Teams encodes the thread id in the path and appends a `context` query
  // parameter that differs per invitee.
  const decodedPath = safeDecode(url.pathname);

  const threadId = TEAMS_THREAD_ID.exec(decodedPath)?.[1];
  if (threadId) return `teams.microsoft.com/l/meetup-join/${threadId}`;

  const liveMeetId = TEAMS_LIVE_MEET_ID.exec(decodedPath)?.[1];
  if (liveMeetId) return `teams.live.com/meet/${liveMeetId}`;

  return `${host}${stripTrailingSlash(decodedPath.toLowerCase())}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripTrailingSlash(path: string): string {
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}
