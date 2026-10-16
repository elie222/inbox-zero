import type { ReactNode } from "react";
import {
  Inbox,
  MessagesSquare,
  MonitorSmartphone,
  Rows3,
  Sparkles,
} from "lucide-react";
import { AnnouncementVideo } from "@/components/feature-announcements/AnnouncementVideo";

const DETAIL_ICON_CLASS = "size-4";
export const EMAIL_CLIENT_LAUNCH_VIDEO_ID =
  "1K01tCypmkqhB3OZwCzO9j0202K0089aqXX02tYpgoUzztmc";

export interface AnnouncementDetail {
  description?: string;
  icon: ReactNode;
  title: string;
}

export interface Announcement {
  description: string;
  details?: AnnouncementDetail[];
  enabled?: boolean;
  id: string;
  image: ReactNode;
  link?: string;
  linkLabel?: string;
  publishedAt: string;
  secondaryLink?: { href: string; label: string };
  title: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "email-client-launch",
    title: "The email app is live",
    description:
      "A fast email app for web, desktop, and iPhone, with your AI assistant built in.",
    image: (
      <AnnouncementVideo
        playbackId={EMAIL_CLIENT_LAUNCH_VIDEO_ID}
        thumbnailTime={1.5}
        title="Meet the Inbox Zero email app"
      />
    ),
    link: "/mail",
    linkLabel: "Try it",
    secondaryLink: { href: "/download", label: "Download the app" },
    publishedAt: "2026-10-15T00:00:00Z",
    details: [
      {
        title: "Web, desktop, and mobile",
        icon: <MonitorSmartphone className={DETAIL_ICON_CLASS} />,
      },
      { title: "Unified inbox", icon: <Inbox className={DETAIL_ICON_CLASS} /> },
      { title: "Split inbox", icon: <Rows3 className={DETAIL_ICON_CLASS} /> },
      {
        title: "Private team comments",
        icon: <MessagesSquare className={DETAIL_ICON_CLASS} />,
      },
      {
        title: "AI sorting and drafts",
        icon: <Sparkles className={DETAIL_ICON_CLASS} />,
      },
    ],
  },
  // {
  //   id: "follow-up-reminders",
  //   title: "Follow-up Reminders",
  //   description:
  //     "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
  //   image: <FollowUpRemindersIllustration />,
  //   link: "/automation?tab=settings",
  //   secondaryLink: { href: "/#", label: "Learn more" },
  //   publishedAt: "2026-01-15T00:00:00Z",
  //   details: [
  //     {
  //       title: "Automatic follow-up labels",
  //       description: "Labels threads after 3 days with no response.",
  //       icon: <Tag className={DETAIL_ICON_CLASS} />,
  //     },
  //     {
  //       title: "Auto-generated drafts",
  //       description: "Creates a draft to nudge unresponsive contacts.",
  //       icon: <FileEdit className={DETAIL_ICON_CLASS} />,
  //     },
  //   ],
  // },
  // {
  //   id: "meeting-briefs",
  //   title: "Meeting Briefs",
  //   description:
  //     "Get AI-powered briefings before your meetings. Know who you're meeting and what you've discussed.",
  //   image: <MeetingBriefsIllustration />,
  //   link: "/briefs",
  //   secondaryLink: { href: "/#", label: "Learn more" },
  //   publishedAt: "2024-12-28T00:00:00Z",
  //   details: [
  //     {
  //       title: "AI-powered research",
  //       description: "Researches attendees before your meetings.",
  //       icon: <Search className={DETAIL_ICON_CLASS} />,
  //     },
  //     {
  //       title: "Email context",
  //       description: "Includes recent email history with each guest.",
  //       icon: <Mail className={DETAIL_ICON_CLASS} />,
  //     },
  //   ],
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
