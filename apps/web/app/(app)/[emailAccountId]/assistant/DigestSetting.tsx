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
import { useDigestEnabled } from "@/hooks/useFeatureFlags";
import { DigestScheduleForm } from "@/app/(app)/[emailAccountId]/settings/DigestScheduleForm";
import {
  ExampleDialog,
  SeeExampleDialogButton,
} from "@/app/(app)/[emailAccountId]/assistant/onboarding/ExampleDialog";
import { DigestItemsForm } from "@/app/(app)/[emailAccountId]/settings/DigestItemsForm";

export function DigestSetting() {
  const enabled = useDigestEnabled();
  const [showExampleDialog, setShowExampleDialog] = useState(false);

  if (!enabled) return null;

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
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Digest Settings</DialogTitle>
                <DialogDescription>
                  Configure when your digest emails are sent and which rules are
                  included.{" "}
                  <SeeExampleDialogButton
                    onClick={() => setShowExampleDialog(true)}
                  />
                </DialogDescription>
              </DialogHeader>

              <DigestItemsForm />
              <DigestScheduleForm />
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
