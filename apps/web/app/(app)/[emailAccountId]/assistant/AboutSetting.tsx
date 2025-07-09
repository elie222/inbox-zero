"use client";

import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AboutSection } from "@/app/(app)/[emailAccountId]/settings/AboutSectionForm";

export function AboutSetting() {
  return (
    <SettingCard
      title="About you"
      description="Provide extra information that will help our AI better understand how to process your emails."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>About you</DialogTitle>
              <DialogDescription>
                Provide extra information that will help our AI better
                understand how to process your emails.
              </DialogDescription>
            </DialogHeader>

            <AboutSection />
          </DialogContent>
        </Dialog>
      }
    />
  );
}
