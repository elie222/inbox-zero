"use client";

import React, { useCallback } from "react";
import clsx from "clsx";
import {
  ArchiveIcon,
  ArchiveXIcon,
  BadgeCheckIcon,
  ChevronDownIcon,
  UserRoundMinusIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { Button, ButtonLoader } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { onAutoArchive, onDeleteFilter } from "@/utils/actions/client";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelsResponse } from "@/app/api/google/labels/route";
import { setNewsletterStatus } from "@/utils/actions/unsubscriber";
import { decrementUnsubscribeCredit } from "@/utils/actions/premium";
import {
  PremiumTooltip,
  PremiumTooltipContent,
} from "@/components/PremiumAlert";
import { NewsletterStatus } from "@prisma/client";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import { Row } from "@/app/(app)/bulk-unsubscribe/types";
import { MoreDropdown } from "@/app/(app)/bulk-unsubscribe/MoreDropdown";

export function ActionCell<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  setOpenedNewsletter,
  userGmailLabels,
  openPremiumModal,
  userEmail,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  setOpenedNewsletter: React.Dispatch<React.SetStateAction<T | undefined>>;
  selected: boolean;
  userGmailLabels: LabelsResponse["labels"];
  openPremiumModal: () => void;
  userEmail: string;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = React.useState(false);
  const [autoArchiveLoading, setAutoArchiveLoading] = React.useState(false);
  const [approveLoading, setApproveLoading] = React.useState(false);

  const posthog = usePostHog();

  const onUnsubscribeClick = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setUnsubscribeLoading(true);

    await setNewsletterStatus({
      newsletterEmail: item.name,
      status: NewsletterStatus.UNSUBSCRIBED,
    });
    await mutate();
    await decrementUnsubscribeCredit();
    await refetchPremium();

    posthog.capture("Clicked Unsubscribe");

    setUnsubscribeLoading(false);
  }, [hasUnsubscribeAccess, item.name, mutate, posthog, refetchPremium]);

  const onAutoArchiveClick = useCallback(async () => {
    setAutoArchiveLoading(true);

    onAutoArchive(item.name);
    await setNewsletterStatus({
      newsletterEmail: item.name,
      status: NewsletterStatus.AUTO_ARCHIVED,
    });
    await mutate();
    await decrementUnsubscribeCredit();
    await refetchPremium();

    posthog.capture("Clicked Auto Archive");

    setAutoArchiveLoading(false);
  }, [item.name, mutate, posthog, refetchPremium]);

  const onAutoArchiveAndLabelClick = async (labelId?: string | null) => {
    setAutoArchiveLoading(true);

    onAutoArchive(item.name, labelId || undefined);
    await setNewsletterStatus({
      newsletterEmail: item.name,
      status: NewsletterStatus.AUTO_ARCHIVED,
    });
    await mutate();
    await decrementUnsubscribeCredit();
    await refetchPremium();

    posthog.capture("Clicked Auto Archive and Label");

    setAutoArchiveLoading(false);
  };

  const onDisableAutoArchiveClick = useCallback(async () => {
    setAutoArchiveLoading(true);

    onDeleteFilter(item.autoArchived?.id!);
    await setNewsletterStatus({
      newsletterEmail: item.name,
      status: null,
    });
    await mutate();

    posthog.capture("Clicked Disable Auto Archive");

    setAutoArchiveLoading(false);
  }, [item.autoArchived?.id, item.name, mutate, posthog]);

  const onApproveClick = useCallback(async () => {
    setApproveLoading(true);

    await setNewsletterStatus({
      newsletterEmail: item.name,
      status: NewsletterStatus.APPROVED,
    });
    await mutate();

    posthog.capture("Clicked Approve Sender");

    setApproveLoading(false);
  }, [item.name, mutate, posthog]);

  return (
    <>
      <PremiumTooltip
        showTooltip={!hasUnsubscribeAccess}
        openModal={openPremiumModal}
      >
        <div
          className={clsx(
            "flex items-center space-x-1 rounded-md text-secondary-foreground",
            item.status === NewsletterStatus.UNSUBSCRIBED
              ? "bg-blue-100"
              : "bg-secondary",
          )}
        >
          <Button
            size="sm"
            variant={
              item.status === NewsletterStatus.UNSUBSCRIBED
                ? "red"
                : "secondary"
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
              onClick={onUnsubscribeClick}
            >
              {unsubscribeLoading && <ButtonLoader />}
              <span className="hidden xl:block">Unsubscribe</span>
              <span className="block xl:hidden">
                <UserRoundMinusIcon className="h-4 w-4" />
              </span>
            </a>
          </Button>

          <Separator orientation="vertical" className="h-[20px]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={
                  item.status === NewsletterStatus.AUTO_ARCHIVED ||
                  item.autoArchived
                    ? "blue"
                    : "secondary"
                }
                className="px-2 shadow-none"
                size="sm"
                disabled={!hasUnsubscribeAccess}
              >
                <ChevronDownIcon className="h-4 w-4 text-secondary-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              alignOffset={-5}
              className="max-h-[415px] w-[220px] overflow-auto"
              forceMount
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuLabel>
                By default we unsubscribe and archive all from sender
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={async () => {}}>
                Unsubscribe but do not archive existing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {}}>
                Unsubscribe and delete all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PremiumTooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? (
            <PremiumTooltipContent openModal={openPremiumModal} />
          ) : undefined
        }
        content={
          hasUnsubscribeAccess
            ? "Auto archive emails using Gmail filters."
            : undefined
        }
      >
        <div
          className={clsx(
            "flex items-center space-x-1 rounded-md text-secondary-foreground",
            item.autoArchived ? "bg-blue-100" : "bg-secondary",
          )}
        >
          <Button
            variant={
              item.status === NewsletterStatus.AUTO_ARCHIVED ||
              item.autoArchived
                ? "blue"
                : "secondary"
            }
            className="px-3 shadow-none"
            size="sm"
            onClick={onAutoArchiveClick}
            disabled={!hasUnsubscribeAccess}
          >
            {autoArchiveLoading && <ButtonLoader />}
            <span className="hidden xl:block">Auto Archive</span>
            <span className="block xl:hidden">
              <ArchiveIcon className="h-4 w-4" />
            </span>
          </Button>
          <Separator orientation="vertical" className="h-[20px]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={
                  item.status === NewsletterStatus.AUTO_ARCHIVED ||
                  item.autoArchived
                    ? "blue"
                    : "secondary"
                }
                className="px-2 shadow-none"
                size="sm"
                disabled={!hasUnsubscribeAccess}
              >
                <ChevronDownIcon className="h-4 w-4 text-secondary-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              alignOffset={-5}
              className="max-h-[415px] w-[220px] overflow-auto"
              forceMount
              onKeyDown={(e) => e.stopPropagation()}
            >
              {item.autoArchived?.id && (
                <>
                  <DropdownMenuItem onClick={onDisableAutoArchiveClick}>
                    <ArchiveXIcon className="mr-2 h-4 w-4" /> Disable Auto
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuLabel>Auto Archive and Label</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {userGmailLabels?.map((label) => {
                return (
                  <DropdownMenuItem
                    key={label.id}
                    onClick={() => onAutoArchiveAndLabelClick(label.id)}
                  >
                    {label.name}
                  </DropdownMenuItem>
                );
              })}
              {!userGmailLabels?.length && (
                <DropdownMenuItem>
                  You do not have any labels. Create one in Gmail first to auto
                  label emails.
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Tooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? (
            <PremiumTooltipContent openModal={openPremiumModal} />
          ) : undefined
        }
        content={
          hasUnsubscribeAccess
            ? "Approve to filter it from the list."
            : undefined
        }
      >
        <Button
          size="sm"
          variant={
            item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
          }
          onClick={onApproveClick}
          disabled={!hasUnsubscribeAccess}
        >
          {approveLoading && <ButtonLoader />}
          <span className="sr-only">Approve</span>
          <span>
            <BadgeCheckIcon className="h-4 w-4" />
          </span>
        </Button>
      </Tooltip>
      <MoreDropdown
        setOpenedNewsletter={setOpenedNewsletter}
        item={item}
        userEmail={userEmail}
        userGmailLabels={userGmailLabels}
        posthog={posthog}
      />
    </>
  );
}
