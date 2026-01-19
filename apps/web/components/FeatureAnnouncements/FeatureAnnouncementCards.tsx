"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CheckCircle2Icon } from "lucide-react";
import { CardGreen } from "@/components/ui/card";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { dismissAnnouncementAction } from "@/utils/actions/announcements";
import { FeatureAnnouncementCard } from "@/components/FeatureAnnouncements/FeatureAnnouncementCard";
import { cn } from "@/utils";

interface FeatureAnnouncementCardsProps {
  isCollapsed?: boolean;
}

export function FeatureAnnouncementCards({
  isCollapsed = false,
}: FeatureAnnouncementCardsProps) {
  const { data, mutate, isLoading } = useAnnouncements();
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

  const { announcements, dismissedCount } = data;

  // Don't show when collapsed
  if (isCollapsed) return null;

  // Show "all caught up" message if user has dismissed at least one announcement
  // and there are no more announcements to show
  if (announcements.length === 0 && dismissedCount > 0) {
    return (
      <div className="px-3 pt-4">
        <CardGreen>
          <div className="p-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2Icon className="h-4 w-4" />
            <span>You're all caught up!</span>
          </div>
        </CardGreen>
      </div>
    );
  }

  if (announcements.length === 0) return null;

  const handleDismiss = (announcementId: string) => {
    setDismissingId(announcementId);
    dismiss({ announcementId });
  };

  // Show up to 3 stacked cards
  const visibleAnnouncements = announcements.slice(0, 3);

  return (
    <div className="px-3 pt-4">
      <div className="relative">
        {/* Stacked cards */}
        {visibleAnnouncements.map((announcement, index) => (
          <div
            key={announcement.id}
            className={cn(
              "transition-all duration-200",
              index > 0 && "absolute inset-x-0 top-0",
            )}
            style={{
              zIndex: 10 - index,
              transform:
                index > 0
                  ? `translateY(${index * 4}px) scale(${1 - index * 0.02})`
                  : undefined,
              opacity: index === 0 ? 1 : 0.6 - index * 0.2,
            }}
          >
            <FeatureAnnouncementCard
              announcement={announcement}
              onDismiss={() => handleDismiss(announcement.id)}
              isActive={index === 0}
              isDismissing={dismissingId === announcement.id}
            />
          </div>
        ))}
      </div>

      {/* Counter for remaining announcements */}
      {announcements.length > 1 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {announcements.length} updates
        </p>
      )}
    </div>
  );
}
