"use client";

import { ArchiveIcon, Layers3Icon, BarChartBigIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboarding } from "@/components/OnboardingModal";

export function StatsOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Stats");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to email analytics</DialogTitle>
          <DialogDescription>
            Get insights from the depths of your email and clean it up it no
            time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <Card className="flex items-center">
            <BarChartBigIcon className="mr-3 h-5 w-5" />
            Visualise your data
          </Card>
          <Card className="flex items-center">
            <Layers3Icon className="mr-3 h-5 w-5" />
            Understand what{`'`}s filling up your inbox
          </Card>
          <Card className="flex items-center">
            <ArchiveIcon className="mr-3 h-5 w-5" />
            Unsubscribe and bulk archive
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
