import type { ReactNode } from "react";

export interface Announcement {
  id: string;
  title: string;
  description: string;
  image: string;
  link?: string;
  learnMoreLink?: string;
  publishedAt: string;
  enabled?: boolean;
  customContent?: ReactNode;
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Example announcement:
  // {
  //   id: "follow-up-tracking-2025-01",
  //   title: "Follow-up Reminders",
  //   description:
  //     "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
  //   image: "/images/announcements/follow-up-reminders-illustration.svg",
  //   link: "/automation?tab=settings",
  //   learnMoreLink: "/#",
  //   publishedAt: "2026-01-15T00:00:00Z",
  //   enabled: true,
  //   customContent: <FollowUpDetails />, // Optional custom React component
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
): boolean {
  const announcements = getActiveAnnouncements();
  if (announcements.length === 0) return false;
  if (!dismissedAt) return true;
  return announcements.some(
    (a) => new Date(a.publishedAt) > new Date(dismissedAt),
  );
}
