"use client";

import { useState } from "react";
import { Tag, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AnnouncementContent } from "@/components/feature-announcements/AnnouncementDialog";
import { FollowUpRemindersIllustration } from "@/components/feature-announcements/FollowUpRemindersIllustration";
import type { Announcement } from "@/utils/announcements";

const DETAIL_ICON_CLASS = "h-4 w-4 text-gray-600 dark:text-gray-400";

export function AnnouncementDialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const announcement = getDemoAnnouncement();

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Announcement Dialog</Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl">
          <AnnouncementContent
            announcement={announcement}
            onClose={() => setIsOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function getDemoAnnouncement(): Announcement {
  return {
    id: "follow-up-reminders",
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    image: <FollowUpRemindersIllustration />,
    link: "/automation?tab=settings",
    secondaryLink: { href: "/#", label: "Learn more" },
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
  };
}
