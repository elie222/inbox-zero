"use client";

import { useState, useEffect, useCallback } from "react";
import { X, CheckCircle2, Tag, FileEdit, type LucideIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "next-safe-action/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingContent } from "@/components/LoadingContent";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { dismissAnnouncementModalAction } from "@/utils/actions/announcements";
import type { GetAnnouncementsResponse } from "@/app/api/user/announcements/route";

const ICON_MAP: Record<string, LucideIcon> = {
  Tag,
  FileEdit,
};

function getIconForDetail(iconId: string | undefined): LucideIcon {
  return (iconId && ICON_MAP[iconId]) || CheckCircle2;
}

export function AnnouncementDialog() {
  const { data, mutate, isLoading, error } = useAnnouncements();
  const [isOpen, setIsOpen] = useState(true);

  const { execute: dismissModal } = useAction(dismissAnnouncementModalAction, {
    onSuccess: () => {
      mutate();
    },
  });

  const announcements = data?.announcements ?? [];
  const hasNewAnnouncements = data?.hasNewAnnouncements ?? false;

  // Prevent body scroll when modal is actually visible
  useEffect(() => {
    const shouldLockScroll =
      isOpen && announcements.length > 0 && hasNewAnnouncements;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, announcements.length, hasNewAnnouncements]);

  const handleCloseModal = useCallback(() => {
    const announcements = data?.announcements;
    if (announcements && announcements.length > 0) {
      dismissModal({ publishedAt: announcements[0].publishedAt });
    }
    setIsOpen(false);
  }, [dismissModal, data?.announcements]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {announcements.length === 0 || !hasNewAnnouncements ? null : (
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

type AnnouncementData = GetAnnouncementsResponse["announcements"][number];

interface AnnouncementCardProps {
  announcement: AnnouncementData;
  onClose: () => void;
}

function AnnouncementCard({ announcement, onClose }: AnnouncementCardProps) {
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

        <div className="mb-4">
          <Image
            src={announcement.image}
            alt={announcement.title}
            width={400}
            height={176}
            className="h-44 w-full rounded-lg object-cover"
          />
        </div>

        {announcement.details && announcement.details.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {announcement.details.map((detail, index) => {
              const Icon = getIconForDetail(detail.icon);

              return (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700">
                    <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {detail.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {detail.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-3">
          {announcement.link && (
            <Link
              href={announcement.link}
              onClick={onClose}
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
