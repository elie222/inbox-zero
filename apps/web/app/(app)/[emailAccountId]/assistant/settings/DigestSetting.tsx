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
import { DigestSettingsForm } from "@/app/(app)/[emailAccountId]/settings/DigestSettingsForm";

export function DigestSetting() {
  return (
    <SettingCard
      title="Digest"
      description="Configure your summary digest emails."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Digest Settings</DialogTitle>
              <DialogDescription>
                Configure when your digest emails are sent and which rules are
                included.
              </DialogDescription>
            </DialogHeader>

            <DigestSettingsForm />
          </DialogContent>
        </Dialog>
      }
    />
  );
}
