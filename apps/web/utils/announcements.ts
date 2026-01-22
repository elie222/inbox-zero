export interface AnnouncementDetail {
  title: string;
  description: string;
  icon?: string;
}

export interface Announcement {
  id: string;
  title: string;
  description: string;
  image: string; // Path to SVG image in /public/images/announcements/
  link?: string;
  learnMoreLink?: string;
  publishedAt: string; // ISO date string
  details?: AnnouncementDetail[];
  actionType?: "enable" | "view";
  requiredEnvVar?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "follow-up-tracking-2025-01",
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    image: "/images/announcements/follow-up-reminders-illustration.svg",
    link: "/automation?tab=follow-ups",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
    actionType: "enable",
    requiredEnvVar: "NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED",
    details: [
      {
        title: "Automatic follow-up labels",
        description: "Labels threads after 3 days with no response.",
        icon: "Tag",
      },
      {
        title: "Auto-generated drafts",
        description: "Creates a draft to nudge unresponsive contacts.",
        icon: "FileEdit",
      },
    ],
  },
];

// Get all announcements sorted by newest first. Filters by requiredEnvVar if specified.
export function getActiveAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => {
    // Check if required env var is set (if specified)
    return a.requiredEnvVar ? process.env[a.requiredEnvVar] === "true" : true;
  }).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
