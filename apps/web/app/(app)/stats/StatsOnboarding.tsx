"use client";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import { ArchiveIcon, Layers3Icon } from "lucide-react";
import { useEffect, useState } from "react";

export function StatsOnboarding() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  // to fix hydration mismatch
  useEffect(() => setIsOpen(true), []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to email analytics</DialogTitle>
          <DialogDescription>
            <p>
              Get insights from the depths of your email and clean it up it no
              time.
            </p>
            <div className="mt-4 grid gap-4">
              <Card className="flex items-center">
                <ChartBarIcon className="mr-3 h-5 w-5" />
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
            <div className="mt-4">
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
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
