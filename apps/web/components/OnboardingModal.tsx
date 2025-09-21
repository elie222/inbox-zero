"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { PlayIcon } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { MuxVideo } from "@/components/MuxVideo";
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
}: {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
}) {
  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <OnboardingDialogContent
        title={title}
        description={description}
        youtubeVideoId={youtubeVideoId}
        muxPlaybackId={muxPlaybackId}
      />
    </Dialog>
  );
}

export function OnboardingDialogContent({
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
}: {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
}) {
  const { width } = useWindowSize();

  const videoWidth = Math.min(width * 0.75, 1200);
  const videoHeight = videoWidth * (675 / 1200);

  return (
    <DialogContent className="max-w-6xl border-0 bg-transparent p-0 overflow-hidden">
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {muxPlaybackId ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <MuxVideo
            playbackId={muxPlaybackId}
            title={`Onboarding video - ${title}`}
            className="size-full"
          />
        </div>
      ) : youtubeVideoId ? (
        <div className="bg-background rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <YouTubeVideo
            videoId={youtubeVideoId}
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
        </div>
      ) : null}
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
