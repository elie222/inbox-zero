"use client";

import type React from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
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

          <Button size="sm" variant="outline" asChild>
            <Link
              href={unsubscribeLink}
              target={
                hasUnsubscribeLink && !isUnsubscribed ? "_blank" : undefined
              }
              onClick={onUnsubscribe}
              rel="noreferrer"
            >
              <span className="flex items-center gap-1.5">
                {unsubscribeLoading ? (
                  <ButtonLoader />
                ) : (
                  <MailMinusIcon className="size-4" />
                )}
                {isUnsubscribed
                  ? "Resubscribe"
                  : hasUnsubscribeLink
                    ? "Unsubscribe"
                    : "Block"}
              </span>
            </Link>
          </Button>

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
    </Card>
  );
}
