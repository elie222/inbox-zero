"use client";

import { useState } from "react";
import Image from "next/image";
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
import {
  ExampleDialog,
  SeeExampleDialogButton,
} from "@/app/(app)/[emailAccountId]/assistant/onboarding/ExampleDialog";
import { DigestSettingsForm } from "@/app/(app)/[emailAccountId]/settings/DigestSettingsForm";

export function DigestSetting() {
  const [showExampleDialog, setShowExampleDialog] = useState(false);

  return (
    <>
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

      <ExampleDialog
        open={showExampleDialog}
        onOpenChange={setShowExampleDialog}
        title="Digest Email Example"
        description="This is an example of what your digest email will look like."
        image={
          <Image
            src="/images/assistant/digest.png"
            alt="Digest Email Example"
            width={672}
            height={1200}
            className="mx-auto max-w-2xl rounded border-4 border-blue-50 shadow-sm"
          />
        }
      />
    </>
  );
}
