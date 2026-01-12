"use client";

import type React from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { EyeIcon, MailMinusIcon, ThumbsUpIcon } from "lucide-react";
import {
  useUnsubscribe,
  useApproveButton,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  extractDomainFromEmail,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { SenderIcon } from "@/components/charts/DomainIcon";

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
  emailAccountId,
}: RowProps) {
  const name = item.fromName || extractNameFromEmail(item.name);
  const email = extractEmailAddress(item.name);
  const domain = extractDomainFromEmail(item.name);

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
  const hasUnsubscribeLink = unsubscribeLink !== "#";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <SenderIcon domain={domain} name={name} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{name}</CardTitle>
            <CardDescription className="truncate text-sm">
              {email}
            </CardDescription>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {item.value} emails
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
            }
            onClick={onApprove}
            disabled={!hasUnsubscribeAccess}
            className="flex-1"
          >
            {approveLoading ? (
              <ButtonLoader />
            ) : (
              <ThumbsUpIcon className="mr-2 size-4" />
            )}
            Keep
          </Button>

          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "default"
            }
            className="flex-1"
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
                {hasUnsubscribeLink ? "Unsubscribe" : "Block"}
              </span>
            </Link>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenNewsletter(item)}
          >
            <EyeIcon className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
