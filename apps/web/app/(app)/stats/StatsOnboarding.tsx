"use client";

import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { ArchiveIcon, Layers3Icon, BarChartBigIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function StatsOnboarding() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const [viewedStatsOnboarding, setViewedStatsOnboarding] = useLocalStorage(
    "viewedStatsOnboarding",
    false
  );

  useEffect(() => {
    if (!viewedStatsOnboarding) {
      setIsOpen(true);
      setViewedStatsOnboarding(true);
    }
  }, [setViewedStatsOnboarding, viewedStatsOnboarding]);

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

        <div className="grid gap-4">
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
          <Button
            full
            size="xl"
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
