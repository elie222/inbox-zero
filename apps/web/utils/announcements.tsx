import type { ReactNode } from "react";
import { FileEdit, Tag } from "lucide-react";
import { FollowUpRemindersIllustration } from "@/components/feature-announcements/FollowUpRemindersIllustration";

const DETAIL_ICON_CLASS = "h-4 w-4 text-gray-600 dark:text-gray-400";

export interface AnnouncementDetail {
  title: string;
  description: string;
  icon: ReactNode;
}

export interface Announcement {
  id: string;
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
  {
    id: "follow-up-reminders",
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    image: <FollowUpRemindersIllustration />,
    link: "/automation?tab=settings",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
    details: [
      {
        title: "Automatic follow-up labels",
        description: "Labels threads after 3 days with no response.",
        icon: <Tag className={DETAIL_ICON_CLASS} />,
      },
      {
        title: "Auto-generated drafts",
        description: "Creates a draft to nudge unresponsive contacts.",
        icon: <FileEdit className={DETAIL_ICON_CLASS} />,
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
