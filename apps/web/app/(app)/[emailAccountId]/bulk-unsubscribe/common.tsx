"use client";

import type React from "react";
import clsx from "clsx";
import Link from "next/link";
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
  TagIcon,
  TrashIcon,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Tooltip } from "@/components/Tooltip";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PremiumTooltip,
  PremiumTooltipContent,
} from "@/components/PremiumAlert";
import { NewsletterStatus } from "@prisma/client";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { getGmailSearchUrl } from "@/utils/url";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useAutoArchive,
  useApproveButton,
  useArchiveAll,
  useDeleteAllFromSender,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { LabelsSubMenu } from "@/components/LabelsSubMenu";
import type { EmailLabel } from "@/providers/EmailProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getEmailTerminology } from "@/utils/terminology";

export function ActionCell<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  onOpenNewsletter,
  labels,
  openPremiumModal,
  userEmail,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  onOpenNewsletter: (row: T) => void;
  selected: boolean;
  labels: EmailLabel[];
  openPremiumModal: () => void;
  userEmail: string;
  emailAccountId: string;
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
          emailAccountId={emailAccountId}
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
          labels={labels}
          emailAccountId={emailAccountId}
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
          emailAccountId={emailAccountId}
        />
      </Tooltip>
      <MoreDropdown
        onOpenNewsletter={onOpenNewsletter}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        labels={labels}
        posthog={posthog}
      />
    </>
  );
}

function UnsubscribeButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const { unsubscribeLoading, onUnsubscribe, unsubscribeLink } = useUnsubscribe(
    {
      item,
      hasUnsubscribeAccess,
      mutate,
      posthog,
      refetchPremium,
      emailAccountId,
    },
  );

  const hasUnsubscribeLink = unsubscribeLink !== "#";

  return (
    <Button
      size="sm"
      variant={
        item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "secondary"
      }
      asChild
    >
      <Link
        href={unsubscribeLink}
        target={hasUnsubscribeLink ? "_blank" : undefined}
        onClick={onUnsubscribe}
        rel="noreferrer"
      >
        {unsubscribeLoading && <ButtonLoader />}
        <span className="hidden xl:block">
          {hasUnsubscribeLink ? "Unsubscribe" : "Block"}
        </span>
        <span className="block xl:hidden">
          <Tooltip
            content={
              hasUnsubscribeLink
                ? "Unsubscribe from emails from this sender"
                : "This sender does not have an unsubscribe link, but we can still block all emails from this sender and automatically archive them for you."
            }
          >
            <MailMinusIcon className="size-4" />
          </Tooltip>
        </span>
      </Link>
    </Button>
  );
}

function AutoArchiveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  labels,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
  labels: EmailLabel[];
  emailAccountId: string;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);
  const {
    autoArchiveLoading,
    onAutoArchive,
    onAutoArchiveAndLabel,
    onDisableAutoArchive,
  } = useAutoArchive({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
  });

  return (
    <div
      className={clsx(
        "flex h-min items-center gap-1 rounded-md text-secondary-foreground",
        item.autoArchived ? "bg-blue-100 dark:bg-blue-800" : "bg-secondary",
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
        onClick={onAutoArchive}
        disabled={!hasUnsubscribeAccess}
      >
        {autoArchiveLoading && <ButtonLoader />}
        <span className="hidden xl:block">Skip Inbox</span>
        <span className="block xl:hidden">
          <Tooltip content="Skip Inbox">
            <ArchiveIcon className="size-4" />
          </Tooltip>
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
            <ChevronDownIcon className="size-4 text-secondary-foreground" />
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
                  posthog.capture("Clicked Disable Auto Archive");
                  onDisableAutoArchive();
                }}
              >
                <ArchiveXIcon className="mr-2 size-4" /> Disable Skip Inbox
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuLabel>
            Skip Inbox and {terminology.label.singularCapitalized}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {labels.map((label) => {
            return (
              <DropdownMenuItem
                key={label.id}
                onClick={async () => {
                  posthog.capture("Clicked Auto Archive and Label");
                  await onAutoArchiveAndLabel(label.id!, label.name!);
                }}
              >
                {label.name}
              </DropdownMenuItem>
            );
          })}
          {!labels.length && (
            <DropdownMenuItem>
              You do not have any {terminology.label.plural}. Create one in your
              email client first to auto
              {terminology.label.singular} emails.
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ApproveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  emailAccountId,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
}) {
  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
    emailAccountId,
  });

  return (
    <Button
      size="sm"
      variant={
        item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
      }
      onClick={onApprove}
      disabled={!hasUnsubscribeAccess}
      loading={approveLoading}
    >
      <span className="hidden 2xl:block">Keep</span>
      <span className="block 2xl:hidden">
        <Tooltip content="Keep">
          <BadgeCheckIcon className="size-4" />
        </Tooltip>
      </span>
    </Button>
  );
}

