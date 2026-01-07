"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);

  return (
    <SettingCard
      title="Personal Instructions"
      description="Tell the AI about yourself and how you'd like it to handle your emails."
      right={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Personal Instructions</DialogTitle>
              <DialogDescription>
                Tell the AI about yourself and how you'd like it to handle your
                emails.
              </DialogDescription>
            </DialogHeader>

            <AboutSection onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      }
    />
  );
}
