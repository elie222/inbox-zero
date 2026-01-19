export interface Announcement {
  id: string;
  title: string;
  description: string;
  link?: string;
  publishedAt: string; // ISO date string
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "follow-up-tracking-2025-01",
    title: "Email Follow-up Tracking",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    link: "/automation?tab=follow-ups",
    publishedAt: "2025-01-15T00:00:00Z",
  },
];

/**
 * Get announcements that are less than 6 months old, sorted by newest first.
 * This prevents stale announcements from piling up for new users/self-hosters.
 */
export function getActiveAnnouncements(): Announcement[] {
  const now = Date.now();
  return ANNOUNCEMENTS.filter(
    (a) => now - new Date(a.publishedAt).getTime() < SIX_MONTHS_MS,
  ).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
