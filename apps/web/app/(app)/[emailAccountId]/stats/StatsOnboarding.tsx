"use client";

import { ArchiveIcon, Layers3Icon, BarChartBigIcon } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboarding } from "@/components/OnboardingModal";
import { CardBasic } from "@/components/ui/card";

export function StatsOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Stats");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Welcome to email analytics</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Get insights from the depths of your email and clean it up it no
              time.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <CardBasic className="flex items-center">
            <BarChartBigIcon className="mr-3 h-5 w-5" />
            <Trans>Visualise your data</Trans>
          </CardBasic>
          <CardBasic className="flex items-center">
            <Layers3Icon className="mr-3 h-5 w-5" />
            <Trans>Understand what's filling up your inbox</Trans>
          </CardBasic>
          <CardBasic className="flex items-center">
            <ArchiveIcon className="mr-3 h-5 w-5" />
            <Trans>Unsubscribe and bulk archive</Trans>
          </CardBasic>
        </div>
        <div>
          <Button className="w-full" onClick={onClose}>
            <Trans>Get Started</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
