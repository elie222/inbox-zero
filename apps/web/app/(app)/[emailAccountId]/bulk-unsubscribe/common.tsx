"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { PremiumTooltip } from "@/components/PremiumAlert";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction, deleteFilterAction } from "@/utils/actions/mail";
import { getGmailSearchUrl } from "@/utils/url";
import { extractNameFromEmail } from "@/utils/email";
import { Badge } from "@/components/ui/badge";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useApproveButton,
  useBulkArchive,
  useBulkDelete,
  useBulkAutoArchive,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { ResubscribeDialog } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ResubscribeDialog";
import { LabelsSubMenu } from "@/components/LabelsSubMenu";
import type { EmailLabel } from "@/providers/email-label-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getEmailTerminology } from "@/utils/terminology";
import { Tooltip } from "@/components/Tooltip";

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
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        filter={filter}
        openPremiumModal={openPremiumModal}
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

  // Show Resubscribe button if unsubscribed, otherwise show Unsubscribe/Block button
  const button =
    isUnsubscribed || resubscribeDialogOpen ? (
      <Button
        size="sm"
        variant="outline"
        className="w-[110px] justify-center"
        onClick={() => setResubscribeDialogOpen(true)}
      >
        {unsubscribeLoading && <ButtonLoader />}
        Resubscribe
      </Button>
    ) : (
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
          rel="noopener noreferrer"
        >
          {unsubscribeLoading && <ButtonLoader />}
          {buttonText}
        </Link>
      </Button>
    );

  return (
    <>
      {button}

      <ResubscribeDialog
        open={resubscribeDialogOpen}
        onOpenChange={setResubscribeDialogOpen}
        senderName={senderName}
        newsletterEmail={item.name}
        emailAccountId={emailAccountId}
        mutate={mutate}
      />
    </>
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
    <Tooltip
      content={
        isApproved
          ? "Approved sender. Keep these emails in your inbox."
          : "Approve sender to keep these emails in your inbox."
      }
    >
      <Button
        size="sm"
        variant={isApproved ? "green" : "ghost"}
        onClick={onApprove}
        disabled={!hasUnsubscribeAccess}
      >
        <ThumbsUpIcon
          className={`size-5 ${isApproved ? "" : "text-gray-400"}`}
        />
      </Button>
    </Tooltip>
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
  hasUnsubscribeAccess,
  refetchPremium,
  filter,
  openPremiumModal,
}: {
  onOpenNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  emailAccountId: string;
  labels: EmailLabel[];
  posthog: PostHog;
  mutate: () => Promise<unknown>;
  hasUnsubscribeAccess?: boolean;
  refetchPremium?: () => Promise<UserResponse | null | undefined>;
  filter?: NewsletterFilterType;
  openPremiumModal?: () => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);
  const isMobile = useIsMobile();
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);
  const { onBulkArchive, isBulkArchiving } = useBulkArchive({
    posthog,
    emailAccountId,
    mutate,
  });
  const { onBulkDelete, isBulkDeleting } = useBulkDelete({
    mutate,
    posthog,
    emailAccountId,
  });
  const { onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess: hasUnsubscribeAccess ?? false,
    mutate,
    refetchPremium: refetchPremium ?? noopRefetchPremium,
    emailAccountId,
    filter: filter ?? "all",
  });
  const showAutoArchive = typeof hasUnsubscribeAccess === "boolean";

  const handleLabelClick = async (label: EmailLabel) => {
    const activeFilter = getActiveLabelFilter(item, label);

    if (activeFilter) {
      const res = await deleteFilterAction(emailAccountId, {
        id: activeFilter.id,
      });
      if (res?.serverError) {
        toastError({
          title: "Error",
          description: `Failed to stop labeling ${item.name} as ${label.name}. ${res.serverError || ""}`,
        });
      } else {
        toastSuccess({
          title: "Success!",
          description: `Stopped labeling ${item.name} as ${label.name}`,
        });
        await mutate();
      }
      return;
    }

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
      await mutate();
    }
  };

  const labelMenuLabel = `${terminology.label.action} future emails`;

  return (
    <>
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
          {isMobile ? (
            <DropdownMenuItem onSelect={() => setLabelSheetOpen(true)}>
              <TagIcon className="mr-2 size-4" />
              <span>{labelMenuLabel}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon className="mr-2 size-4" />
                <span>{labelMenuLabel}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <LabelsSubMenu
                  labels={labels}
                  onClick={handleLabelClick}
                  isLabelActive={(label) =>
                    Boolean(getActiveLabelFilter(item, label))
                  }
                />
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />

          {/* Bulk actions section */}
          {showAutoArchive && (
            <DropdownMenuItem
              onClick={() => {
                if (!hasUnsubscribeAccess) {
                  openPremiumModal?.();
                  return;
                }

                onBulkAutoArchive([item]);
              }}
            >
              <ArchiveRestoreIcon className="mr-2 size-4" />
              <span>Auto archive</span>
            </DropdownMenuItem>
          )}
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

      <Sheet open={labelSheetOpen} onOpenChange={setLabelSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>{labelMenuLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 max-h-[60vh] space-y-1 overflow-y-auto">
            {labels.length ? (
              labels.map((label) => {
                const active = Boolean(getActiveLabelFilter(item, label));

                return (
                  <button
                    key={label.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={async () => {
                      setLabelSheetOpen(false);
                      await handleLabelClick(label);
                    }}
                  >
                    <span className="truncate">{label.name}</span>
                    {active && <CheckIcon className="size-4 text-primary" />}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                You don't have any {terminology.label.plural} yet.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
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

async function noopRefetchPremium() {
  return null;
}

function getActiveLabelFilter<T extends Row>(item: T, label: EmailLabel) {
  const labelId = normalizeLabelValue(label.id);
  const labelName = normalizeLabelValue(label.name);

  return item.labelFilters?.find((filter) => {
    if (!filter.id) return false;

    const filterLabelId = normalizeLabelValue(filter.labelId);
    return filterLabelId === labelId || filterLabelId === labelName;
  });
}

function normalizeLabelValue(value: string) {
  return value.trim().toLowerCase();
}
