"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { PlayIcon } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function OnboardingModal({
  title,
  description,
  videoId,
  buttonProps,
}: {
  title: string;
  description: React.ReactNode;
  videoId: string;
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
        videoId={videoId}
      />
    </>
  );
}

export function OnboardingModalDialog({
  isModalOpen,
  setIsModalOpen,
  title,
  description,
  videoId,
}: {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  videoId: string;
}) {
  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <OnboardingDialogContent
        title={title}
        description={description}
        videoId={videoId}
      />
    </Dialog>
  );
}

export function OnboardingDialogContent({
  title,
  description,
  videoId,
}: {
  title: string;
  description: React.ReactNode;
  videoId: string;
}) {
  const { width } = useWindowSize();

  const videoWidth = Math.min(width * 0.75, 1200);
  const videoHeight = videoWidth * (675 / 1200);

  return (
    <DialogContent className="min-w-[350px] sm:min-w-[600px] md:min-w-[750px] lg:min-w-[880px] xl:min-w-[1280px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <YouTubeVideo
        videoId={videoId}
        title={`Onboarding video - ${title}`}
        iframeClassName="mx-auto"
        opts={{
          height: `${videoHeight}`,
          width: `${videoWidth}`,
          playerVars: {
            // https://developers.google.com/youtube/player_parameters
            autoplay: 1,
          },
        }}
      />
    </DialogContent>
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
