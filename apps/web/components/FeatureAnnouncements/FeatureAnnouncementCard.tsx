"use client";

import { XIcon, SparklesIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { CardBlue } from "@/components/ui/card";
import { cn } from "@/utils";
import type { Announcement } from "@/utils/announcements";

interface FeatureAnnouncementCardProps {
  announcement: Announcement;
  onDismiss: () => void;
  isActive: boolean;
  isDismissing: boolean;
}

export function FeatureAnnouncementCard({
  announcement,
  onDismiss,
  isActive,
  isDismissing,
}: FeatureAnnouncementCardProps) {
  return (
    <CardBlue
      className={cn(
        "transition-all duration-200",
        !isActive && "pointer-events-none",
        isDismissing && "opacity-50",
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <SparklesIcon className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 leading-tight">
              {announcement.title}
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1 line-clamp-2">
              {announcement.description}
            </p>
          </div>

          {isActive && (
            <button
              type="button"
              className="flex-shrink-0 rounded p-1 text-blue-600 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors dark:text-blue-400 dark:hover:bg-blue-900/20 dark:focus:ring-blue-700"
              onClick={onDismiss}
              aria-label="Dismiss announcement"
              disabled={isDismissing}
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        {announcement.link && isActive && (
          <Link
            href={announcement.link}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Learn more
            <ChevronRightIcon className="h-3 w-3" />
          </Link>
        )}
      </div>
    </CardBlue>
  );
}
