import { useState } from "react";
import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  Loader2Icon,
  MailMinusIcon,
  ThumbsUpIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useBulkUnsubscribe,
  useBulkApprove,
  useBulkAutoArchive,
  useBulkArchive,
  useBulkDelete,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { extractDomainFromEmail } from "@/utils/email";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

function ActionButton({
  icon: Icon,
  label,
  loadingLabel,
  onClick,
  loading,
  primary,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loadingLabel?: string;
  onClick: () => void;
  loading?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
        primary
          ? "bg-blue-500 text-white hover:bg-blue-600"
          : "text-gray-300 hover:bg-gray-700 hover:text-white",
        danger && "hover:text-red-400",
        loading && "opacity-50 cursor-not-allowed",
      )}
    >
      {loading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  );
}

export function BulkActions({
  selected,
  mutate,
  onClearSelection,
  newsletters,
}: {
  selected: Map<string, boolean>;
  // biome-ignore lint/suspicious/noExplicitAny: matches SWR mutate return type
  mutate: () => Promise<any>;
  onClearSelection: () => void;
  newsletters?: Newsletter[];
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [skipInboxDialogOpen, setSkipInboxDialogOpen] = useState(false);

  const posthog = usePostHog();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();
  const { emailAccountId } = useAccount();
  const { bulkUnsubscribeLoading, onBulkUnsubscribe } = useBulkUnsubscribe({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
  });

  const { bulkApproveLoading, onBulkApprove } = useBulkApprove({
    mutate,
    posthog,
    emailAccountId,
  });

  const { bulkAutoArchiveLoading, onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess,
    mutate,
    refetchPremium,
    emailAccountId,
  });

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

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
          >
            <div
              className="flex justify-center p-4"
              style={{
                paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
              }}
            >
              <PremiumTooltip
                showTooltip={!hasUnsubscribeAccess}
                openModal={openModal}
              >
                <div className="pointer-events-auto bg-gray-900 text-white rounded-xl shadow-2xl shadow-gray-900/20 px-4 py-3 flex items-center gap-3">
                  {/* Selection Count */}
                  <div className="flex items-center gap-2 pr-4 border-r border-gray-700 whitespace-nowrap">
                    <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center text-xs font-semibold">
                      {selectedCount}
                    </div>
                    <span className="text-sm text-gray-300">selected</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 flex-nowrap">
                    <ActionButton
                      icon={MailMinusIcon}
                      label="Unsubscribe"
                      loadingLabel="Unsubscribing"
                      primary
                      onClick={() => onBulkUnsubscribe(getSelectedValues())}
                      loading={bulkUnsubscribeLoading}
                    />
                    <ActionButton
                      icon={ArchiveIcon}
                      label="Skip Inbox"
                      loadingLabel="Skipping"
                      onClick={() => setSkipInboxDialogOpen(true)}
                      loading={bulkAutoArchiveLoading}
                    />
                    <ActionButton
                      icon={ThumbsUpIcon}
                      label="Approve"
                      loadingLabel="Approving"
                      onClick={() => onBulkApprove(getSelectedValues())}
                      loading={bulkApproveLoading}
                    />
                    <ActionButton
                      icon={ArchiveIcon}
                      label="Archive All"
                      loadingLabel="Archiving"
                      onClick={() => onBulkArchive(getSelectedValues())}
                      loading={isBulkArchiving}
                    />
                    <ActionButton
                      icon={TrashIcon}
                      label="Delete All"
                      loadingLabel="Deleting"
                      danger
                      onClick={() => setDeleteDialogOpen(true)}
                      loading={isBulkDeleting}
                    />
                  </div>

                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={onClearSelection}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              </PremiumTooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all emails?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all emails from these senders?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Selected Senders List */}
          {selectedNewsletters.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {selectedNewsletters.map((newsletter) => {
                  const domain =
                    extractDomainFromEmail(newsletter.name) || newsletter.name;
                  return (
                    <div
                      key={newsletter.name}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <DomainIcon domain={domain} size={32} />
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
                  );
                })}
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

      {/* Skip Inbox Confirmation Dialog */}
      <Dialog open={skipInboxDialogOpen} onOpenChange={setSkipInboxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip inbox for these senders?</DialogTitle>
            <DialogDescription>
              Automatically archive all current and future emails from these
              senders. They will no longer appear in your inbox.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSkipInboxDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkAutoArchive(getSelectedValues());
                setSkipInboxDialogOpen(false);
              }}
            >
              Skip Inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PremiumModal />
    </>
  );
}
