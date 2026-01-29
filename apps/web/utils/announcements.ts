import type { ReactNode } from "react";

export interface Announcement {
  id: string;
  title: string;
  description: string;
  image: ReactNode;
  link?: string;
  learnMoreLink?: string;
  publishedAt: string;
  enabled?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Example announcement:
  // {
  //   id: "follow-up-tracking-2025-01",
  //   title: "Follow-up Reminders",
  //   description:
  //     "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
  //   image: <FollowUpAnimation />,
  //   link: "/automation?tab=settings",
  //   learnMoreLink: "/#",
  //   publishedAt: "2026-01-15T00:00:00Z",
  //   enabled: true,
  // },
];

export function getActiveAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => a.enabled !== false).sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function hasNewAnnouncements(
  dismissedAt: Date | null | undefined,
  createdAt: Date | null | undefined,
): boolean {
  const announcements = getActiveAnnouncements();
  if (announcements.length === 0) return false;
  const cutoffDate = dismissedAt ?? createdAt;
  if (!cutoffDate) return true;
  return announcements.some(
    (a) => new Date(a.publishedAt) > new Date(cutoffDate),
  );
}
