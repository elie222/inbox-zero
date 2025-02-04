"use client";

import { useWindowSize } from "usehooks-ts";
import { useOnboarding } from "@/components/OnboardingModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { ListChecksIcon, ReplyIcon, SlidersIcon } from "lucide-react";
import { YouTubeVideo } from "@/components/YouTubeVideo";

export function AutomationOnboarding({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Automation");

  const { width } = useWindowSize();

  const videoWidth = Math.min(width * 0.75, 800);
  const videoHeight = videoWidth * (675 / 1200);

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
          videoId="AQtB0j6Zmt0"
          iframeClassName="mx-auto"
          opts={{
            height: `${videoHeight}`,
            width: `${videoWidth}`,
          }}
        />

        <div className="grid gap-2 text-sm">
          <Card className="flex items-center">
            <ListChecksIcon className="mr-3 size-5" />
            Create rules to handle different types of emails
          </Card>
          <Card className="flex items-center">
            <ReplyIcon className="mr-3 size-5" />
            Automate responses and actions
          </Card>
          <Card className="flex items-center">
            <SlidersIcon className="mr-3 size-5" />
            Refine your assistant's behavior over time
          </Card>
        </div>
        <div>
          <Button
            className="w-full"
            onClick={() => {
              onComplete();
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
