import { useCallback, useMemo, useState } from "react";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  MailXIcon,
  MoreHorizontalIcon,
  ThumbsUpIcon,
  TrashIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { DateRange } from "react-day-picker";
import {
  useBulkUnsubscribe,
  useBulkApprove,
  useBulkAutoArchive,
  useBulkArchive,
  useBulkDelete,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import {
  UnsubscribeCelebrationDialog,
  type UnsubscribeCelebration,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/UnsubscribeCelebrationDialog";
import { PremiumTooltip } from "@/components/PremiumAlert";
import { usePremium } from "@/hooks/usePremium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SenderIcon } from "@/components/SenderIcon";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { NewsletterStatus } from "@/generated/prisma/enums";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

function ActionButton({
  icon: Icon,
  label,
  loadingLabel,
  onClick,
  loading,
  primary,
  showLabelOnMobile,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loadingLabel?: string;
  onClick: () => void;
  loading?: boolean;
  primary?: boolean;
  showLabelOnMobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      className={cn(
        "flex h-9 items-center gap-2 px-2.5 sm:px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
        primary
          ? "bg-blue-600 text-white hover:bg-blue-500"
          : "text-foreground hover:bg-muted",
        loading && "opacity-50 cursor-not-allowed",
      )}
    >
      {loading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      <span className={showLabelOnMobile ? undefined : "hidden sm:inline"}>
        {loading && loadingLabel ? loadingLabel : label}
      </span>
    </button>
  );
}

export function BulkActions({
  selected,
  mutate,
  onClearSelection,
  deselectItem,
  newsletters,
  filter,
  dateRange,
}: {
  selected: Map<string, boolean>;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  mutate: () => Promise<any>;
  onClearSelection: () => void;
  deselectItem: (id: string) => void;
  newsletters?: Newsletter[];
  filter: NewsletterFilterType;
  dateRange?: DateRange;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [autoArchiveDialogOpen, setAutoArchiveDialogOpen] = useState(false);
  const [celebration, setCelebration] = useState<UnsubscribeCelebration | null>(
    null,
  );

  const posthog = usePostHog();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();
  const { emailAccountId } = useAccount();
  const onBulkUnsubscribeSuccess = useCallback((items: Newsletter[]) => {
    if (items.length === 0) return;
    setCelebration({
      senderCount: items.length,
      emailCount: items.reduce((sum, item) => sum + item.value, 0),
    });
  }, []);
  const { onBulkUnsubscribe } = useBulkUnsubscribe<Newsletter>({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
    onSuccess: onBulkUnsubscribeSuccess,
  });

  const { onBulkApprove } = useBulkApprove({
    mutate,
    posthog,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
  });

  const { onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess,
    mutate,
    refetchPremium,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
  });

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

  const getSelectedValues = () =>
    Array.from(selected.entries())
      .filter(([, value]) => value)
      .map(([name, value]) => ({
        name,
        value,
      }));

  const selectedCount = Array.from(selected.values()).filter(Boolean).length;
  const isVisible = selectedCount > 0;

  // Get the selected newsletters with their details
  const selectedNewsletters =
    newsletters?.filter((n) => selected.get(n.name)) || [];

  // Check if all selected newsletters are already approved
  const allSelectedAreApproved = useMemo(() => {
    if (selectedNewsletters.length === 0) return false;
    return selectedNewsletters.every(
      (n) => n.status === NewsletterStatus.APPROVED,
    );
  }, [selectedNewsletters]);

  // The selection map can hold senders no longer in the fetched rows (e.g.
  // after a search or date-range change), so only offer unsubscribe when we
  // have full rows to act on.
  const allSelectedCanUnsubscribe =
    selectedNewsletters.length > 0 &&
    selectedNewsletters.every(
      (n) => n.status !== NewsletterStatus.UNSUBSCRIBED,
    );

  const hasUnsubscribeLinks = selectedNewsletters.some((n) =>
    getHttpUnsubscribeLink({ unsubscribeLink: n.unsubscribeLink }),
  );

  const hasBlockableLinks = selectedNewsletters.some(
    (n) => !getHttpUnsubscribeLink({ unsubscribeLink: n.unsubscribeLink }),
  );

  const unsubscribeLabel =
    hasUnsubscribeLinks && hasBlockableLinks
      ? "Unsubscribe/Block"
      : hasBlockableLinks
        ? "Block"
        : "Unsubscribe";

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="sticky bottom-6 z-40 mx-auto mt-4 w-fit max-w-full"
          >
            <PremiumTooltip
              showTooltip={!hasUnsubscribeAccess}
              openModal={openModal}
            >
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl border bg-background py-2 pr-2 pl-3 shadow-lg">
                <button
                  type="button"
                  onClick={onClearSelection}
                  aria-label="Clear selection"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
                <span className="whitespace-nowrap pr-1 text-sm font-medium">
                  {selectedCount}
                  <span className="hidden sm:inline"> selected</span>
                </span>

                <div className="mx-1 h-6 w-px shrink-0 bg-border sm:mx-2" />

                {allSelectedCanUnsubscribe && (
                  <ActionButton
                    icon={MailXIcon}
                    label={unsubscribeLabel}
                    primary
                    showLabelOnMobile
                    onClick={() => onBulkUnsubscribe(selectedNewsletters)}
                  />
                )}
                <ActionButton
                  icon={allSelectedAreApproved ? Undo2Icon : ThumbsUpIcon}
                  label={allSelectedAreApproved ? "Move to review" : "Keep"}
                  onClick={() =>
                    onBulkApprove(getSelectedValues(), allSelectedAreApproved)
                  }
                />
                <ActionButton
                  icon={ArchiveIcon}
                  label="Archive"
                  loadingLabel="Archiving"
                  onClick={() => setArchiveDialogOpen(true)}
                  loading={isBulkArchiving}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      aria-label="More actions"
                    >
                      {isBulkDeleting ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <MoreHorizontalIcon className="size-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top">
                    <DropdownMenuItem
                      onClick={() => setAutoArchiveDialogOpen(true)}
                    >
                      <ArchiveRestoreIcon className="mr-2 size-4" />
                      Auto-archive future emails
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <TrashIcon className="mr-2 size-4" />
                      Delete all emails
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </PremiumTooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all emails?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all emails from these senders.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Selected Senders List */}
          {selectedNewsletters.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {selectedNewsletters.map((newsletter) => (
                  <div
                    key={newsletter.name}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <SenderIcon
                      email={newsletter.name}
                      name={newsletter.fromName}
                      size={32}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm truncate">
                        {newsletter.fromName || newsletter.name}
                      </span>
                      {newsletter.fromName && (
                        <span className="text-xs text-muted-foreground truncate">
                          {newsletter.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onBulkDelete(getSelectedValues());
                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive all emails?</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive all emails from these senders?
            </DialogDescription>
          </DialogHeader>

          {/* Selected Senders List */}
          {selectedNewsletters.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {selectedNewsletters.map((newsletter) => (
                  <div
                    key={newsletter.name}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <SenderIcon
                      email={newsletter.name}
                      name={newsletter.fromName}
                      size={32}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm truncate">
                        {newsletter.fromName || newsletter.name}
                      </span>
                      {newsletter.fromName && (
                        <span className="text-xs text-muted-foreground truncate">
                          {newsletter.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkArchive(getSelectedValues());
                setArchiveDialogOpen(false);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Archive Confirmation Dialog */}
      <Dialog
        open={autoArchiveDialogOpen}
        onOpenChange={setAutoArchiveDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-archive these senders?</DialogTitle>
            <DialogDescription>
              Automatically archive all current and future emails from these
              senders. They will no longer appear in your inbox.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAutoArchiveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkAutoArchive(getSelectedValues());
                setAutoArchiveDialogOpen(false);
              }}
            >
              Auto-archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UnsubscribeCelebrationDialog
        celebration={celebration}
        dateRange={dateRange}
        onClose={() => setCelebration(null)}
      />

      <PremiumModal />
    </>
  );
}
