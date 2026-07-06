import type { ReactNode } from "react";

export interface AnnouncementDetail {
  description: string;
  icon: ReactNode;
  title: string;
}

export interface Announcement {
  description: string;
  details?: AnnouncementDetail[];
  enabled?: boolean;
  id: string;
  image: ReactNode;
  learnMoreLink?: string;
  link?: string;
  publishedAt: string;
  title: string;
}

// See AnnouncementDialogDemo for an example entry.
export const ANNOUNCEMENTS: Announcement[] = [];

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
