import { usePostHog } from "posthog-js/react";
import {
  ArchiveIcon,
  BadgeCheckIcon,
  MailMinusIcon,
  TrashIcon,
} from "lucide-react";
import {
  useBulkUnsubscribe,
  useBulkApprove,
  useBulkAutoArchive,
  useBulkArchive,
  useBulkDelete,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useAccount } from "@/providers/EmailAccountProvider";

export function BulkActions({
  selected,
  mutate,
}: {
  selected: Map<string, boolean>;
  // biome-ignore lint/suspicious/noExplicitAny: lazy
  mutate: () => Promise<any>;
}) {
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

  return (
    <>
      <PremiumTooltip showTooltip={!hasUnsubscribeAccess} openModal={openModal}>
        <div className="flex items-center space-x-1.5 mt-2">
          <div>
            <Button
              size="sm"
              variant="default"
              onClick={() => onBulkUnsubscribe(getSelectedValues())}
              loading={bulkUnsubscribeLoading}
            >
              <MailMinusIcon className="mr-2 size-4" />
              Unsubscribe
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const yes = confirm(
                  "Automatically archive all current and future emails from these senders?",
                );
                if (yes) {
                  onBulkAutoArchive(getSelectedValues());
                }
              }}
              loading={bulkAutoArchiveLoading}
            >
              <ArchiveIcon className="mr-2 size-4" />
              Skip Inbox
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkApprove(getSelectedValues())}
              loading={bulkApproveLoading}
            >
              <BadgeCheckIcon className="mr-2 size-4" />
              Approve
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkArchive(getSelectedValues())}
              loading={isBulkArchiving}
            >
              <ArchiveIcon className="mr-2 size-4" />
              Archive All
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkDelete(getSelectedValues())}
              loading={isBulkDeleting}
            >
              <TrashIcon className="mr-2 size-4" />
              Delete All
            </Button>
          </div>
        </div>
      </PremiumTooltip>
      <PremiumModal />
    </>
  );
}
