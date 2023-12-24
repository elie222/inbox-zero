"use client";

import React, { useState } from "react";
import clsx from "clsx";
import { Title, Text } from "@tremor/react";
import {
  ArchiveIcon,
  ArchiveXIcon,
  BadgeCheckIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  SquareSlashIcon,
  UserRoundMinusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { onAutoArchive, onDeleteFilter } from "@/utils/actions-client";
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
import {
  decrementUnsubscribeCredit,
  setNewsletterStatus,
} from "@/utils/actions";
import {
  PremiumTooltip,
  PremiumTooltipContent,
} from "@/components/PremiumAlert";
import { NewsletterStatus } from "@prisma/client";
import { LoadingMiniSpinner } from "@/components/Loading";

export type Row = {
  name: string;
  lastUnsubscribeLink?: string | null;
  status?: NewsletterStatus | null;
  autoArchived?: { id?: string | null };
};

export function SectionHeader(props: { title: string; description: string }) {
  return (
    <div>
      <Title>{props.title}</Title>
      <Text className="mt-2">{props.description}</Text>
    </div>
  );
}

export function ShortcutTooltip() {
  return (
    <Tooltip
      contentComponent={
        <div>
          <h3 className="mb-1 font-semibold">Shortcuts:</h3>
          <p>U - Unsubscribe</p>
          <p>E - Auto Archive</p>
          <p>A - Approve</p>
          <p>Enter - View more</p>
          <p>Up/down - navigate</p>
        </div>
      }
    >
      <Button size="icon" variant="link">
        <SquareSlashIcon className="h-5 w-5" />
      </Button>
    </Tooltip>
  );
}

export function ActionCell<T extends Row>(props: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  setOpenedNewsletter: React.Dispatch<React.SetStateAction<T | undefined>>;
  selected: boolean;
  gmailLabels: LabelsResponse["labels"];
}) {
  const {
    item,
    hasUnsubscribeAccess,
    setOpenedNewsletter,
    mutate,
    refetchPremium,
    gmailLabels,
  } = props;

  const [unsubscribeLoading, setUnsubscribeLoading] = React.useState(false);
  const [autoArchiveLoading, setAutoArchiveLoading] = React.useState(false);
  const [approveLoading, setApproveLoading] = React.useState(false);

  return (
    <>
      <PremiumTooltip showTooltip={!hasUnsubscribeAccess}>
        <Button
          size="sm"
          variant={
            item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "secondary"
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
            href={hasUnsubscribeAccess ? item.lastUnsubscribeLink ?? "#" : "#"}
            target="_blank"
            onClick={async () => {
              if (!hasUnsubscribeAccess) return;

              setUnsubscribeLoading(true);

              await setNewsletterStatus({
                newsletterEmail: item.name,
                status: NewsletterStatus.UNSUBSCRIBED,
              });
              await mutate();
              await decrementUnsubscribeCredit();
              await refetchPremium();

              setUnsubscribeLoading(false);
            }}
          >
            {unsubscribeLoading ? (
              <LoadingMiniSpinner />
            ) : (
              <>
                <span className="hidden xl:block">Unsubscribe</span>
                <span className="block xl:hidden">
                  <UserRoundMinusIcon className="h-4 w-4" />
                </span>
              </>
            )}
          </a>
        </Button>
      </PremiumTooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? <PremiumTooltipContent /> : undefined
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
            onClick={async () => {
              setAutoArchiveLoading(true);

              onAutoArchive(item.name);
              await setNewsletterStatus({
                newsletterEmail: item.name,
                status: NewsletterStatus.AUTO_ARCHIVED,
              });
              await mutate();
              await decrementUnsubscribeCredit();
              await refetchPremium();

              setAutoArchiveLoading(false);
            }}
            disabled={!hasUnsubscribeAccess}
          >
            {autoArchiveLoading ? (
              <LoadingMiniSpinner />
            ) : (
              <>
                <span className="hidden xl:block">Auto Archive</span>
                <span className="block xl:hidden">
                  <ArchiveIcon className="h-4 w-4" />
                </span>
              </>
            )}
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
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
            >
              {item.autoArchived?.id && (
                <>
                  <DropdownMenuItem
                    onClick={async () => {
                      setAutoArchiveLoading(true);

                      onDeleteFilter(item.autoArchived?.id!);
                      await setNewsletterStatus({
                        newsletterEmail: item.name,
                        status: null,
                      });
                      await mutate();

                      setAutoArchiveLoading(false);
                    }}
                  >
                    <ArchiveXIcon className="mr-2 h-4 w-4" /> Disable Auto
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuLabel>Auto Archive and Label</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {gmailLabels
                ?.filter(
                  (l) =>
                    l.id &&
                    l.type === "user" &&
                    l.labelListVisibility === "labelShow",
                )
                .map((label) => {
                  return (
                    <DropdownMenuItem
                      key={label.id}
                      onClick={async () => {
                        setAutoArchiveLoading(true);

                        onAutoArchive(item.name, label.id || undefined);
                        await setNewsletterStatus({
                          newsletterEmail: item.name,
                          status: NewsletterStatus.AUTO_ARCHIVED,
                        });
                        await mutate();
                        await decrementUnsubscribeCredit();
                        await refetchPremium();

                        setAutoArchiveLoading(false);
                      }}
                    >
                      {label.name}
                    </DropdownMenuItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Tooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? <PremiumTooltipContent /> : undefined
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
          onClick={async () => {
            setApproveLoading(true);

            await setNewsletterStatus({
              newsletterEmail: item.name,
              status: NewsletterStatus.APPROVED,
            });
            await mutate();

            setApproveLoading(false);
          }}
          disabled={!hasUnsubscribeAccess}
        >
          {approveLoading ? (
            <LoadingMiniSpinner />
          ) : (
            <>
              <span className="sr-only">Approve</span>
              <span>
                <BadgeCheckIcon className="h-4 w-4" />
              </span>
            </>
          )}
        </Button>
      </Tooltip>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpenedNewsletter(item)}
      >
        <ExpandIcon className="h-4 w-4" />
      </Button>
    </>
  );
}

export function HeaderButton(props: {
  children: React.ReactNode;
  sorted: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={props.onClick}
    >
      <span>{props.children}</span>
      {props.sorted ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}

export function useNewsletterShortcuts<T extends Row>({
  newsletters,
  selectedRow,
  setOpenedNewsletter,
  setSelectedRow,
  refetchPremium,
  hasUnsubscribeAccess,
  mutate,
}: {
  newsletters?: T[];
  selectedRow?: T;
  setSelectedRow: (row: T) => void;
  setOpenedNewsletter: (row: T) => void;
  refetchPremium: () => Promise<any>;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<any>;
}) {
  // perform actions using keyboard shortcuts
  // TODO make this available to command-K dialog too
  // TODO limit the copy-paste. same logic appears twice in this file
  React.useEffect(() => {
    const down = async (e: KeyboardEvent) => {
      const item = selectedRow;
      if (!item) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const index = newsletters?.findIndex((n) => n.name === item.name);
        if (index === undefined) return;
        const nextItem =
          newsletters?.[index + (e.key === "ArrowDown" ? 1 : -1)];
        if (!nextItem) return;
        setSelectedRow(nextItem);
        return;
      } else if (e.key === "Enter") {
        // open modal
        e.preventDefault();
        setOpenedNewsletter(item);
        return;
      }

      if (!hasUnsubscribeAccess) return;

      if (e.key === "e") {
        // auto archive
        e.preventDefault();
        onAutoArchive(item.name);
        await setNewsletterStatus({
          newsletterEmail: item.name,
          status: NewsletterStatus.AUTO_ARCHIVED,
        });
        await mutate();
        await decrementUnsubscribeCredit();
        await refetchPremium();
        return;
      } else if (e.key === "u") {
        // unsubscribe
        e.preventDefault();
        if (!item.lastUnsubscribeLink) return;
        window.open(item.lastUnsubscribeLink, "_blank");
        await setNewsletterStatus({
          newsletterEmail: item.name,
          status: NewsletterStatus.UNSUBSCRIBED,
        });
        await mutate();
        await decrementUnsubscribeCredit();
        await refetchPremium();
        return;
      } else if (e.key === "a") {
        // approve
        e.preventDefault();
        await setNewsletterStatus({
          newsletterEmail: item.name,
          status: NewsletterStatus.APPROVED,
        });
        await mutate();
        return;
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [
    mutate,
    newsletters,
    selectedRow,
    hasUnsubscribeAccess,
    refetchPremium,
    setSelectedRow,
    setOpenedNewsletter,
  ]);
}

export function useNewsletterFilter() {
  const [filters, setFilters] = useState<
    Record<"unhandled" | "unsubscribed" | "autoArchived" | "approved", boolean>
  >({
    unhandled: true,
    unsubscribed: false,
    autoArchived: false,
    approved: false,
  });

  return {
    filters,
    filtersArray: Object.entries(filters)
      .filter(([, selected]) => selected)
      .map(([key]) => key) as (
      | "unhandled"
      | "unsubscribed"
      | "autoArchived"
      | "approved"
    )[],
    setFilters,
  };
}
