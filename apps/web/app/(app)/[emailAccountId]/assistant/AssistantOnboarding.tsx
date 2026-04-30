"use client";

import { useEffect, useRef } from "react";
import { useWindowSize } from "usehooks-ts";
import { useOnboarding } from "@/components/OnboardingModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CardBasic } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListChecksIcon, ReplyIcon, SlidersIcon } from "lucide-react";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { useVideoAnalytics } from "@/hooks/useVideoAnalytics";

const ASSISTANT_ONBOARDING_VIDEO_ID = "AQtB0j6Zmt0";

export function AssistantOnboarding({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Automation");
  const hasTrackedView = useRef(false);
  const videoAnalytics = useVideoAnalytics({
    page: "automation",
    surface: "onboarding_modal",
    title: "Welcome to your AI Personal Assistant",
    youtubeVideoId: ASSISTANT_ONBOARDING_VIDEO_ID,
  });

  const { width } = useWindowSize();

  const videoWidth = Math.min(width * 0.75, 800);
  const videoHeight = videoWidth * (675 / 1200);

  useEffect(() => {
    if (!isOpen || hasTrackedView.current) return;

    hasTrackedView.current = true;
    videoAnalytics.trackViewed();
  }, [isOpen, videoAnalytics]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="min-w-[350px] sm:min-w-[600px] md:min-w-[750px] lg:min-w-[880px]">
        <DialogHeader>
          <DialogTitle>Welcome to your AI Personal Assistant</DialogTitle>
          <DialogDescription>
            Your personal assistant helps manage your inbox by following your
            instructions and automating routine tasks.
          </DialogDescription>
        </DialogHeader>

        <YouTubeVideo
          videoId={ASSISTANT_ONBOARDING_VIDEO_ID}
          iframeClassName="mx-auto"
          onVideoCompleted={videoAnalytics.trackCompleted}
          onVideoProgress={videoAnalytics.trackProgress}
          onVideoStarted={videoAnalytics.trackStarted}
          opts={{
            height: `${videoHeight}`,
            width: `${videoWidth}`,
          }}
        />

        <div className="grid gap-2 text-sm">
          <CardBasic className="flex items-center">
            <ListChecksIcon className="mr-3 size-5" />
            Create rules to handle different types of emails
          </CardBasic>
          <CardBasic className="flex items-center">
            <ReplyIcon className="mr-3 size-5" />
            Automate responses and actions
          </CardBasic>
          <CardBasic className="flex items-center">
            <SlidersIcon className="mr-3 size-5" />
            Refine your assistant's behavior over time
          </CardBasic>
        </div>
        <div>
          <Button
            className="w-full"
            onClick={() => {
              onComplete?.();
              onClose();
            }}
          >
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
