"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import useSWR from "swr";
import { type gmail_v1 } from "googleapis";
import { toast } from "sonner";
import { Title, Text } from "@tremor/react";
import {
  ArchiveIcon,
  ArchiveXIcon,
  BadgeCheckIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PlusCircle,
  SquareSlashIcon,
  TagIcon,
  TrashIcon,
  UserPlus,
  UserRoundMinusIcon,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { onAutoArchive, onDeleteFilter } from "@/utils/actions/client";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { LoadingMiniSpinner } from "@/components/Loading";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import { GroupsResponse } from "@/app/api/user/group/route";
import { addGroupItemAction } from "@/utils/actions/group";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { isErrorMessage } from "@/utils/error";
import { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { archiveEmails, deleteEmails } from "@/providers/QueueProvider";
import { isDefined } from "@/utils/types";
import { getGmailSearchUrl } from "@/utils/url";

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

export function ActionCell<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  setOpenedNewsletter,
  gmailLabels,
  openPremiumModal,
  userEmail,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  setOpenedNewsletter: React.Dispatch<React.SetStateAction<T | undefined>>;
  selected: boolean;
  gmailLabels: LabelsResponse["labels"];
  openPremiumModal: () => void;
  userEmail: string;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = React.useState(false);
  const [autoArchiveLoading, setAutoArchiveLoading] = React.useState(false);
  const [approveLoading, setApproveLoading] = React.useState(false);

  const posthog = usePostHog();

  const userGmailLabels = useMemo(
    () =>
      gmailLabels
        ?.filter((l) => l.id && l.type === "user")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [gmailLabels],
  );

  return (
    <>
      <PremiumTooltip
        showTooltip={!hasUnsubscribeAccess}
        openModal={openPremiumModal}
      >
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
            href={
              hasUnsubscribeAccess
                ? cleanUnsubscribeLink(item.lastUnsubscribeLink ?? "#")
                : "#"
            }
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

              posthog.capture("Clicked Unsubscribe");

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

              posthog.capture("Clicked Auto Archive");

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

                      posthog.capture("Clicked Disable Auto Archive");

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
              {userGmailLabels?.map((label) => {
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

                      posthog.capture("Clicked Auto Archive and Label");

                      setAutoArchiveLoading(false);
                    }}
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
          onClick={async () => {
            setApproveLoading(true);

            await setNewsletterStatus({
              newsletterEmail: item.name,
              status: NewsletterStatus.APPROVED,
            });
            await mutate();

            posthog.capture("Clicked Approve Sender");

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

export function MoreDropdown<T extends Row>({
  setOpenedNewsletter,
  item,
  userEmail,
  userGmailLabels,
  posthog,
}: {
  setOpenedNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  userGmailLabels: LabelsResponse["labels"];
  posthog?: PostHog;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-haspopup="true" size="icon" variant="ghost">
          <MoreHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!!setOpenedNewsletter && (
          <DropdownMenuItem
            onClick={() => {
              setOpenedNewsletter(item);
              posthog?.capture("Clicked Expand Sender");
            }}
          >
            <ExpandIcon className="mr-2 h-4 w-4" />
            <span>View stats</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={getGmailSearchUrl(item.name, userEmail)} target="_blank">
            <ExternalLinkIcon className="mr-2 h-4 w-4" />
            <span>View in Gmail</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="mr-2 h-4 w-4" />
            <span>Add sender to group</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <GroupsSubMenu sender={item.name} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TagIcon className="mr-2 h-4 w-4" />
            <span>Label sender</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <LabelsSubMenu sender={item.name} labels={userGmailLabels} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem
          onClick={() => {
            toast.promise(
              async () => {
                // 1. search gmail for messages from sender
                const res = await fetch(
                  `/api/google/threads/basic?from=${item.name}&labelId=INBOX`,
                );
                const data: GetThreadsResponse = await res.json();

                // 2. archive messages
                if (data?.length) {
                  archiveEmails(
                    data.map((t) => t.id).filter(isDefined),
                    () => {},
                  );
                }

                return data.length;
              },
              {
                loading: `Archiving all emails from ${item.name}`,
                success: (data) =>
                  data
                    ? `Archiving ${data} emails from ${item.name}...`
                    : `No emails to archive from ${item.name}`,
                error: `There was an error archiving the emails from ${item.name} :(`,
              },
            );
          }}
        >
          <ArchiveIcon className="mr-2 h-4 w-4" />
          <span>Archive all from sender</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const yes = confirm(
              `Are you sure you want to delete all emails from ${item.name}?`,
            );
            if (!yes) return;

            toast.promise(
              async () => {
                // 1. search gmail for messages from sender
                const res = await fetch(
                  `/api/google/threads/basic?from=${item.name}`,
                );
                const data: GetThreadsResponse = await res.json();

                // 2. delete messages
                if (data?.length) {
                  deleteEmails(
                    data.map((t) => t.id).filter(isDefined),
                    () => {},
                  );
                }

                return data.length;
              },
              {
                loading: `Deleting all emails from ${item.name}`,
                success: (data) =>
                  data
                    ? `Deleting ${data} emails from ${item.name}...`
                    : `No emails to delete from ${item.name}`,
                error: `There was an error deleting the emails from ${item.name} :(`,
              },
            );
          }}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          <span>Delete all from sender</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

export function useBulkUnsubscribeShortcuts<T extends Row>({
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

      // to prevent when typing in an input such as Crisp support
      if (document?.activeElement?.tagName !== "BODY") return;

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
        window.open(cleanUnsubscribeLink(item.lastUnsubscribeLink), "_blank");
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

function GroupsSubMenu({ sender }: { sender: string }) {
  const { data, isLoading, error } = useSWR<GroupsResponse>(`/api/user/group`);

  return (
    <DropdownMenuSubContent>
      {data && (
        <>
          {data.groups.length ? (
            data?.groups.map((group) => {
              return (
                <DropdownMenuItem
                  key={group.id}
                  onClick={async () => {
                    await addGroupItemAction({
                      groupId: group.id,
                      type: "FROM",
                      value: sender,
                    });
                    toastSuccess({
                      title: "Success!",
                      description: `Added ${sender} to ${group.name}`,
                    });
                  }}
                >
                  {group.name}
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem>You don't have any groups yet.</DropdownMenuItem>
          )}
        </>
      )}
      {isLoading && <DropdownMenuItem>Loading...</DropdownMenuItem>}
      {error && <DropdownMenuItem>Error loading groups</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/automation?tab=groups" target="_blank">
          <PlusCircle className="mr-2 h-4 w-4" />
          <span>New Group</span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  );
}

function LabelsSubMenu({
  sender,
  labels,
}: {
  sender: string;
  labels: gmail_v1.Schema$Label[] | undefined;
}) {
  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels?.length ? (
        labels.map((label) => {
          return (
            <DropdownMenuItem
              key={label.id}
              onClick={async () => {
                if (label.id) {
                  const res = await createFilterAction(sender, label.id);
                  if (isErrorMessage(res)) {
                    toastError({
                      title: "Error",
                      description: `Failed to add ${sender} to ${label.name}. ${res.error}`,
                    });
                  } else {
                    toastSuccess({
                      title: "Success!",
                      description: `Added ${sender} to ${label.name}`,
                    });
                  }
                } else {
                  toastError({
                    title: "Error",
                    description: `Failed to add ${sender} to ${label.name}`,
                  });
                }
              }}
            >
              {label.name}
            </DropdownMenuItem>
          );
        })
      ) : (
        <DropdownMenuItem>You don't have any labels yet.</DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
