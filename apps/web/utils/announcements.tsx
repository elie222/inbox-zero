import type { ReactNode } from "react";

export interface AnnouncementDetail {
  title: string;
  description: string;
  icon: string;
}

export interface Announcement {
  title: string;
  description: string;
  image: ReactNode;
  link?: string;
  learnMoreLink?: string;
  publishedAt: string;
  enabled?: boolean;
  details?: AnnouncementDetail[];
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Example announcement:
  {
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    image: <div>[image]</div>,
    link: "/automation?tab=settings",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
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

export function getActiveAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => a.enabled !== false).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function hasNewAnnouncements(
  dismissedAt: Date | null | undefined,
): boolean {
  const announcements = getActiveAnnouncements();
  if (announcements.length === 0) return false;
  if (!dismissedAt) return true;
  return announcements.some(
    (a) => new Date(a.publishedAt) > new Date(dismissedAt),
  );
}
