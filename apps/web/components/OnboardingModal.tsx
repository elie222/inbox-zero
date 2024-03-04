"use client";

import { PlayIcon } from "lucide-react";
import { useModal } from "@/components/Modal";
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
}: {
  title: string;
  description: React.ReactNode;
  videoId: string;
}) {
  const { isModalOpen, openModal, setIsModalOpen } = useModal();

  return (
    <>
      <Button onClick={openModal} size="sm">
        <PlayIcon className="mr-2 h-4 w-4" />
        Watch Video
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="lg:min-w-[880px] xl:min-w-[1280px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <YouTubeVideo
            videoId={videoId}
            iframeClassName="mx-auto"
            opts={{
              height: "675",
              width: "1200",
              playerVars: {
                // https://developers.google.com/youtube/player_parameters
                autoplay: 1,
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
