"use client";

import React from "react";
import {
  useUnsubscribeButton,
  useApproveButton,
} from "@/app/(app)/bulk-unsubscribe/common";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { usePostHog } from "posthog-js/react";
import { RowProps } from "@/app/(app)/bulk-unsubscribe/types";
import { Button, ButtonLoader } from "@/components/ui/button";
import { NewsletterStatus } from "@prisma/client";
import { BadgeCheckIcon, MailMinusIcon } from "lucide-react";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";

export function BulkUnsubscribeMobile({
  tableRows,
}: {
  tableRows?: React.ReactNode;
}) {
  return <div className="mx-2 mt-2 grid gap-2">{tableRows}</div>;
}

export function BulkUnsubscribeRowMobile(props: RowProps) {
  const { item, refetchPremium, mutate, hasUnsubscribeAccess } = props;

  const posthog = usePostHog();

  // const readPercentage = (item.readEmails / item.value) * 100;
  // const archivedEmails = item.value - item.inboxEmails;
  // const archivedPercentage = (archivedEmails / item.value) * 100;

  const name = extractNameFromEmail(item.name);
  const email = extractEmailAddress(item.name);

  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
  });
  const { unsubscribeLoading, onUnsubscribe } = useUnsubscribeButton({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="truncate">{name}</CardTitle>
        <CardDescription className="truncate">{email}</CardDescription>
      </CardHeader>
      <CardContent>
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
              <BadgeCheckIcon className="mr-2 h-4 w-4" />
            )}
            Keep
          </Button>

          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "default"
            }
            disabled={!item.lastUnsubscribeLink}
            asChild={!!item.lastUnsubscribeLink}
          >
            <a
              className={
                hasUnsubscribeAccess
                  ? undefined
                  : "pointer-events-none opacity-50"
              }
              href={
                hasUnsubscribeAccess
                  ? cleanUnsubscribeLink(item.lastUnsubscribeLink ?? "#")
                  : "#"
              }
              target="_blank"
              onClick={onUnsubscribe}
              rel="noreferrer"
            >
              {unsubscribeLoading ? (
                <ButtonLoader />
              ) : (
                <MailMinusIcon className="mr-2 h-4 w-4" />
              )}
              Unsubscribe
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
