"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "next-safe-action/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { dismissAnnouncementModalAction } from "@/utils/actions/announcements";
import { toggleFollowUpRemindersAction } from "@/utils/actions/follow-up-reminders";
import { setAutoCategorizeAction } from "@/utils/actions/categorize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { ANNOUNCEMENTS } from "@/utils/announcements";
import type { GetAnnouncementsResponse } from "@/app/api/user/announcements/route";

function getIconForDetail(announcementId: string, detailIndex: number) {
  const announcement = ANNOUNCEMENTS.find((a) => a.id === announcementId);
  return announcement?.details?.[detailIndex]?.icon ?? CheckCircle2;
}

export function AnnouncementDialog() {
  const { data, mutate, isLoading } = useAnnouncements();
  const { emailAccountId } = useAccount();
  const [isOpen, setIsOpen] = useState(true);
  const [enablingId, setEnablingId] = useState<string | null>(null);

  const { execute: dismissModal } = useAction(dismissAnnouncementModalAction, {
    onSuccess: () => {
      mutate();
    },
  });

  const { execute: toggleFollowUp } = useAction(
    toggleFollowUpRemindersAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        setEnablingId(null);
      },
      onError: () => {
        setEnablingId(null);
      },
    },
  );

  const { execute: setAutoCategorize } = useAction(
    setAutoCategorizeAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        setEnablingId(null);
      },
      onError: () => {
        setEnablingId(null);
      },
    },
  );

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleCloseModal = useCallback(() => {
    const announcements = data?.announcements;
    if (announcements && announcements.length > 0) {
      dismissModal({ publishedAt: announcements[0].publishedAt });
    }
    setIsOpen(false);
  }, [dismissModal, data?.announcements]);

  const handleEnable = useCallback(
    (announcementId: string) => {
      setEnablingId(announcementId);

      if (announcementId.startsWith("follow-up-tracking")) {
        toggleFollowUp({ enabled: true });
      } else if (announcementId.startsWith("smart-categories")) {
        setAutoCategorize({ autoCategorizeSenders: true });
      }
    },
    [toggleFollowUp, setAutoCategorize],
  );

  if (isLoading || !data) return null;

  const { announcements, hasNewAnnouncements } = data;

  if (announcements.length === 0 || !hasNewAnnouncements) return null;

  return (
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
                        onEnable={() => handleEnable(announcement.id)}
                        isEnabling={enablingId === announcement.id}
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
  );
}

type AnnouncementWithEnabled =
  GetAnnouncementsResponse["announcements"][number];

interface AnnouncementCardProps {
  announcement: AnnouncementWithEnabled;
  onEnable: () => void;
  isEnabling: boolean;
}

function AnnouncementCard({
  announcement,
  onEnable,
  isEnabling,
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
              const Icon = getIconForDetail(announcement.id, index);

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
          {announcement.actionType === "enable" &&
            (announcement.isEnabled ? (
              <div className="flex flex-1 items-center justify-center rounded-lg bg-green-100 px-4 py-2.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Enabled
              </div>
            ) : (
              <button
                type="button"
                onClick={onEnable}
                disabled={isEnabling}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnabling ? (
                  <>
                    <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  "Enable"
                )}
              </button>
            ))}
          {announcement.actionType === "view" && announcement.link && (
            <Link
              href={announcement.link}
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
