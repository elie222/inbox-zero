"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/hooks/useUser";
import { dismissAnnouncementModalAction } from "@/utils/actions/announcements";
import {
  getActiveAnnouncements,
  hasNewAnnouncements,
  type Announcement,
} from "@/utils/announcements";

export function AnnouncementDialog() {
  const pathname = usePathname();
  const { data: user, mutate, isLoading } = useUser();
  const [isOpen, setIsOpen] = useState(true);

  const { execute: dismissModal } = useAction(dismissAnnouncementModalAction, {
    onSuccess: () => {
      mutate();
    },
  });

  const [announcement] = getActiveAnnouncements();
  const cutOffDate =
    user?.announcementDismissedAt ?? user?.createdAt ?? new Date();
  // Don't interrupt onboarding; the dialog shows on the next app page.
  const isOnboarding = pathname?.includes("/onboarding") ?? false;
  const showAnnouncement =
    !!announcement &&
    !!user &&
    !isLoading &&
    !isOnboarding &&
    hasNewAnnouncements(cutOffDate);

  const handleClose = useCallback(() => {
    if (announcement) dismissModal({ publishedAt: announcement.publishedAt });
    setIsOpen(false);
  }, [dismissModal, announcement]);

  if (!showAnnouncement) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-xl">
        <AnnouncementContent
          announcement={announcement}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AnnouncementContent({
  announcement,
  onClose,
}: {
  announcement: Announcement;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{announcement.title}</DialogTitle>
      </DialogHeader>

      {announcement.image}

      {announcement.details && announcement.details.length > 0 && (
        <ul className="space-y-2.5">
          {announcement.details.map((detail) => (
            <li key={detail.title} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground">
                {detail.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm">{detail.title}</div>
                {detail.description ? (
                  <div className="text-sm text-muted-foreground">
                    {detail.description}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {announcement.link && (
          <Button size="lg" asChild>
            <Link href={announcement.link} onClick={onClose}>
              {announcement.linkLabel ?? "View"}
            </Link>
          </Button>
        )}
        {announcement.secondaryLink && (
          <Button size="lg" variant="outline" asChild>
            <Link href={announcement.secondaryLink.href} target="_blank">
              {announcement.secondaryLink.label}
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}
