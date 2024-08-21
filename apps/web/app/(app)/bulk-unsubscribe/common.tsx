"use client";

import React, { useCallback, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import useSWR from "swr";
import type { gmail_v1 } from "googleapis";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveXIcon,
  BadgeCheckIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MailMinusIcon,
  MoreHorizontalIcon,
  PlusCircle,
  TagIcon,
  TrashIcon,
  UserPlus,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
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
import type { LabelsResponse } from "@/app/api/google/labels/route";
import { setNewsletterStatusAction } from "@/utils/actions/unsubscriber";
import { decrementUnsubscribeCreditAction } from "@/utils/actions/premium";
import {
  PremiumTooltip,
  PremiumTooltipContent,
} from "@/components/PremiumAlert";
import { NewsletterStatus } from "@prisma/client";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { addGroupItemAction } from "@/utils/actions/group";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { isActionError, isErrorMessage } from "@/utils/error";
import type { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { archiveEmails, deleteEmails } from "@/providers/QueueProvider";
import { isDefined } from "@/utils/types";
import { getGmailSearchUrl } from "@/utils/url";
import { Row } from "@/app/(app)/bulk-unsubscribe/types";

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
  const posthog = usePostHog();

  return (
    <>
      <PremiumTooltip
        showTooltip={!hasUnsubscribeAccess}
        openModal={openPremiumModal}
      >
        <UnsubscribeButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
          refetchPremium={refetchPremium}
        />
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
        <AutoArchiveButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
          refetchPremium={refetchPremium}
          userGmailLabels={userGmailLabels}
        />
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
        <ApproveButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
        />
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

export function useUnsubscribeButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const [unsubscribeLoading, setUnsubscribeLoading] = React.useState(false);

  const onUnsubscribe = useCallback(async () => {
    if (!hasUnsubscribeAccess) return;

    setUnsubscribeLoading(true);

    await setNewsletterStatusAction({
      newsletterEmail: item.name,
      status: NewsletterStatus.UNSUBSCRIBED,
    });
    await mutate();
    await decrementUnsubscribeCreditAction();
    await refetchPremium();

    posthog.capture("Clicked Unsubscribe");

    setUnsubscribeLoading(false);
  }, [hasUnsubscribeAccess, item.name, mutate, posthog, refetchPremium]);

  return {
    unsubscribeLoading,
    onUnsubscribe,
  };
}

function UnsubscribeButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const { unsubscribeLoading, onUnsubscribe } = useUnsubscribeButton({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  return (
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
          hasUnsubscribeAccess ? undefined : "pointer-events-none opacity-50"
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
        {unsubscribeLoading && <ButtonLoader />}
        <span className="hidden xl:block">Unsubscribe</span>
        <span className="block xl:hidden">
          <MailMinusIcon className="h-4 w-4" />
        </span>
      </a>
    </Button>
  );
}

function AutoArchiveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  userGmailLabels,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
  userGmailLabels: LabelsResponse["labels"];
}) {
  const [autoArchiveLoading, setAutoArchiveLoading] = React.useState(false);

  const onAutoArchiveClick = useCallback(async () => {
    setAutoArchiveLoading(true);

    onAutoArchive(item.name);
    await setNewsletterStatusAction({
      newsletterEmail: item.name,
      status: NewsletterStatus.AUTO_ARCHIVED,
    });
    await mutate();
    await decrementUnsubscribeCreditAction();
    await refetchPremium();

    posthog.capture("Clicked Auto Archive");

    setAutoArchiveLoading(false);
  }, [item.name, mutate, posthog, refetchPremium]);

  return (
    <div
      className={clsx(
        "flex h-min items-center gap-1 rounded-md text-secondary-foreground",
        item.autoArchived ? "bg-blue-100" : "bg-secondary",
      )}
    >
      <Button
        variant={
          item.status === NewsletterStatus.AUTO_ARCHIVED || item.autoArchived
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
                  await setNewsletterStatusAction({
                    newsletterEmail: item.name,
                    status: null,
                  });
                  await mutate();

                  posthog.capture("Clicked Disable Auto Archive");

                  setAutoArchiveLoading(false);
                }}
              >
                <ArchiveXIcon className="mr-2 h-4 w-4" /> Disable Auto Archive
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
                  await setNewsletterStatusAction({
                    newsletterEmail: item.name,
                    status: NewsletterStatus.AUTO_ARCHIVED,
                  });
                  await mutate();
                  await decrementUnsubscribeCreditAction();
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
  );
}

export function useApproveButton<T extends Row>({
  item,
  mutate,
  posthog,
}: {
  item: T;
  mutate: () => Promise<void>;
  posthog: PostHog;
}) {
  const [approveLoading, setApproveLoading] = React.useState(false);

  const onApprove = async () => {
    setApproveLoading(true);

    await setNewsletterStatusAction({
      newsletterEmail: item.name,
      status: NewsletterStatus.APPROVED,
    });
    await mutate();

    posthog.capture("Clicked Approve Sender");

    setApproveLoading(false);
  };

  return {
    approveLoading,
    onApprove,
  };
}

function ApproveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
}) {
  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
  });

  return (
    <Button
      size="sm"
      variant={
        item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
      }
      onClick={onApprove}
      disabled={!hasUnsubscribeAccess}
    >
      {approveLoading && <ButtonLoader />}
      <span className="sr-only">Keep</span>
      <span>
        <BadgeCheckIcon className="h-4 w-4" />
      </span>
    </Button>
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
            <span>Label future emails</span>
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
          <span>Archive all</span>
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
          <span>Delete all</span>
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
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: NewsletterStatus.AUTO_ARCHIVED,
        });
        await mutate();
        await decrementUnsubscribeCreditAction();
        await refetchPremium();
        return;
      } else if (e.key === "u") {
        // unsubscribe
        e.preventDefault();
        if (!item.lastUnsubscribeLink) return;
        window.open(cleanUnsubscribeLink(item.lastUnsubscribeLink), "_blank");
        await setNewsletterStatusAction({
          newsletterEmail: item.name,
          status: NewsletterStatus.UNSUBSCRIBED,
        });
        await mutate();
        await decrementUnsubscribeCreditAction();
        await refetchPremium();
        return;
      } else if (e.key === "a") {
        // approve
        e.preventDefault();
        await setNewsletterStatusAction({
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
                    const result = await addGroupItemAction({
                      groupId: group.id,
                      type: "FROM",
                      value: sender,
                    });

                    if (isActionError(result)) {
                      toastError({
                        description: `Failed to add ${sender} to ${group.name}. ${result.error}`,
                      });
                    } else {
                      toastSuccess({
                        title: "Success!",
                        description: `Added ${sender} to ${group.name}`,
                      });
                    }
                  }}
                >
                  {group.name}
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem>{`You don't have any groups yet.`}</DropdownMenuItem>
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
        <DropdownMenuItem>{`You don't have any labels yet.`}</DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
