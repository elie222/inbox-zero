// import { env } from "@/env";

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
  enabled?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  // {
  //   id: "follow-up-tracking-2025-01",
  //   title: "Follow-up Reminders",
  //   description:
  //     "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
  //   image: "/images/announcements/follow-up-reminders-illustration.svg",
  //   link: "/automation?tab=settings",
  //   learnMoreLink: "/#",
  //   publishedAt: "2026-01-15T00:00:00Z",
  //   enabled: env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED ?? false,
  //   details: [
  //     {
  //       title: "Automatic follow-up labels",
  //       description: "Labels threads after 3 days with no response.",
  //       icon: "Tag",
  //     },
  //     {
  //       title: "Auto-generated drafts",
  //       description: "Creates a draft to nudge unresponsive contacts.",
  //       icon: "FileEdit",
  //     },
  //   ],
  // },
];

// Get all announcements sorted by newest first. Filters by enabled property.
export function getActiveAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => a.enabled !== false).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
