// Normalizes a video conference link into a stable key used to detect that two
// calendar events (possibly on different accounts) are the same physical
// meeting. The result is a dedup key only: it strips passwords and per-invitee
// context, so it must never be sent to the bot provider.

// Anchored so a provider-shaped fragment somewhere inside an unrelated path
// cannot be mistaken for a meeting id.
const ZOOM_MEETING_ID = /^\/(?:j|s|w|wc\/join)\/(\d{9,13})(?:\/|$)/;
const TEAMS_THREAD_ID = /^\/l\/meetup-join\/(19:[^/]*@thread\.v2)(?:\/|$)/;
const TEAMS_LIVE_MEET_ID = /^\/meet\/(\d+)(?:\/|$)/;

/**
 * True when `host` is the domain itself or a subdomain of it.
 *
 * A plain `endsWith` would accept `evilzoom.us`, and because the result is the
 * key that decides which accounts share a recording, that would let an
 * attacker-controlled link collide with a real meeting.
 */
export function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

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

  if (isHost(host, "meet.google.com")) {
    return `meet.google.com${stripTrailingSlash(url.pathname.toLowerCase())}`;
  }

  if (isHost(host, "zoom.us") || isHost(host, "zoom.com")) {
    return normalizeZoom(url, host);
  }

  if (isHost(host, "teams.microsoft.com") || isHost(host, "teams.live.com")) {
    return normalizeTeams(url, host);
  }

  return `${host}${stripTrailingSlash(url.pathname.toLowerCase())}`;
}

function normalizeZoom(url: URL, host: string): string {
  const meetingId = ZOOM_MEETING_ID.exec(url.pathname)?.[1];
  // Drop the vanity subdomain: acme.zoom.us/j/123 and zoom.us/j/123 are the
  // same meeting, and the password lives in the query string.
  if (meetingId) return `zoom.us/j/${meetingId}`;

  return `${host}${stripTrailingSlash(url.pathname.toLowerCase())}`;
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
