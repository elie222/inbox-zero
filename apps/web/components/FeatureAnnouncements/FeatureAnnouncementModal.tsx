"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  Clock,
  Tag,
  FileEdit,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "next-safe-action/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { dismissAnnouncementAction } from "@/utils/actions/announcements";
import type { Announcement, AnnouncementDetail } from "@/utils/announcements";
import { FollowUpIllustration } from "./AnnouncementImages/FollowUpIllustration";
import { SmartCategoriesIllustration } from "./AnnouncementImages/SmartCategoriesIllustration";
import { BulkUnsubscribeIllustration } from "./AnnouncementImages/BulkUnsubscribeIllustration";
import { EmailAnalyticsIllustration } from "./AnnouncementImages/EmailAnalyticsIllustration";
import { ColdEmailBlockerIllustration } from "./AnnouncementImages/ColdEmailBlockerIllustration";
import { KeyboardShortcutsIllustration } from "./AnnouncementImages/KeyboardShortcutsIllustration";

export function FeatureAnnouncementModal() {
  const { data, mutate, isLoading } = useAnnouncements();
  const [isOpen, setIsOpen] = useState(true);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const { execute: dismiss } = useAction(dismissAnnouncementAction, {
    onSuccess: () => {
      mutate();
      setDismissingId(null);
    },
    onError: () => {
      setDismissingId(null);
    },
  });

  if (isLoading || !data) return null;

  const { announcements } = data;

  if (announcements.length === 0) return null;

  const handleDismiss = (announcementId: string) => {
    setDismissingId(announcementId);
    dismiss({ announcementId });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            onClick={() => setIsOpen(false)}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative">
              {/* Close button - outside modal, diagonal top-right corner */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute -right-9 -top-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                <ScrollArea className="h-[600px]">
                  <div className="p-4">
                    <div className="flex flex-col gap-4">
                      {announcements.map((announcement) => (
                        <AnnouncementCard
                          key={announcement.id}
                          announcement={announcement}
                          onDismiss={() => handleDismiss(announcement.id)}
                          isDismissing={dismissingId === announcement.id}
                        />
                      ))}
                    </div>
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

interface AnnouncementCardProps {
  announcement: Announcement;
  onDismiss: () => void;
  isDismissing: boolean;
}

function AnnouncementCard({
  announcement,
  onDismiss,
  isDismissing,
}: AnnouncementCardProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-800">
      <div className="p-5">
        {/* Title with date badge */}
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

        {/* Banner */}
        <div className="mb-4">
          <AnnouncementBanner announcementId={announcement.id} />
        </div>

        {/* Feature details */}
        {announcement.details && announcement.details.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {announcement.details.map((detail, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700">
                  <DetailIcon icon={detail.icon} />
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
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isDismissing}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDismissing ? (
              <>
                <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />
                Enabling...
              </>
            ) : (
              "Enable"
            )}
          </button>
          {announcement.link && (
            <Link
              href={announcement.link}
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

function DetailIcon({ icon }: { icon: AnnouncementDetail["icon"] }) {
  const iconClass = "h-3.5 w-3.5 text-gray-500 dark:text-gray-400";

  switch (icon) {
    case "clock":
      return <Clock className={iconClass} />;
    case "tag":
      return <Tag className={iconClass} />;
    case "file-edit":
      return <FileEdit className={iconClass} />;
    default:
      return <CheckCircle2 className={iconClass} />;
  }
}

function AnnouncementBanner({ announcementId }: { announcementId: string }) {
  switch (announcementId) {
    case "follow-up-tracking-2025-01":
      return <FollowUpIllustration />;
    case "smart-categories-2025-01":
      return <SmartCategoriesIllustration />;
    case "bulk-unsubscribe-2025-01":
      return <BulkUnsubscribeIllustration />;
    case "email-analytics-2025-01":
      return <EmailAnalyticsIllustration />;
    case "cold-email-blocker-2025-01":
      return <ColdEmailBlockerIllustration />;
    case "keyboard-shortcuts-2025-01":
      return <KeyboardShortcutsIllustration />;
    default:
      // Default gradient banner for any new announcements
      return (
        <div className="flex h-44 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
          <Sparkles className="h-10 w-10 text-white/90" />
        </div>
      );
  }
}
