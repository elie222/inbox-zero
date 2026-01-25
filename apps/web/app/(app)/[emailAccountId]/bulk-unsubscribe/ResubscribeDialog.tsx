"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setNewsletterStatusAction } from "@/utils/actions/unsubscriber";

interface ResubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderName: string;
  newsletterEmail: string;
  emailAccountId: string;
  mutate: () => Promise<void>;
}

export function ResubscribeDialog({
  open,
  onOpenChange,
  senderName,
  newsletterEmail,
  emailAccountId,
  mutate,
}: ResubscribeDialogProps) {
  const [unblockComplete, setUnblockComplete] = useState(false);
  const [unblockLoading, setUnblockLoading] = useState(false);
  const [doneLoading, setDoneLoading] = useState(false);

  // Unblock without calling mutate - we'll refresh when dialog closes
  const handleUnblock = async () => {
    setUnblockLoading(true);
    try {
      await setNewsletterStatusAction(emailAccountId, {
        newsletterEmail,
        status: null,
      });
      setUnblockComplete(true);
    } finally {
      setUnblockLoading(false);
    }
  };

  const handleDialogClose = (dialogOpen: boolean) => {
    if (!dialogOpen && !doneLoading) {
      onOpenChange(false);
      setUnblockComplete(false);
      setDoneLoading(false);
      mutate();
    }
  };

  const handleDone = async () => {
    setDoneLoading(true);
    try {
      await mutate();
    } finally {
      onOpenChange(false);
      setUnblockComplete(false);
      setDoneLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resubscribe to "{senderName}"</DialogTitle>
          <DialogDescription className="pt-2">
            Follow the steps below to receive emails from this sender again.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border">
          {/* Step 1 */}
          <div className="flex gap-4 p-4">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium">
              {unblockComplete ? (
                <CheckIcon className="size-4 text-green-600" />
              ) : (
                "1"
              )}
            </div>
            <div className="flex flex-1 items-center justify-between gap-4">
              <div>
                <div className="font-medium">Unblock Sender</div>
                <p className="text-sm text-muted-foreground">
                  We're currently auto-archiving this sender. Click "Unblock" to
                  allow emails from them.
                </p>
              </div>
              {unblockComplete ? (
                <p className="shrink-0 text-sm font-medium text-green-600">
                  Unblocked
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleUnblock}
                  disabled={unblockLoading}
                >
                  {unblockLoading && <ButtonLoader />}
                  Unblock
                </Button>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="border-t" />

          {/* Step 2 */}
          <div className="flex gap-4 p-4">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium">
              {doneLoading ? (
                <CheckIcon className="size-4 text-green-600" />
              ) : (
                "2"
              )}
            </div>
            <div>
              <div className="font-medium">Manually Resubscribe</div>
              <p className="text-sm text-muted-foreground">
                Visit the sender's website and manually resubscribe.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleDialogClose(false)}
            disabled={doneLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDone}
            disabled={!unblockComplete || doneLoading}
          >
            {doneLoading && <ButtonLoader />}
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
