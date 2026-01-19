"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  CheckIcon,
  EyeIcon,
  MailMinusIcon,
  MailXIcon,
  ThumbsUpIcon,
} from "lucide-react";
import {
  useUnsubscribe,
  useApproveButton,
  useBulkArchive,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";

export function BulkUnsubscribeMobile({
  tableRows,
}: {
  tableRows?: React.ReactNode;
}) {
  return <div className="mx-2 mt-2 grid gap-2">{tableRows}</div>;
}

export function BulkUnsubscribeRowMobile({
  item,
  refetchPremium,
  mutate,
  hasUnsubscribeAccess,
  onOpenNewsletter,
  readPercentage,
  archivedPercentage,
  emailAccountId,
  filter,
}: RowProps) {
  const [resubscribeDialogOpen, setResubscribeDialogOpen] = useState(false);
  const [unblockComplete, setUnblockComplete] = useState(false);

  const name = item.fromName || extractNameFromEmail(item.name);
  const email = extractEmailAddress(item.name);

  const posthog = usePostHog();

  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
    emailAccountId,
    filter,
  });
  const { unsubscribeLoading, onUnsubscribe, unsubscribeLink } = useUnsubscribe(
    {
      item,
      hasUnsubscribeAccess,
      mutate,
      refetchPremium,
      posthog,
      emailAccountId,
    },
  );
  const { onBulkArchive, isBulkArchiving } = useBulkArchive({
    mutate,
    posthog,
    emailAccountId,
  });
  const hasUnsubscribeLink = unsubscribeLink !== "#";
  const isUnsubscribed = item.status === NewsletterStatus.UNSUBSCRIBED;

  const handleUnblock = async () => {
    await onUnsubscribe();
    setUnblockComplete(true);
  };

  const handleDialogClose = (open: boolean) => {
    setResubscribeDialogOpen(open);
    if (!open) {
      setUnblockComplete(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="truncate">{name}</CardTitle>
        <CardDescription className="truncate">{email}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-nowrap">
          <Badge variant="outline" className="justify-center">
            {item.value} emails
          </Badge>
          <Badge variant="outline" className="justify-center">
            {readPercentage.toFixed(0)}% read
          </Badge>
          <Badge variant="outline" className="justify-center">
            {archivedPercentage.toFixed(0)}% archived
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {isUnsubscribed ? (
            <Badge variant="red" className="justify-center gap-1">
              <MailXIcon className="size-3" />
              Unsubscribed
            </Badge>
          ) : (
            <Button
              size="sm"
              variant={
                item.status === NewsletterStatus.APPROVED ? "green" : "ghost"
              }
              onClick={onApprove}
              disabled={!hasUnsubscribeAccess}
            >
              {approveLoading ? (
                <ButtonLoader />
              ) : (
                <ThumbsUpIcon className="size-4" />
              )}
            </Button>
          )}

          {isUnsubscribed ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResubscribeDialogOpen(true)}
            >
              <span className="flex items-center gap-1.5">
                {unsubscribeLoading ? (
                  <ButtonLoader />
                ) : (
                  <MailMinusIcon className="size-4" />
                )}
                Resubscribe
              </span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={unsubscribeLink}
                target={hasUnsubscribeLink ? "_blank" : undefined}
                onClick={onUnsubscribe}
                rel="noreferrer"
              >
                <span className="flex items-center gap-1.5">
                  {unsubscribeLoading ? (
                    <ButtonLoader />
                  ) : (
                    <MailMinusIcon className="size-4" />
                  )}
                  {hasUnsubscribeLink ? "Unsubscribe" : "Block"}
                </span>
              </Link>
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBulkArchive([item])}
          >
            {isBulkArchiving ? (
              <ButtonLoader />
            ) : (
              <ArchiveIcon className="mr-2 size-4" />
            )}
            Archive All
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenNewsletter(item)}
          >
            <EyeIcon className="mr-2 size-4" />
            View
          </Button>
        </div>
      </CardContent>

      <Dialog open={resubscribeDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resubscribe to {name}</DialogTitle>
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
                    We're auto-archiving their emails
                  </p>
                </div>
                {unblockComplete ? (
                  <p className="shrink-0 text-sm font-medium text-green-600">
                    Unblocked
                  </p>
                ) : (
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={handleUnblock}
                    disabled={unsubscribeLoading}
                  >
                    {unsubscribeLoading && <ButtonLoader />}
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
                2
              </div>
              <div>
                <div className="font-medium">Manually Resubscribe</div>
                <p className="text-sm text-muted-foreground">
                  Visit their website to sign up again
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
