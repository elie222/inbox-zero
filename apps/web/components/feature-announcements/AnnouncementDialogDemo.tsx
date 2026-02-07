"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnnouncementCard } from "@/components/feature-announcements/AnnouncementDialog";
import { FollowUpRemindersIllustration } from "@/components/feature-announcements/FollowUpRemindersIllustration";
import type { Announcement } from "@/utils/announcements";

const DETAIL_ICON_CLASS = "h-4 w-4 text-gray-600 dark:text-gray-400";

export function AnnouncementDialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const announcement = getDemoAnnouncement();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Announcement Dialog</Button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
            />

            <motion.div
              key="modal-container"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="pointer-events-auto relative">
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute -right-9 -top-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                  <ScrollArea className="max-h-[600px] [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                    <div className="flex flex-col gap-4 p-4">
                      <AnnouncementCard
                        announcement={announcement}
                        onClose={handleClose}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
  };
}
