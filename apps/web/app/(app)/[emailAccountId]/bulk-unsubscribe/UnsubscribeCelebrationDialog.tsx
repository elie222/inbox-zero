"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import Confetti from "react-dom-confetti";
import { usePostHog } from "posthog-js/react";
import { CopyIcon } from "lucide-react";
import { LinkedinIcon, TwitterIcon } from "@/components/BrandIcons";
import type { DateRange } from "react-day-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import type { GetReferralCodeResponse } from "@/app/api/referrals/code/route";
import { generateReferralLink } from "@/utils/referral/referral-link";
import {
  buildCelebrationSubline,
  buildLinkedInShareUrl,
  buildXShareUrl,
  DEFAULT_SHARE_LINK,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/share";

export type UnsubscribeCelebration = {
  senderCount: number;
  emailCount: number;
};

export function UnsubscribeCelebrationDialog({
  celebration,
  dateRange,
  onClose,
}: {
  celebration: UnsubscribeCelebration | null;
  dateRange?: DateRange;
  onClose: () => void;
}) {
  const posthog = usePostHog();
  const [confettiActive, setConfettiActive] = useState(false);

  const { data: codeData } = useSWR<GetReferralCodeResponse>(
    celebration ? "/api/referrals/code" : null,
  );
  const link = codeData?.code
    ? generateReferralLink(codeData.code)
    : DEFAULT_SHARE_LINK;

  useEffect(() => {
    if (!celebration) {
      setConfettiActive(false);
      return;
    }
    setConfettiActive(true);
    posthog?.capture("Bulk Unsubscribe Celebration Shown", {
      senderCount: celebration.senderCount,
      emailCount: celebration.emailCount,
    });
  }, [celebration, posthog]);

  if (!celebration) return null;

  const { senderCount, emailCount } = celebration;
  const shareParams = { senderCount, link };

  const onShare = (platform: "x" | "linkedin") => {
    posthog?.capture("Clicked Share Unsubscribe Celebration", { platform });
    const url =
      platform === "x"
        ? buildXShareUrl(shareParams)
        : buildLinkedInShareUrl(shareParams);
    window.open(url, "_blank", "noopener,noreferrer,width=550,height=420");
  };

  const onCopyLink = async () => {
    posthog?.capture("Clicked Share Unsubscribe Celebration", {
      platform: "copy_link",
    });
    try {
      await navigator.clipboard.writeText(link);
      toastSuccess({ description: "Link copied to clipboard!" });
    } catch {
      toastError({
        title: "Failed to copy link",
        description: "Please try again",
      });
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            You silenced {senderCount}{" "}
            {senderCount === 1 ? "sender" : "senders"}
          </DialogTitle>
          {emailCount > 0 && (
            <DialogDescription>
              {buildCelebrationSubline({ emailCount, dateRange })}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex justify-center">
          <Confetti
            active={confettiActive}
            config={{ duration: 2500, elementCount: 100, spread: 90 }}
          />
        </div>

        <Image
          src={`/api/og/unsubscribed?count=${senderCount}`}
          width={1200}
          height={630}
          alt={`${senderCount} email ${senderCount === 1 ? "list" : "lists"} unsubscribed with Inbox Zero`}
          unoptimized
          className="w-full rounded-lg border"
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onShare("x")}
          >
            <TwitterIcon className="mr-2 size-4" />
            Share on X
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onShare("linkedin")}
          >
            <LinkedinIcon className="mr-2 size-4" />
            Share on LinkedIn
          </Button>
          <Button variant="outline" className="flex-1" onClick={onCopyLink}>
            <CopyIcon className="mr-2 size-4" />
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