export function MoreDropdown<T extends Row>({
  onOpenNewsletter,
  item,
  userEmail,
  emailAccountId,
  labels,
  posthog,
}: {
  onOpenNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  emailAccountId: string;
  labels: EmailLabel[];
  posthog: PostHog;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);
  const { archiveAllLoading, onArchiveAll } = useArchiveAll({
    item,
    posthog,
    emailAccountId,
  });
  const { deleteAllLoading, onDeleteAll } = useDeleteAllFromSender({
    item,
    posthog,
    emailAccountId,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-haspopup="true" size="icon" variant="ghost">
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!!onOpenNewsletter && (
          <DropdownMenuItem onClick={() => onOpenNewsletter(item)}>
            <ExpandIcon className="mr-2 size-4" />
            <span>View stats</span>
          </DropdownMenuItem>
        )}
        {isGoogleProvider(provider) && (
          <DropdownMenuItem asChild>
            <Link
              href={getGmailSearchUrl(item.name, userEmail)}
              target="_blank"
            >
              <ExternalLinkIcon className="mr-2 size-4" />
              <span>View in Gmail</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="mr-2 size-4" />
            <span>Add sender to rule</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <GroupsSubMenu sender={item.name} />
          </DropdownMenuPortal>
        </DropdownMenuSub> */}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TagIcon className="mr-2 size-4" />
            <span>{terminology.label.singularCapitalized} future emails</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <LabelsSubMenu
              labels={labels}
              onClick={async (label) => {
                const res = await createFilterAction(emailAccountId, {
                  from: item.name,
                  gmailLabelId: label.id,
                });
                if (res?.serverError) {
                  toastError({
                    title: "Error",
                    description: `Failed to add ${item.name} to ${label.name}. ${res.serverError || ""}`,
                  });
                } else {
                  toastSuccess({
                    title: "Success!",
                    description: `Added ${item.name} to ${label.name}`,
                  });
                }
              }}
            />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={onArchiveAll}>
          {archiveAllLoading ? (
            <ButtonLoader />
          ) : (
            <ArchiveIcon className="mr-2 size-4" />
          )}
          <span>Archive all</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const yes = confirm(
              `Are you sure you want to delete all emails from ${item.name}?`,
            );
            if (!yes) return;

            onDeleteAll();
          }}
        >
          {deleteAllLoading ? (
            <ButtonLoader />
          ) : (
            <TrashIcon className="mr-2 size-4" />
          )}
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
        <ChevronDown className="ml-2 size-4" />
      ) : (
        <ChevronsUpDownIcon className="ml-2 size-4" />
      )}
    </Button>
  );
}

// function GroupsSubMenu({ sender }: { sender: string }) {
//   const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

//   return (
//     <DropdownMenuSubContent>
//       {data &&
//         (data.groups.length ? (
//           data?.groups.map((group) => {
//             return (
//               <DropdownMenuItem
//                 key={group.id}
//                 onClick={async () => {
//                   const result = await addGroupItemAction(emailAccountId, {
//                     groupId: group.id,
//                     type: GroupItemType.FROM,
//                     value: sender,
//                   });

//                   if (result?.serverError) {
//                     toastError({
//                       description: `Failed to add ${sender} to ${group.name}. ${result.error}`,
//                     });
//                   } else {
//                     toastSuccess({
//                       title: "Success!",
//                       description: `Added ${sender} to ${group.name}`,
//                     });
//                   }
//                 }}
//               >
//                 {group.name}
//               </DropdownMenuItem>
//             );
//           })
//         ) : (
//           <DropdownMenuItem>{`You don't have any groups yet.`}</DropdownMenuItem>
//         ))}
//       {isLoading && <DropdownMenuItem>Loading...</DropdownMenuItem>}
//       {error && <DropdownMenuItem>Error loading groups</DropdownMenuItem>}
//       <DropdownMenuSeparator />
//       <DropdownMenuItem asChild>
//         <Link href={prefixPath(emailAccountId, "/automation?tab=groups")} target="_blank">
//           <PlusCircle className="mr-2 size-4" />
//           <span>New Group</span>
//         </Link>
//       </DropdownMenuItem>
//     </DropdownMenuSubContent>
//   );
// }
