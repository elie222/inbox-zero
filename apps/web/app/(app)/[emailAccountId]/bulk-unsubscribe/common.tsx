"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MailXIcon,
  MoreHorizontalIcon,
  TagIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import type { UserResponse } from "@/app/api/user/me/route";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PremiumTooltip } from "@/components/PremiumAlert";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { getGmailSearchUrl } from "@/utils/url";
import { extractNameFromEmail } from "@/utils/email";
import { Badge } from "@/components/ui/badge";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useApproveButton,
  useBulkArchive,
  useBulkDelete,
  type NewsletterFilterType,
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
  filter,
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
  filter: NewsletterFilterType;
}) {
  const posthog = usePostHog();

  const isUnsubscribed = item.status === NewsletterStatus.UNSUBSCRIBED;

  return (
    <>
      {isUnsubscribed ? (
        <Badge variant="red" className="gap-1">
          <MailXIcon className="size-3" />
          Unsubscribed
        </Badge>
      ) : (
        <ApproveButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
          emailAccountId={emailAccountId}
          filter={filter}
        />
      )}
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
  const [resubscribeDialogOpen, setResubscribeDialogOpen] = useState(false);
  const [unblockComplete, setUnblockComplete] = useState(false);

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
  const isUnsubscribed = item.status === NewsletterStatus.UNSUBSCRIBED;

  const buttonText = isUnsubscribed
    ? "Resubscribe"
    : hasUnsubscribeLink
      ? "Unsubscribe"
      : "Block";

  const senderName = item.fromName || extractNameFromEmail(item.name);

  const handleUnblock = async () => {
    await onUnsubscribe();
    setUnblockComplete(true);
  };

  const handleDialogClose = (open: boolean) => {
    setResubscribeDialogOpen(open);
    if (!open) {
      setUnblockComplete(false);
    }
  };

  if (isUnsubscribed) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          className="w-[110px] justify-center"
          onClick={() => setResubscribeDialogOpen(true)}
        >
          {unsubscribeLoading && <ButtonLoader />}
          {buttonText}
        </Button>

        <Dialog open={resubscribeDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resubscribe to {senderName}</DialogTitle>
              <DialogDescription className="pt-2">
                Follow the steps below to receive emails from this sender again.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border">
              {/* Step 1 */}
              <div className="flex gap-4 p-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium">
                  {unblockComplete ? (
                    <CheckIcon className="size-4 text-green-600" />
                  ) : (
                    "1"
                  )}
                </div>
                <div className="flex flex-1 items-center justify-between gap-4">
                  <div className="font-medium">Stop blocking</div>
                  {unblockComplete ? (
                    <p className="shrink-0 text-sm font-medium text-green-600">
                      Unblocked
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={handleUnblock}
                      disabled={unsubscribeLoading}
                    >
                      {unsubscribeLoading && <ButtonLoader />}
                      Unblock
                    </Button>
                  )}
                </div>
              </div>

              {/* Separator */}
              <div className="border-t" />

              {/* Step 2 */}
              <div className="flex gap-4 p-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium">
                  2
                </div>
                <div className="font-medium">Sign up on their website</div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="w-[110px] justify-center"
      asChild
    >
      <Link
        href={unsubscribeLink}
        target={hasUnsubscribeLink ? "_blank" : undefined}
        onClick={onUnsubscribe}
        rel="noreferrer"
      >
        {unsubscribeLoading && <ButtonLoader />}
        {buttonText}
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
  filter,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  emailAccountId: string;
  filter: NewsletterFilterType;
}) {
  const { onApprove, isApproved } = useApproveButton({
    item,
    mutate,
    posthog,
    emailAccountId,
    filter,
  });

  return (
    <Button
      size="sm"
      variant={isApproved ? "green" : "ghost"}
      onClick={onApprove}
      disabled={!hasUnsubscribeAccess}
    >
      <ThumbsUpIcon className={`size-5 ${isApproved ? "" : "text-gray-400"}`} />
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
      <span className="text-muted-foreground">{props.children}</span>
      {props.sorted ? (
        props.sortDirection === "asc" ? (
          <ChevronUpIcon className="ml-2 size-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="ml-2 size-4 text-muted-foreground" />
        )
      ) : (
        <ChevronDownIcon className="ml-2 size-4 text-muted-foreground" />
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
