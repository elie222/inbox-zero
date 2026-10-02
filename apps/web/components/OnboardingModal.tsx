"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { PlayIcon } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { VideoPlayerDialog } from "@/components/VideoPlayerDialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function OnboardingModal({
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
  buttonProps,
}: {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
  buttonProps?: React.ComponentProps<typeof Button>;
}) {
  const { isModalOpen, openModal, setIsModalOpen } = useModal();

  return (
    <>
      <Button onClick={openModal} className="text-nowrap" {...buttonProps}>
        <PlayIcon className="mr-2 h-4 w-4" />
        Watch demo
      </Button>

      <OnboardingModalDialog
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        title={title}
        description={description}
        youtubeVideoId={youtubeVideoId}
        muxPlaybackId={muxPlaybackId}
      />
    </>
  );
}

export function OnboardingModalDialog({
  isModalOpen,
  setIsModalOpen,
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
  onVideoCompleted,
  onVideoProgress,
  onVideoStarted,
}: {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
  onVideoCompleted?: () => void;
  onVideoProgress?: (progressPercent: number) => void;
  onVideoStarted?: () => void;
}) {
  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <VideoPlayerDialog
        title={title}
        description={description}
        youtubeVideoId={youtubeVideoId}
        muxPlaybackId={muxPlaybackId}
        onVideoCompleted={onVideoCompleted}
        onVideoProgress={onVideoProgress}
        onVideoStarted={onVideoStarted}
      />
    </Dialog>
  );
}

export const useOnboarding = (feature: string) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [hasViewedOnboarding, setHasViewedOnboarding] = useLocalStorage(
    `viewed${feature}Onboarding`,
    false,
  );

  useEffect(() => {
    if (!hasViewedOnboarding) {
      setIsOpen(true);
      setHasViewedOnboarding(true);
    }
  }, [setHasViewedOnboarding, hasViewedOnboarding]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    hasViewedOnboarding,
    setIsOpen,
    onClose,
  };
};
