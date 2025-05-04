"use client";

import type React from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  BadgeCheckIcon,
  EyeIcon,
  MailMinusIcon,
} from "lucide-react";
import {
  useUnsubscribe,
  useApproveButton,
  useArchiveAll,
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
import { NewsletterStatus } from "@prisma/client";
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
}: RowProps) {
  const name = extractNameFromEmail(item.name);
  const email = extractEmailAddress(item.name);

  const posthog = usePostHog();

  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
    emailAccountId,
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
  const { archiveAllLoading, onArchiveAll } = useArchiveAll({
    item,
    posthog,
    emailAccountId,
  });

  const hasUnsubscribeLink = unsubscribeLink !== "#";

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
          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
            }
            onClick={onApprove}
            disabled={!hasUnsubscribeAccess}
          >
            {approveLoading ? (
              <ButtonLoader />
            ) : (
              <BadgeCheckIcon className="mr-2 size-4" />
            )}
            {item.status === NewsletterStatus.APPROVED ? "Approved" : "Keep"}
          </Button>

          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "default"
            }
            asChild
          >
            <Link
              href={unsubscribeLink}
              target={unsubscribeLink !== "#" ? "_blank" : undefined}
              onClick={onUnsubscribe}
              rel="noreferrer"
            >
              <span className="flex items-center gap-1.5">
                {unsubscribeLoading ? (
                  <ButtonLoader />
                ) : (
                  <MailMinusIcon className="size-4" />
                )}
                {item.status === NewsletterStatus.UNSUBSCRIBED
                  ? hasUnsubscribeLink
                    ? "Unsubscribed"
                    : "Blocked"
                  : hasUnsubscribeLink
                    ? "Unsubscribe"
                    : "Block"}
              </span>
            </Link>
          </Button>

          <Button size="sm" variant="secondary" onClick={onArchiveAll}>
            {archiveAllLoading ? (
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
