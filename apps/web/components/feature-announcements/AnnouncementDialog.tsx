"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "next-safe-action/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingContent } from "@/components/LoadingContent";
import { useUser } from "@/hooks/useUser";
import { dismissAnnouncementModalAction } from "@/utils/actions/announcements";
import {
  getActiveAnnouncements,
  hasNewAnnouncements,
  type Announcement,
  type AnnouncementDetail,
} from "@/utils/announcements";

export function AnnouncementDialog() {
  const { data: user, mutate, isLoading, error } = useUser();
  const [isOpen, setIsOpen] = useState(true);

  const { execute: dismissModal } = useAction(dismissAnnouncementModalAction, {
    onSuccess: () => {
      mutate();
    },
  });

  const announcements = getActiveAnnouncements();
  const showAnnouncements =
    !!user && !isLoading && hasNewAnnouncements(user.announcementDismissedAt);

  // Prevent body scroll when modal is actually visible
  useEffect(() => {
    const shouldLockScroll =
      isOpen && announcements.length > 0 && showAnnouncements;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, announcements.length, showAnnouncements]);

  const handleCloseModal = useCallback(() => {
    if (announcements.length > 0) {
      dismissModal({ publishedAt: announcements[0].publishedAt });
    }
    setIsOpen(false);
  }, [dismissModal, announcements]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {announcements.length === 0 || !showAnnouncements ? null : (
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                onClick={handleCloseModal}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40"
              />

              {/* Modal */}
              <motion.div
                key="modal-container"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
                className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
              >
                <div className="pointer-events-auto relative">
                  {/* Close button - outside modal, diagonal top-right corner */}
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="absolute -right-9 -top-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                    <ScrollArea className="max-h-[600px] [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                      <div className="flex flex-col gap-4 p-4">
                        {announcements.map((announcement) => (
                          <AnnouncementCard
                            key={announcement.id}
                            announcement={announcement}
                            onClose={handleCloseModal}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </LoadingContent>
  );
}

export interface AnnouncementCardProps {
  announcement: Announcement;
  onClose?: () => void;
}

export function AnnouncementCard({
  announcement,
  onClose,
}: AnnouncementCardProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-800">
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {announcement.title}
          </h3>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {new Date(announcement.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* <div className="mb-4">
          <Image
            src={announcement.image}
            alt={announcement.title}
            width={400}
            height={176}
            className="h-44 w-full rounded-lg object-cover"
          />
        </div> */}

        {/* TODO: sizing / rounded */}
        {announcement.image && <div className="mb-4">{announcement.image}</div>}

        {announcement.details && announcement.details.length > 0 && (
          <div className="mb-4 space-y-3">
            {announcement.details.map((detail) => (
              <DetailItem key={detail.title} detail={detail} />
            ))}
          </div>
        )}

        <div className="flex gap-3">
          {announcement.link && (
            <Link
              href={announcement.link}
              onClick={() => onClose?.()}
              className="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              View
            </Link>
          )}
          {announcement.learnMoreLink && (
            <Link
              href={announcement.learnMoreLink}
              className="flex flex-1 items-center justify-center rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Learn more
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ detail }: { detail: AnnouncementDetail }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700">
        {detail.icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {detail.title}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {detail.description}
        </div>
      </div>
    </div>
  );
}
