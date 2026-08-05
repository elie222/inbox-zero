import he from "he";
import { isHost } from "@/utils/meeting-recorder/normalize-meeting-url";

// Keep these hosts in sync with normalizeMeetingUrl: links extracted here
// become its input when building recording dedup keys.
const KNOWN_MEETING_HOST =
  /meet\.google\.com|zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com/i;

const TRAILING_PUNCTUATION = /[),.;:!?]+$/;

export function findVideoConferenceLink(
  ...eventDetails: Array<string | null | undefined>
): string | undefined {
  for (const detail of eventDetails) {
    if (!detail) continue;

    // Decode before filtering: HTML bodies can entity-encode any character,
    // including dots in hostnames (e.g. meet&#46;google&#46;com).
    const decoded = he.decode(detail);
    if (!KNOWN_MEETING_HOST.test(decoded)) continue;

    const urls = decoded.match(/https?:\/\/[^\s<>"']+/gi);

    for (const url of urls ?? []) {
      if (!KNOWN_MEETING_HOST.test(url)) continue;
      const candidate = url.replace(TRAILING_PUNCTUATION, "");
      if (isVideoConferenceLink(candidate)) return candidate;
    }
  }
}

function isVideoConferenceLink(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    const host = url.hostname;

    if (isHost(host, "meet.google.com")) {
      return url.pathname !== "/";
    }

    if (isHost(host, "zoom.us") || isHost(host, "zoom.com")) {
      return /^\/(?:j|s|w|wc\/join|my)\//i.test(url.pathname);
    }

    if (isHost(host, "teams.microsoft.com")) {
      return /^\/(?:l\/meetup-join|meet)\//i.test(url.pathname);
    }

    return isHost(host, "teams.live.com") && /^\/meet\//i.test(url.pathname);
  } catch {
    return false;
  }
}
