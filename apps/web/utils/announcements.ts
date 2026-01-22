export interface AnnouncementDetail {
  title: string;
  description: string;
  icon?: "clock" | "tag" | "file-edit" | "check";
}

export interface Announcement {
  id: string;
  title: string;
  description: string;
  link?: string;
  learnMoreLink?: string;
  publishedAt: string; // ISO date string
  details?: AnnouncementDetail[];
  actionType?: "enable" | "view";
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "follow-up-tracking-2025-01",
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    link: "/automation?tab=follow-ups",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
    actionType: "enable",
    details: [
      {
        title: "Tracks waiting threads",
        description: "Knows when you're waiting for a reply.",
        icon: "clock",
      },
      {
        title: "Automatic follow-up labels",
        description: "Labels threads after 3 days with no response.",
        icon: "tag",
      },
      {
        title: "Auto-generated drafts",
        description: "Creates a draft to nudge unresponsive contacts.",
        icon: "file-edit",
      },
    ],
  },
  {
    id: "smart-categories-2025-01",
    title: "Smart Categories",
    description:
      "AI-powered email categorization that learns from your habits. Automatically sort emails into the right folders.",
    link: "/automation",
    learnMoreLink: "/#",
    publishedAt: "2026-01-14T00:00:00Z",
    actionType: "enable",
    details: [
      {
        title: "AI-powered sorting",
        description:
          "Automatically categorize emails based on content and sender.",
      },
      {
        title: "Custom categories",
        description: "Create your own categories tailored to your workflow.",
      },
      {
        title: "Learning system",
        description: "Gets smarter over time by learning from your actions.",
      },
    ],
  },
  {
    id: "bulk-unsubscribe-2025-01",
    title: "Bulk Unsubscribe Improvements",
    description:
      "Unsubscribe from multiple newsletters at once with our improved bulk actions. Clean up your inbox faster than ever.",
    link: "/bulk-unsubscribe",
    learnMoreLink: "/#",
    publishedAt: "2026-01-12T00:00:00Z",
    actionType: "view",
    details: [
      {
        title: "One-click bulk actions",
        description: "Unsubscribe from dozens of newsletters at once.",
      },
      {
        title: "Smart detection",
        description: "Automatically finds all your newsletter subscriptions.",
      },
      {
        title: "Undo support",
        description: "Made a mistake? Easily resubscribe if needed.",
      },
    ],
  },
  {
    id: "email-analytics-2025-01",
    title: "Email Analytics Dashboard",
    description:
      "Get insights into your email habits with detailed analytics. See response times, peak hours, and more.",
    link: "/stats",
    learnMoreLink: "/#",
    publishedAt: "2026-01-10T00:00:00Z",
    actionType: "view",
    details: [
      {
        title: "Response time tracking",
        description: "See how quickly you respond to different senders.",
      },
      {
        title: "Email volume insights",
        description: "Understand your peak email hours and busy days.",
      },
      {
        title: "Sender analytics",
        description: "Know who sends you the most emails.",
      },
    ],
  },
  {
    id: "cold-email-blocker-2025-01",
    title: "Cold Email Blocker",
    description:
      "Automatically detect and filter cold emails and spam. Keep your inbox focused on what matters.",
    link: "/cold-email-blocker",
    learnMoreLink: "/#",
    publishedAt: "2026-01-08T00:00:00Z",
    actionType: "view",
    details: [
      {
        title: "AI spam detection",
        description: "Identifies cold outreach and sales emails automatically.",
      },
      {
        title: "Customizable filters",
        description: "Fine-tune what gets blocked and what gets through.",
      },
      {
        title: "Sender reputation",
        description: "Leverages sender history to improve accuracy.",
      },
    ],
  },
  {
    id: "keyboard-shortcuts-2025-01",
    title: "New Keyboard Shortcuts",
    description:
      "Navigate your inbox faster with new keyboard shortcuts. Press ? anywhere to see the full list.",
    learnMoreLink: "/#",
    publishedAt: "2026-01-05T00:00:00Z",
    details: [
      {
        title: "Quick navigation",
        description: "Jump between emails and folders instantly.",
      },
      {
        title: "Bulk actions",
        description: "Archive, delete, or label multiple emails at once.",
      },
      {
        title: "Customizable bindings",
        description: "Set your own shortcuts for common actions.",
      },
    ],
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
