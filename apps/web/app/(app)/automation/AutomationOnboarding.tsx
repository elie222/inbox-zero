"use client";

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

export function AutomationOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Automation");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to your AI Personal Assistant</DialogTitle>
          <DialogDescription>
            Your personal assistant helps manage your inbox by following your
            custom instructions and automating routine email tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <Card className="flex items-center">
            <ListChecksIcon className="mr-3 h-5 w-5" />
            Create custom rules to handle different types of emails
          </Card>
          <Card className="flex items-center">
            <ReplyIcon className="mr-3 h-5 w-5" />
            Automate responses and actions based on your preferences
          </Card>
          <Card className="flex items-center">
            <SlidersIcon className="mr-3 h-5 w-5" />
            Refine your assistant's behavior over time
          </Card>
        </div>
        <div>
          <Button className="w-full" onClick={onClose}>
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
