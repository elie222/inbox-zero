"use client";

import type React from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MailMinusIcon,
  MoreHorizontalIcon,
  TagIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import type { UserResponse } from "@/app/api/user/me/route";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Tooltip } from "@/components/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { NewsletterStatus } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { getGmailSearchUrl } from "@/utils/url";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useApproveButton,
  useBulkArchive,
  useBulkDelete,
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
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? (
            <PremiumTooltipContent openModal={openPremiumModal} />
          ) : undefined
        }
        content={hasUnsubscribeAccess ? "Approve of this sender" : undefined}
      >
        <span>
          <ApproveButton
            item={item}
            hasUnsubscribeAccess={hasUnsubscribeAccess}
            mutate={mutate}
            posthog={posthog}
            emailAccountId={emailAccountId}
          />
        </span>
      </Tooltip>
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
      <MoreDropdown
        onOpenNewsletter={onOpenNewsletter}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        labels={labels}
        posthog={posthog}
        mutate={mutate}
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
  refetchPremium: () => Promise<UserResponse | null | undefined>;
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
      className="w-[100px] justify-center"
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
  const { onApprove, isApproved } = useApproveButton({
    item,
    mutate,
    posthog,
    emailAccountId,
  });

  return (
    <Button
      size="sm"
      variant={isApproved ? "green" : "secondary"}
      onClick={onApprove}
      disabled={!hasUnsubscribeAccess}
    >
      <span className="hidden 2xl:block">Keep</span>
      <span className="block 2xl:hidden">
        <ThumbsUpIcon className="size-4" />
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
  mutate,
}: {
  onOpenNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  emailAccountId: string;
  labels: EmailLabel[];
  posthog: PostHog;
  mutate: () => Promise<void>;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);
  const { onBulkArchive, isBulkArchiving } = useBulkArchive({
    mutate,
    posthog,
    emailAccountId,
  });
  const { onBulkDelete, isBulkDeleting } = useBulkDelete({
    mutate,
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
        {/* View section */}
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

        <DropdownMenuSeparator />

        {/* Organization section */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TagIcon className="mr-2 size-4" />
            <span>{terminology.label.action} future emails</span>
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

        <DropdownMenuSeparator />

        {/* Bulk actions section */}
        <DropdownMenuItem onClick={() => onBulkArchive([item])}>
          {isBulkArchiving ? (
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

            onBulkDelete([item]);
          }}
        >
          {isBulkDeleting ? (
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
  sortDirection?: "asc" | "desc";
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
        props.sortDirection === "asc" ? (
          <ChevronUpIcon className="ml-2 size-4" />
        ) : (
          <ChevronDownIcon className="ml-2 size-4" />
        )
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
